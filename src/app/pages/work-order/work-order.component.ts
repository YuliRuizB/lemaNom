import { CommonModule, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, forkJoin, map, of, switchMap, take } from 'rxjs';

import { Client, ClientPlant } from '../../interfaces/client.interface';
import { Customer } from '../../interfaces/customer.interface';
import { equipment } from '../../interfaces/meditionType.interface';
import { NormWorkflowStep } from '../../interfaces/norm-workflow-step.interface';
import { nomCategory, nomCategoryServices } from '../../interfaces/nomCategory.interface';
import { User } from '../../interfaces/user.interface';
import {
  WorkOrderImpartiality,
  WorkOrderServiceScheduleItem,
  WorkOrderServiceScheduleActivity,
  workOrder,
  workOrderEquipment,
  workOrderStep,
} from '../../interfaces/workOrder.interface';
import { AuthService } from '../../services/auth.service';
import { ClientService } from '../../services/client.service';
import { CustomerService } from '../../services/customer.service';
import { EquipmentService } from '../../services/equipment.service';
import { NomCategoryService } from '../../services/nom-category.service';
import { NormWorkflowService } from '../../services/norm-workflow.service';
import { NomsService } from '../../services/noms.service';
import { ToastService } from '../../services/toast.service';
import { UserService } from '../../services/user.service';
import { WorkOrderService } from '../../services/work-order.service';
import { EvaluationComponent } from '../evaluation/evaluation.component';
import { InformComponent } from '../inform/inform.component';
import { LightingEvaluationComponent } from '../lighting-evaluation/lighting-evaluation.component';
import { LightingMeasurementsComponent } from '../lighting-measurements/lighting-measurements.component';
import { LightingRecognitionComponent } from '../lighting-recognition/lighting-recognition.component';
import { LightingReviewComponent } from '../lighting-review/lighting-review.component';
import { MeasurementsComponent } from '../measurements/measurements.component';

type WorkOrderView = workOrder & {
  serviceName: string;
  flowStepName: string;
  flowStatusLabel: string;
};

type WorkflowNavigationItem = {
  id: string;
  tabId: string;
  label: string;
  order: number;
  status: workOrderStep['status'] | workOrder['status'];
  statusLabel: string;
};

type WorkOrderServiceScheduleRow = {
  idDoc: string;
  activityKey: WorkOrderServiceScheduleActivity;
  activityLabel: string;
  responsibleUserId: string;
  responsibleUserName: string;
  scheduledDateText: string;
  order: number;
};

@Component({
  selector: 'app-work-order',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DatePipe,
    EvaluationComponent,
    LightingEvaluationComponent,
    LightingMeasurementsComponent,
    LightingRecognitionComponent,
    LightingReviewComponent,
    MeasurementsComponent,
    InformComponent,
  ],
  templateUrl: './work-order.component.html',
  styleUrl: './work-order.component.scss',
})
export class WorkOrderComponent {
  private readonly signatoryRoleId = '97YgNetUGyyC7Bnm2I2Z';
  private authService = inject(AuthService);
  private userService = inject(UserService);
  private nomCategoryService = inject(NomCategoryService);
  private clientService = inject(ClientService);
  private customerService = inject(CustomerService);
  private equipmentService = inject(EquipmentService);
  private normWorkflowService = inject(NormWorkflowService);
  private nomsService = inject(NomsService);
  private toastService = inject(ToastService);
  private workOrderService = inject(WorkOrderService);

  search = signal('');
  dateFilter = signal('');
  normFilter = signal('');
  serviceFilter = signal('');
  stepFilter = signal('');
  assignedFilter = signal('');
  currentPage = signal(1);
  showCreateModal = signal(false);
  isSaving = signal(false);
  currentCustomerName = signal('Empresa actual');
  currentAppUser = signal<User | null>(null);
  sessionCustomer = signal<Customer | null>(null);
  activeCategories = signal<nomCategory[]>([]);
  categoryServices = signal<nomCategoryServices[]>([]);
  createCategoryServices = signal<nomCategoryServices[]>([]);
  activeClients = signal<Client[]>([]);
  availablePlants = signal<ClientPlant[]>([]);
  activeEquipments = signal<equipment[]>([]);
  availableSignatories = signal<User[]>([]);
  selectedWorkOrderEquipments = signal<equipment[]>([]);
  defaultEquipmentId = signal('');
  selectedEquipmentId = signal('');
  isSavingDefaultEquipment = signal(false);
  selectedOrder = signal<WorkOrderView | null>(null);
  selectedOrderWorkflowSteps = signal<workOrderStep[]>([]);
  selectedOrderEquipments = signal<workOrderEquipment[]>([]);
  selectedOrderTab = signal('work-order');
  measurementsTab = signal<'points' | 'correction'>('points');
  selectedDetailEquipmentId = signal('');
  selectedNextAssignedUserId = signal('');
  isAddingSelectedOrderEquipment = signal(false);
  showAddEquipmentModal = signal(false);
  isFinalizingStepId = signal<string | null>(null);
  isSavingNextAssignmentStepId = signal<string | null>(null);
  isDeletingSelectedOrder = signal(false);
  isSavingImpartiality = signal(false);
  selectedOrderPlant = signal<ClientPlant | null>(null);
  selectedOrderObserver = signal('');
  selectedOrderObservationDate = signal('');
  selectedOrderStartTime = signal('');
  selectedOrderEndTime = signal('');
  isSavingObserver = signal(false);
  selectedOrderCableResistance = signal<number | null>(null);
  selectedOrderServiceSchedule = signal<WorkOrderServiceScheduleRow[]>([]);
  isEditingOrder = signal(false);
  isSavingOrderEdit = signal(false);
  editOrderPlants = signal<ClientPlant[]>([]);
  editOrderForm = {
    purchaseOrderNumber: '',
    quotationNumber: '',
    clientId: '',
    clientName: '',
    plantId: '',
    plantName: '',
    signatoryId: '',
    signatoryName: '',
  };

  readonly observerOptions = [
    'Ing. Humberto Pichardo Mena',
    'Lic. Fabiola Monserrat Gutiérrez Tavizon',
    'Ing. Baldomero Gutiérrez González',
  ];
  readonly serviceScheduleActivityTemplates: Array<{
    key: WorkOrderServiceScheduleActivity;
    label: string;
    order: number;
  }> = [
    { key: 'reconocimiento', label: 'Reconocimiento', order: 1 },
    { key: 'medicion', label: 'Medición', order: 2 },
    { key: 'plano', label: 'Plano', order: 3 },
    { key: 'generar_y_revisar_informe', label: 'Generar y revisar informe', order: 4 },
    { key: 'revision_formato_campo', label: 'Revisión del formato de campo', order: 5 },
    { key: 'impresion_informe', label: 'Impresión informe', order: 6 },
    { key: 'entrega_y_facturacion', label: 'Entrega y Facturación', order: 7 },
  ];
  createWorkflowPreview = signal<NormWorkflowStep[]>([]);
  isLoadingCreateWorkflowPreview = signal(false);
  createStepAssignments = signal<Record<string, string>>({});

  setStepAssignment(stepUid: string, userId: string): void {
    this.createStepAssignments.update((a) => ({ ...a, [stepUid]: userId }));
  }
  createImpartiality: WorkOrderImpartiality = this.buildEmptyImpartiality();
  readonly pageSize = 8;
  readonly impartialityQuestions: Array<{
    key: keyof Pick<
      WorkOrderImpartiality,
      | 'familiarAffinity'
      | 'bloodRelationship'
      | 'friendshipRelationship'
      | 'commercialInterest'
      | 'economicInterest'
      | 'intimidation'
      | 'serviceImpartialityRisk'
    >;
    label: string;
  }> = [
    {
      key: 'familiarAffinity',
      label: '¿Existe relación familiar por afinidad entre el cliente y el signatario asignado?',
    },
    {
      key: 'bloodRelationship',
      label:
        '¿Existe relación familiar por consanguinidad hasta el cuarto grado en línea recta o colateral entre el cliente y el signatario asignado?',
    },
    {
      key: 'friendshipRelationship',
      label: '¿Existe alguna relación de amistad entre el cliente y el signatario asignado?',
    },
    {
      key: 'commercialInterest',
      label: '¿Existe algún interés comercial entre el cliente y el signatario asignado?',
    },
    {
      key: 'economicInterest',
      label: '¿Existe algún interés económico entre el cliente y el signatario asignado?',
    },
    {
      key: 'intimidation',
      label: '¿Existe intimidación por parte de los involucrados?',
    },
    {
      key: 'serviceImpartialityRisk',
      label: '¿Existe algún riesgo de imparcialidad en el servicio?',
    },
  ];

  createForm = {
    code: 'OSO-FOR-FG-006',
    createdAt: this.toDateInputValue(new Date()),
    evaluationNumber: '4-2022/5/13',
    workOrderNumber: '',
    clientId: '',
    clientName: '',
    plantId: '',
    plantName: '',
    contactName: '',
    contactPhone: '',
    shiftsLabel: '',
    street: '',
    exteriorNumber: '',
    colony: '',
    municipality: '',
    state: '',
    country: '',
    postalCode: '',
    nomCategoryId: '',
    nomCategoryName: '',
    nomCategoryServiceId: '',
    nomCategoryServiceName: '',
    nomId: '',
    nomName: '',
    signatoryId: '',
    signatoryName: '',
    informNumber: '',
    purchaseOrderNumber: '',
    quotationNumber: '',
  };

  readonly workOrders = signal<WorkOrderView[]>([]);

  readonly availableServices = computed(() =>
    this.categoryServices()
      .filter((service) => service.active)
      .map((service) => service.name)
      .sort((a, b) => a.localeCompare(b))
  );

  readonly availableStepNames = computed(() => {
    const categoryId = this.normFilter().trim();
    const service = this.serviceFilter().trim();
    if (!service) return [];
    const names = new Set<string>();
    this.workOrders()
      .filter((o) =>
        (!categoryId || o.nomCategoryId === categoryId) &&
        (o.nomCategoryServiceName === service || o.serviceName === service)
      )
      .forEach((o) => { if (o.flowStepName) names.add(o.flowStepName); });
    return [...names].sort((a, b) => a.localeCompare(b));
  });

  readonly availableAssignees = computed(() => {
    const names = new Set<string>();
    this.workOrders().forEach((o) => { if (o.signatoryName) names.add(o.signatoryName); });
    return [...names].sort((a, b) => a.localeCompare(b));
  });

  readonly availableEquipmentsForSelectedOrder = computed(() => {
    const selectedIds = new Set(this.selectedOrderEquipments().map((item) => item.equipmentId));
    return this.activeEquipments().filter((item) => !selectedIds.has(item.idDoc));
  });

  readonly detailWorkflowTabs = computed(() =>
    [...this.selectedOrderWorkflowSteps()]
      .sort((a, b) => a.order - b.order)
      .filter((step) => !this.isWorkOrderStep(step))
  );

  readonly workflowNavigationItems = computed<WorkflowNavigationItem[]>(() => {
    const items: WorkflowNavigationItem[] = [];
    const workOrderStep = this.workOrderTabStep();

    items.push({
      id: 'work-order',
      tabId: 'work-order',
      label: 'Orden de trabajo',
      order: workOrderStep?.order ?? 1,
      status: workOrderStep?.status ?? this.selectedOrder()?.status ?? 'pending',
      statusLabel: this.getStatusLabel(workOrderStep?.status ?? this.selectedOrder()?.status ?? 'pending'),
    });

    this.detailWorkflowTabs().forEach((step) => {
      items.push({
        id: step.idDoc,
        tabId: `step:${step.idDoc}`,
        label: step.stepName,
        order: step.order,
        status: step.status,
        statusLabel: this.getStatusLabel(step.status),
      });
    });

    return items.sort((a, b) => a.order - b.order);
  });

  readonly selectedWorkflowTabStep = computed(() => {
    const selectedTab = this.selectedOrderTab();
    if (!selectedTab.startsWith('step:')) {
      return null;
    }

    const stepId = selectedTab.slice(5);
    return this.detailWorkflowTabs().find((step) => step.idDoc === stepId) || null;
  });

  readonly workOrderTabStep = computed(() => {
    const sortedSteps = [...this.selectedOrderWorkflowSteps()].sort((a, b) => a.order - b.order);
    return sortedSteps.find((step) => this.isWorkOrderStep(step)) || null;
  });

  readonly isSelectedOrderDetailEditable = computed(() => {
    const order = this.selectedOrder();
    if (!order || order.status === 'completed' || order.status === 'cancelled') {
      return false;
    }
    const step2 = this.detailWorkflowTabs()[0];
    if (!step2) {
      return this.workOrderTabStep()?.status === 'in-progress';
    }
    return step2.status === 'pending';
  });

  readonly editBlockReason = computed((): string | null => {
    const order = this.selectedOrder();
    if (!order) return null;
    if (order.status === 'completed') return 'La orden de trabajo ya fue completada y no puede modificarse.';
    if (order.status === 'cancelled') return 'La orden de trabajo fue cancelada y no puede modificarse.';
    const step2 = this.detailWorkflowTabs()[0];
    if (step2 && step2.status !== 'pending') {
      return 'No se puede editar la orden de trabajo porque ya inició la medición.';
    }
    return null;
  });

  private guardEditable(): boolean {
    if (this.isSelectedOrderDetailEditable()) return true;
    const reason = this.editBlockReason();
    if (reason) this.toastService.warning(reason);
    return false;
  }

  readonly selectedWorkflowNavIndex = computed(() =>
    this.workflowNavigationItems().findIndex((item) => item.tabId === this.selectedOrderTab())
  );

  readonly completedWorkflowStepsCount = computed(
    () => this.workflowNavigationItems().filter((item) => item.status === 'completed').length
  );

  readonly workflowStepCount = computed(() => this.workflowNavigationItems().length);
  readonly assignableWorkflowUsers = computed(() => {
    const users = [...this.availableSignatories()];
    const currentUser = this.currentAppUser();
    if (currentUser && !users.some((user) => user.idDoc === currentUser.idDoc)) {
      users.unshift(currentUser);
    }

    return users.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
  });

  readonly shouldRenderEvaluationStep = computed(
    () => this.selectedWorkflowTabStep()?.workflowId === 'nCAIWDf7VFdbVppNMdCt'
  );

  readonly shouldRenderLightingRecognitionStep = computed(
    () => this.selectedWorkflowTabStep()?.stepName.trim().toLowerCase() === 'reconocimiento iluminación'
  );

  readonly shouldRenderLightingEvaluationStep = computed(
    () => this.selectedWorkflowTabStep()?.stepName.trim().toLowerCase() === 'evaluación iluminación'
  );

  readonly shouldRenderLightingMeasurementsStep = computed(
    () => this.selectedWorkflowTabStep()?.stepName.trim().toLowerCase() === 'medición iluminación'
  );

  readonly shouldRenderLightingReviewStep = computed(
    () => this.selectedWorkflowTabStep()?.stepName.trim().toLowerCase() === 'revisión iluminacion'
  );

  readonly shouldRenderMeasurementsStep = computed(
    () => this.selectedWorkflowTabStep()?.workflowId === 'ZHvnk9BPyKO6c4mJot5A'
  );

  readonly shouldRenderInformStep = computed(
    () => this.selectedWorkflowTabStep()?.workflowId === 'lB6BmPJ0QUeHdh6VAt1v'
  );

  readonly shouldHideCableResistanceInDetail = computed(() => {
    const order = this.selectedOrder();
    if (!order) return false;

    const category = this.normalizeText(order.nomCategoryName || '');
    const service = this.normalizeText(order.serviceName || order.nomCategoryServiceName || '');

    return category === 'laboratorio' && service === 'iluminacion';
  });

  readonly shouldHideOrderTimesInDetail = computed(() => {
    const order = this.selectedOrder();
    if (!order) return false;

    const service = this.normalizeText(order.serviceName || order.nomCategoryServiceName || '');
    return service === 'medicion de tierras';
  });

  readonly filteredWorkOrders = computed(() => {
    const term = this.search().trim().toLowerCase();
    const selectedDate = this.dateFilter();
    const selectedCategoryId = this.normFilter().trim();
    const selectedService = this.serviceFilter().trim();
    const selectedStep = this.stepFilter().trim();
    const selectedAssigned = this.assignedFilter().trim();

    return this.workOrders().filter((order) => {
      const matchesSearch =
        !term ||
        [
          order.workOrderNumber,
          order.informNumber,
          order.purchaseOrderNumber,
          order.quotationNumber ?? '',
          order.code,
          order.nomCategoryName ?? '',
          order.serviceName,
        ].some((value) => value.toLowerCase().includes(term));
      const matchesDate = !selectedDate || this.toDateInputValue(order.createdAt) === selectedDate;
      const matchesCategory = !selectedCategoryId || order.nomCategoryId === selectedCategoryId;
      const matchesService =
        !selectedService ||
        order.nomCategoryServiceName === selectedService ||
        order.serviceName === selectedService;
      const matchesStep = !selectedStep || order.flowStepName === selectedStep;
      const matchesAssigned = !selectedAssigned || order.signatoryName === selectedAssigned;

      return matchesSearch && matchesDate && matchesCategory && matchesService && matchesStep && matchesAssigned;
    });
  });

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredWorkOrders().length / this.pageSize))
  );

  readonly pagedWorkOrders = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.filteredWorkOrders().slice(start, start + this.pageSize);
  });

  constructor() {
    this.loadCurrentCustomerName();
    this.loadActiveCategories();
    this.loadActiveClients();
    this.loadActiveEquipments();
    this.loadAvailableSignatories();
    this.loadWorkOrders();
  }

  onDateFilterChange(value: string): void {
    this.dateFilter.set(value);
    this.currentPage.set(1);
  }

  onSearch(term: string): void {
    this.search.set(term);
    this.currentPage.set(1);
  }

  onNormFilterChange(value: string): void {
    this.normFilter.set(value);
    this.serviceFilter.set('');
    this.stepFilter.set('');
    this.currentPage.set(1);
    this.loadCategoryServices(value);
  }

  onServiceFilterChange(value: string): void {
    this.serviceFilter.set(value);
    this.stepFilter.set('');
    this.currentPage.set(1);
  }

  onStepFilterChange(value: string): void {
    this.stepFilter.set(value);
    this.currentPage.set(1);
  }

  onAssignedFilterChange(value: string): void {
    this.assignedFilter.set(value);
    this.currentPage.set(1);
  }

  prevPage(): void {
    this.currentPage.update((page) => Math.max(1, page - 1));
  }

  nextPage(): void {
    this.currentPage.update((page) => Math.min(this.totalPages(), page + 1));
  }

  exportToCsv(): void {
    const datePipe = new DatePipe('es-MX');
    const headers = [
      'No. OT', 'No. Informe', 'Fecha emisión', 'Asignado a',
      'Categoría', 'Servicio', 'Clave', 'Razón social',
      'OC', 'Cotización', 'Flujo', 'Status',
    ];

    const rows = this.filteredWorkOrders().map((o) => [
      o.workOrderNumber,
      o.informNumber,
      datePipe.transform(o.createdAt, 'dd/MM/yyyy') ?? '',
      o.userAssignedName ?? '',
      o.nomCategoryName ?? '',
      o.serviceName ?? '',
      o.code,
      o.clientName ?? '',
      o.purchaseOrderNumber ?? '',
      o.quotationNumber ?? '',
      o.flowStepName ?? '',
      o.status === 'pending'     ? 'Por iniciar'  :
      o.status === 'in-progress' ? 'En progreso'  :
      o.status === 'completed'   ? 'Completada'   : 'Cancelada',
    ]);

    const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [headers, ...rows].map((r) => r.map(escape).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `ordenes_trabajo_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  openCreateModal(): void {
    this.createForm = {
      code: 'OSO-FOR-FG-006',
      createdAt: this.toDateInputValue(new Date()),
      evaluationNumber: '4-2022/5/13',
      workOrderNumber: '',
      clientId: '',
      clientName: '',
      plantId: '',
      plantName: '',
      contactName: '',
      contactPhone: '',
      shiftsLabel: '',
      street: '',
      exteriorNumber: '',
      colony: '',
      municipality: '',
      state: '',
      country: '',
      postalCode: '',
      nomCategoryId: '',
      nomCategoryName: '',
      nomCategoryServiceId: '',
      nomCategoryServiceName: '',
      nomId: '',
      nomName: '',
      signatoryId: '',
      signatoryName: '',
      informNumber: '',
      purchaseOrderNumber: '',
      quotationNumber: '',
    };
    this.availablePlants.set([]);
    this.createCategoryServices.set([]);
    this.selectedWorkOrderEquipments.set([]);
    this.selectedEquipmentId.set('');
    this.defaultEquipmentId.set('');
    this.createWorkflowPreview.set([]);
    this.isLoadingCreateWorkflowPreview.set(false);
    this.createImpartiality = this.buildEmptyImpartiality();
    this.showCreateModal.set(true);
  }

  closeCreateModal(): void {
    this.showCreateModal.set(false);
  }

  saveWorkOrder(): void {
    const currentUser = this.currentAppUser();
    if (!currentUser) {
      this.toastService.error('No fue posible identificar el usuario en sesión.');
      return;
    }

    const validationMessage = this.validateCreateForm();
    if (validationMessage) {
      this.toastService.warning(validationMessage);
      return;
    }

    const payload = this.buildWorkOrderPayload(currentUser);
    if (!payload) {
      this.toastService.error('No fue posible construir la orden de trabajo.');
      return;
    }

    this.isSaving.set(true);
    this.workOrderService.createWorkOrder(payload).subscribe({
      next: (idDoc) => {
        this.createWorkflowStepsIfPossible(idDoc, payload, currentUser);
      },
      error: (error) => {
        console.error('Error creating work order', error);
        this.isSaving.set(false);
        this.toastService.error('No fue posible guardar la orden de trabajo.');
      },
    });
  }

  addEquipmentToWorkOrder(equipmentId: string): void {
    if (!equipmentId) return;
    if (this.selectedWorkOrderEquipments().length >= 3) return;

    const equipmentItem = this.activeEquipments().find((item) => item.idDoc === equipmentId);
    if (!equipmentItem) return;

    const alreadySelected = this.selectedWorkOrderEquipments().some((item) => item.idDoc === equipmentId);
    if (alreadySelected) {
      this.selectedEquipmentId.set('');
      return;
    }

    this.selectedWorkOrderEquipments.update((items) => [...items, equipmentItem]);
    if (!this.defaultEquipmentId()) {
      this.defaultEquipmentId.set(equipmentId);
    }
    this.selectedEquipmentId.set('');
  }

  removeEquipmentFromWorkOrder(equipmentId: string): void {
    this.selectedWorkOrderEquipments.update((items) =>
      items.filter((item) => item.idDoc !== equipmentId)
    );
    if (this.defaultEquipmentId() === equipmentId) {
      const remaining = this.selectedWorkOrderEquipments();
      this.defaultEquipmentId.set(remaining[0]?.idDoc ?? '');
    }
  }

  setCreateDefaultEquipment(equipmentId: string): void {
    this.defaultEquipmentId.set(equipmentId);
  }

  setDefaultEquipmentForSelectedOrder(equipmentId: string): void {
    const order = this.selectedOrder();
    if (!order || this.isSavingDefaultEquipment() || !this.guardEditable()) return;

    const allIds = this.selectedOrderEquipments().map((e) => e.idDoc);
    this.isSavingDefaultEquipment.set(true);
    this.workOrderService.setDefaultEquipment(order.idDoc, equipmentId, allIds).subscribe({
      next: () => {
        this.selectedOrderEquipments.update((items) =>
          items.map((e) => ({ ...e, isDefault: e.idDoc === equipmentId }))
        );
        this.isSavingDefaultEquipment.set(false);
        this.toastService.success('Equipo principal actualizado.');
      },
      error: () => {
        this.isSavingDefaultEquipment.set(false);
        this.toastService.error('No fue posible cambiar el equipo principal.');
      },
    });
  }

  selectWorkOrder(order: WorkOrderView): void {
    this.selectedOrder.set({
      ...order,
      impartiality: {
        ...this.buildEmptyImpartiality(),
        ...(order.impartiality ?? {}),
      },
    });
    this.selectedOrderTab.set(this.getDetailDefaultTab(order));
    this.selectedDetailEquipmentId.set('');
    this.selectedNextAssignedUserId.set(this.currentAppUser()?.idDoc || order.userAssignedId || '');
    this.selectedOrderPlant.set(null);
    this.selectedOrderObserver.set(order.observerName || '');
    this.selectedOrderObservationDate.set(order.observationDate ? this.toDateInputValue(order.observationDate) : '');
    this.selectedOrderStartTime.set(order.startTime || '');
    this.selectedOrderEndTime.set(order.endTime || '');
    this.selectedOrderCableResistance.set(order.cableResistance ?? null);
    this.selectedOrderServiceSchedule.set(this.buildDefaultServiceScheduleRows());
    this.loadSelectedOrderDetail(order);
    if (order.clientId && order.plantId) {
      this.clientService.getClientPlantById(order.clientId, order.plantId).pipe(take(1)).subscribe({
        next: (plant) => this.selectedOrderPlant.set(plant),
        error: () => {},
      });
    }
  }

  addEquipmentToSelectedOrder(equipmentId: string): void {
    const order = this.selectedOrder();
    if (!order || !equipmentId || this.isAddingSelectedOrderEquipment() || !this.guardEditable()) {
      return;
    }

    if (this.selectedOrderEquipments().length >= 3) {
      this.toastService.warning('Solo se permiten hasta 3 equipos por orden.');
      return;
    }

    const equipmentItem = this.activeEquipments().find((item) => item.idDoc === equipmentId);
    if (!equipmentItem) {
      this.toastService.warning('Selecciona un equipo válido.');
      return;
    }

    const alreadyExists = this.selectedOrderEquipments().some(
      (item) => item.equipmentId === equipmentId
    );
    if (alreadyExists) {
      this.selectedDetailEquipmentId.set('');
      this.toastService.warning('Ese equipo ya está asociado a la orden.');
      return;
    }

    this.isAddingSelectedOrderEquipment.set(true);
    this.workOrderService.createEquipments(order.idDoc, [equipmentItem]).subscribe({
      next: () => {
        this.selectedDetailEquipmentId.set('');
        this.showAddEquipmentModal.set(false);
        this.loadSelectedOrderDetail(order, () => {
          this.isAddingSelectedOrderEquipment.set(false);
          this.toastService.success('El equipo se agregó a la orden de trabajo.');
        });
      },
      error: (error) => {
        console.error('Error adding equipment to work order', error);
        this.isAddingSelectedOrderEquipment.set(false);
        this.toastService.error('No fue posible agregar el equipo a la orden de trabajo.');
      },
    });
  }

  closeSelectedOrder(): void {
    this.selectedOrder.set(null);
    this.selectedOrderWorkflowSteps.set([]);
    this.selectedOrderEquipments.set([]);
    this.selectedOrderTab.set('work-order');
    this.selectedDetailEquipmentId.set('');
    this.selectedNextAssignedUserId.set('');
    this.isAddingSelectedOrderEquipment.set(false);
    this.isFinalizingStepId.set(null);
    this.isDeletingSelectedOrder.set(false);
    this.selectedOrderPlant.set(null);
    this.selectedOrderObserver.set('');
    this.selectedOrderObservationDate.set('');
    this.selectedOrderStartTime.set('');
    this.selectedOrderEndTime.set('');
    this.selectedOrderCableResistance.set(null);
    this.selectedOrderServiceSchedule.set([]);
    this.isSavingObserver.set(false);
    this.isEditingOrder.set(false);
    this.editOrderPlants.set([]);
  }

  startEditOrder(): void {
    const order = this.selectedOrder();
    if (!order || !this.isSelectedOrderDetailEditable()) return;
    this.editOrderForm = {
      purchaseOrderNumber: order.purchaseOrderNumber || '',
      quotationNumber: order.quotationNumber || '',
      clientId: order.clientId || '',
      clientName: order.clientName || '',
      plantId: order.plantId || '',
      plantName: order.plantName || '',
      signatoryId: order.signatoryId || '',
      signatoryName: order.signatoryName || '',
    };
    this.editOrderPlants.set([]);
    if (order.clientId) {
      this.clientService.getClientPlants(order.clientId).pipe(take(1)).subscribe({
        next: (plants) => this.editOrderPlants.set(plants),
        error: () => {},
      });
    }
    this.isEditingOrder.set(true);
  }

  cancelEditOrder(): void {
    this.isEditingOrder.set(false);
    this.editOrderPlants.set([]);
  }

  onEditOrderClientChange(clientId: string): void {
    const client = this.activeClients().find((c) => c.idDoc === clientId);
    this.editOrderForm.clientId = clientId;
    this.editOrderForm.clientName = client?.name || '';
    this.editOrderForm.plantId = '';
    this.editOrderForm.plantName = '';
    this.editOrderPlants.set([]);
    if (clientId) {
      this.clientService.getClientPlants(clientId).pipe(take(1)).subscribe({
        next: (plants) => this.editOrderPlants.set(plants),
        error: () => {},
      });
    }
  }

  onEditOrderPlantChange(plantId: string): void {
    const plant = this.editOrderPlants().find((p) => p.idDoc === plantId);
    this.editOrderForm.plantId = plantId;
    this.editOrderForm.plantName = plant?.name || '';
  }

  onEditOrderSignatoryChange(signatoryId: string): void {
    const user = this.availableSignatories().find((u) => u.idDoc === signatoryId);
    this.editOrderForm.signatoryId = signatoryId;
    this.editOrderForm.signatoryName = user ? this.getReadableUserName(user) : '';
  }

  saveEditOrder(): void {
    const order = this.selectedOrder();
    if (!order || this.isSavingOrderEdit() || !this.guardEditable()) return;

    const f = this.editOrderForm;
    if (!f.purchaseOrderNumber?.trim()) {
      this.toastService.warning('El número de orden de compra es obligatorio.');
      return;
    }
    if (!f.clientId) {
      this.toastService.warning('Debes seleccionar un cliente.');
      return;
    }
    if (!f.plantId) {
      this.toastService.warning('Debes seleccionar una planta.');
      return;
    }
    if (!f.signatoryId) {
      this.toastService.warning('Debes seleccionar un signatario.');
      return;
    }

    this.isSavingOrderEdit.set(true);
    const updates: Partial<workOrder> = {
      purchaseOrderNumber: this.editOrderForm.purchaseOrderNumber,
      quotationNumber: this.editOrderForm.quotationNumber,
      clientId: this.editOrderForm.clientId,
      clientName: this.editOrderForm.clientName,
      plantId: this.editOrderForm.plantId,
      plantName: this.editOrderForm.plantName,
      signatoryId: this.editOrderForm.signatoryId,
      signatoryName: this.editOrderForm.signatoryName,
    };

    this.workOrderService.updateWorkOrder(order.idDoc, updates).subscribe({
      next: () => {
        const updated = { ...order, ...updates };
        this.selectedOrder.set(updated);
        this.workOrders.update((items) =>
          items.map((item) => (item.idDoc === order.idDoc ? { ...item, ...updates } : item))
        );
        if (updates.clientId && updates.plantId) {
          this.clientService
            .getClientPlantById(updates.clientId, updates.plantId)
            .pipe(take(1))
            .subscribe({ next: (plant) => this.selectedOrderPlant.set(plant), error: () => {} });
        }
        this.isSavingOrderEdit.set(false);
        this.isEditingOrder.set(false);
        this.editOrderPlants.set([]);
        this.toastService.success('La orden de trabajo se actualizó correctamente.');
      },
      error: () => {
        this.isSavingOrderEdit.set(false);
        this.toastService.error('No fue posible actualizar la orden de trabajo.');
      },
    });
  }

  selectWorkflowTab(tabId: string): void {
    this.selectedOrderTab.set(tabId);
    const sortedSteps = [...this.selectedOrderWorkflowSteps()].sort((a, b) => a.order - b.order);
    const step =
      tabId === 'work-order'
        ? sortedSteps.find((item) => this.isWorkOrderStep(item)) || null
        : sortedSteps.find((item) => `step:${item.idDoc}` === tabId) || null;
    this.prefillNextAssignedUserId(step);
  }

  getNextWorkflowStep(step: workOrderStep): workOrderStep | null {
    const sortedSteps = [...this.selectedOrderWorkflowSteps()].sort((a, b) => a.order - b.order);
    const currentIndex = sortedSteps.findIndex((item) => item.idDoc === step.idDoc);
    return currentIndex >= 0 ? sortedSteps[currentIndex + 1] || null : null;
  }

  prefillNextAssignedUserId(step?: workOrderStep | null): void {
    const nextStep = step ? this.getNextWorkflowStep(step) : null;
    const fallbackUserId = this.currentAppUser()?.idDoc || this.selectedOrder()?.userAssignedId || '';
    this.selectedNextAssignedUserId.set(nextStep?.assignedUserId || fallbackUserId);
  }

  getSelectedNextAssignedUserName(): string | undefined {
    const selectedId = this.selectedNextAssignedUserId();
    const user = this.assignableWorkflowUsers().find((item) => item.idDoc === selectedId);
    return user ? this.getReadableUserName(user) : undefined;
  }

  saveNextWorkflowAssignment(step: workOrderStep): void {
    const order = this.selectedOrder();
    const nextStep = this.getNextWorkflowStep(step);
    const selectedUserId = this.selectedNextAssignedUserId();

    if (!order || !nextStep || this.isSavingNextAssignmentStepId()) {
      return;
    }

    if (!selectedUserId) {
      this.toastService.warning('Selecciona a quién se asignará el siguiente paso.');
      return;
    }

    const selectedUserName =
      this.getSelectedNextAssignedUserName() ||
      this.assignableWorkflowUsers().find((user) => user.idDoc === selectedUserId)?.displayName ||
      '';

    this.isSavingNextAssignmentStepId.set(step.idDoc);
    this.workOrderService
      .updateWorkflowStepAssignment(order.idDoc, nextStep.idDoc, {
        id: selectedUserId,
        name: selectedUserName,
      })
      .subscribe({
        next: () => {
          this.selectedOrderWorkflowSteps.update((steps) =>
            steps.map((item) =>
              item.idDoc === nextStep.idDoc
                ? {
                    ...item,
                    assignedUserId: selectedUserId,
                    assignedUserName: selectedUserName,
                  }
                : item
            )
          );
          this.isSavingNextAssignmentStepId.set(null);
          this.toastService.success('La asignación del siguiente paso se guardó correctamente.');
        },
        error: () => {
          this.isSavingNextAssignmentStepId.set(null);
          this.toastService.error('No fue posible guardar la asignación del siguiente paso.');
        },
      });
  }

  goToPreviousWorkflowTab(): void {
    const currentIndex = this.selectedWorkflowNavIndex();
    if (currentIndex <= 0) {
      return;
    }

    this.selectedOrderTab.set(this.workflowNavigationItems()[currentIndex - 1].tabId);
  }

  goToNextWorkflowTab(): void {
    const currentIndex = this.selectedWorkflowNavIndex();
    const items = this.workflowNavigationItems();
    if (currentIndex < 0 || currentIndex >= items.length - 1) {
      return;
    }

    this.selectedOrderTab.set(items[currentIndex + 1].tabId);
  }

  getImpartialityAnswerLabel(value: boolean | null | undefined): string {
    if (value === true) {
      return 'Si';
    }

    if (value === false) {
      return 'No';
    }

    return 'Pendiente';
  }

  updateSelectedOrderImpartialityAnswer(
    key: keyof Pick<
      WorkOrderImpartiality,
      | 'familiarAffinity'
      | 'bloodRelationship'
      | 'friendshipRelationship'
      | 'commercialInterest'
      | 'economicInterest'
      | 'intimidation'
      | 'serviceImpartialityRisk'
    >,
    value: boolean | null
  ): void {
    const order = this.selectedOrder();
    if (!order || !this.isSelectedOrderDetailEditable()) {
      return;
    }

    const impartiality: WorkOrderImpartiality = {
      ...this.buildEmptyImpartiality(),
      ...(order.impartiality ?? {}),
      [key]: value,
      observations: order.impartiality?.observations ?? '',
    };

    this.selectedOrder.set({
      ...order,
      impartiality,
    });
  }

  updateSelectedOrderImpartialityObservations(value: string): void {
    const order = this.selectedOrder();
    if (!order || !this.isSelectedOrderDetailEditable()) {
      return;
    }

    const impartiality: WorkOrderImpartiality = {
      ...this.buildEmptyImpartiality(),
      ...(order.impartiality ?? {}),
      observations: value,
    };

    this.selectedOrder.set({
      ...order,
      impartiality,
    });
  }

  saveSelectedOrderImpartiality(): void {
    const order = this.selectedOrder();
    if (!order || this.isSavingImpartiality() || !this.guardEditable()) {
      return;
    }

    const impartiality: WorkOrderImpartiality = {
      ...this.buildEmptyImpartiality(),
      ...(order.impartiality ?? {}),
      observations: order.impartiality?.observations?.trim() || '',
    };

    this.isSavingImpartiality.set(true);
    this.workOrderService.updateWorkOrder(order.idDoc, { impartiality }).subscribe({
      next: () => {
        this.selectedOrder.set({ ...order, impartiality });
        this.workOrders.update((items) =>
          items.map((item) => (item.idDoc === order.idDoc ? { ...item, impartiality } : item))
        );
        this.isSavingImpartiality.set(false);
        this.toastService.success('La gestión de imparcialidad se actualizó correctamente.');
      },
      error: (error) => {
        console.error('Error updating work order impartiality', error);
        this.isSavingImpartiality.set(false);
        this.toastService.error('No fue posible actualizar la gestión de imparcialidad.');
      },
    });
  }

  finalizeSelectedOrderStep(step: workOrderStep): void {
    const order = this.selectedOrder();
    if (!order || step.status !== 'in-progress' || this.isFinalizingStepId()) {
      return;
    }

    const nextStep = this.getNextWorkflowStep(step);
    const nextAssignedUserId = this.selectedNextAssignedUserId() || this.currentAppUser()?.idDoc || '';
    const nextAssignedUserName =
      this.getSelectedNextAssignedUserName() ||
      (this.currentAppUser() ? this.getReadableUserName(this.currentAppUser()) : '');

    if (!this.selectedOrderObserver().trim()) {
      this.toastService.warning('Debes registrar el observador antes de completar la orden.');
      return;
    }

    if (!this.selectedOrderObservationDate()) {
      this.toastService.warning('Debes registrar la fecha del observador antes de completar la orden.');
      return;
    }

    const cable = this.selectedOrderCableResistance();
    if (!this.shouldHideCableResistanceInDetail() && (cable == null || isNaN(Number(cable)))) {
      this.toastService.warning('Debes registrar el valor de resistencia de los cables antes de completar la orden.');
      return;
    }

    const isMeasurementsStep = step.workflowId === 'ZHvnk9BPyKO6c4mJot5A';
    if (isMeasurementsStep) {
      const sig = step.clientVisitSignature;
      if (!sig?.confirmedVisit || !sig?.signedByName?.trim() || !sig?.signatureDataUrl) {
        this.toastService.warning('Debes completar la confirmación de visita con firma del cliente antes de completar la orden.');
        return;
      }
    }

    if (nextStep && !nextAssignedUserId) {
      this.toastService.warning('Selecciona a quién se asignará el siguiente paso.');
      return;
    }

    this.isFinalizingStepId.set(step.idDoc);
    this.workOrderService
      .finalizeWorkflowStep(
        order.idDoc,
        step.idDoc,
        nextStep || undefined,
        {
          id: nextAssignedUserId,
          name: nextAssignedUserName,
        },
        {
          id: this.currentAppUser()?.idDoc,
          name: this.currentAppUser() ? this.getReadableUserName(this.currentAppUser()) : undefined,
        },
        !nextStep
      )
      .subscribe({
        next: () => {
          this.workOrderService
            .getWorkOrders()
            .pipe(take(1))
            .subscribe({
              next: (workOrders) => {
                this.enrichAndSetWorkOrders(workOrders, () => {
                  const refreshedOrder = this.selectedOrder();
                  if (refreshedOrder) {
                    this.loadSelectedOrderDetail(refreshedOrder, () => {
                      this.prefillNextAssignedUserId();
                      this.isFinalizingStepId.set(null);
                      this.toastService.success('El paso del flujo se actualizó correctamente.');
                    });
                    return;
                  }

                  this.isFinalizingStepId.set(null);
                  this.toastService.success('El paso del flujo se actualizó correctamente.');
                });
              },
              error: (error) => {
                console.error('Error refreshing work orders after finalizing step', error);
                this.isFinalizingStepId.set(null);
                this.toastService.error('Se actualizó el paso, pero no fue posible refrescar la vista.');
              },
            });
        },
        error: (error) => {
          console.error('Error finalizing workflow step', error);
          this.isFinalizingStepId.set(null);
          this.toastService.error('No fue posible finalizar el paso actual.');
        },
      });
  }

  deleteSelectedOrder(): void {
    const order = this.selectedOrder();
    if (!order || this.isDeletingSelectedOrder()) {
      return;
    }

    const confirmed = window.confirm(
      `¿Deseas eliminar la orden de trabajo ${order.workOrderNumber}?`
    );

    if (!confirmed) {
      return;
    }

    this.isDeletingSelectedOrder.set(true);

    this.workOrderService.deleteWorkOrder(order.idDoc).subscribe({
      next: () => {
        this.workOrders.update((items) => items.filter((item) => item.idDoc !== order.idDoc));
        this.closeSelectedOrder();
        this.toastService.success('La orden de trabajo se eliminó correctamente.');
      },
      error: (error) => {
        console.error('Error deleting work order', error);
        this.isDeletingSelectedOrder.set(false);
        this.toastService.error('No fue posible eliminar la orden de trabajo.');
      },
    });
  }

  onCreateSignatoryChange(userId: string): void {
    const selectedUser =
      this.availableSignatories().find((user) => user.idDoc === userId) || null;

    this.createForm = {
      ...this.createForm,
      signatoryId: selectedUser?.idDoc || '',
      signatoryName: selectedUser?.displayName || '',
    };
  }

  onCreateCategoryChange(categoryId: string): void {
    const selectedCategory =
      this.activeCategories().find((category) => category.idDoc === categoryId) || null;

    this.createForm = {
      ...this.createForm,
      nomCategoryId: selectedCategory?.idDoc || '',
      nomCategoryName: selectedCategory?.name || '',
      nomCategoryServiceId: '',
      nomCategoryServiceName: '',
      nomId: '',
      nomName: '',
      workOrderNumber: '',
      informNumber: '',
    };
    this.createWorkflowPreview.set([]);
    this.isLoadingCreateWorkflowPreview.set(false);

    if (!selectedCategory) {
      this.createCategoryServices.set([]);
      return;
    }

    this.nomCategoryService
      .getCategoryServices(selectedCategory.idDoc)
      .pipe(take(1))
      .subscribe((services) => {
        this.createCategoryServices.set(services.filter((service) => service.active));
      });
  }

  onCreateCategoryServiceChange(serviceId: string): void {
    const selectedService =
      this.createCategoryServices().find((service) => service.idDoc === serviceId) || null;
    const nextNumber = selectedService
      ? this.buildNextWorkOrderNumberFromService(selectedService.idDoc)
      : '';
    const nextInformNumber = selectedService
      ? this.buildInformNumber(selectedService, nextNumber)
      : '';

    this.createForm = {
      ...this.createForm,
      nomCategoryServiceId: selectedService?.idDoc || '',
      nomCategoryServiceName: selectedService?.name || '',
      workOrderNumber: nextNumber,
      informNumber: nextInformNumber,
      nomId: '',
      nomName: '',
    };
    this.createWorkflowPreview.set([]);
    this.isLoadingCreateWorkflowPreview.set(false);

    if (!serviceId) return;

    this.nomsService.getNormByServiceId(serviceId).pipe(take(1)).subscribe({
      next: (norm) => {
        if (!norm) {
          this.toastService.warning('Este servicio no tiene una norma asociada. Revisa el catálogo de normas.');
          return;
        }
        console.log('WorkOrder norm resolved from service', {
          serviceId,
          nomId: norm.idDoc,
          nomName: norm.name,
          nomCode: norm.code,
        });
        this.createForm = {
          ...this.createForm,
          nomId:   norm.idDoc,
          nomName: norm.name,
        };
        this.loadCreateWorkflowPreview(norm.idDoc);
      },
      error: () => {
        this.toastService.error('No fue posible buscar la norma asociada al servicio.');
      },
    });
  }

  onCreateClientChange(clientId: string): void {
    const selectedClient = this.activeClients().find((client) => client.idDoc === clientId) || null;

    this.createForm = {
      ...this.createForm,
      clientId: selectedClient?.idDoc || '',
      clientName: selectedClient?.legalName || '',
      plantId: '',
      plantName: '',
      contactName: '',
      contactPhone: '',
      shiftsLabel: '',
      street: '',
      exteriorNumber: '',
      colony: '',
      municipality: '',
      state: '',
      country: '',
      postalCode: '',
    };

    this.rebuildInformNumberFromCurrentSelection();

    if (!selectedClient) {
      this.availablePlants.set([]);
      return;
    }

    this.clientService
      .getClientPlants(selectedClient.idDoc)
      .pipe(take(1))
      .subscribe((plants) => {
        this.availablePlants.set(
          plants
            .filter((plant) => plant.active)
            .sort((a, b) => a.name.localeCompare(b.name))
        );
      });
  }

  onCreatePlantChange(plantId: string): void {
    const selectedPlant = this.availablePlants().find((plant) => plant.idDoc === plantId) || null;

    this.createForm = {
      ...this.createForm,
      plantId: selectedPlant?.idDoc || '',
      plantName: selectedPlant?.name || '',
      contactName: selectedPlant?.contactName || '',
      contactPhone: selectedPlant?.contactPhone || '',
      shiftsLabel: selectedPlant?.shifts?.length
        ? selectedPlant.shifts.map((shift) => shift.name).join(', ')
        : '',
      street: selectedPlant?.street || '',
      exteriorNumber: selectedPlant?.exteriorNumber || '',
      colony: selectedPlant?.colony || '',
      municipality: selectedPlant?.municipality || '',
      state: selectedPlant?.state || '',
      country: selectedPlant?.country || '',
      postalCode: selectedPlant?.postalCode || '',
    };

    this.rebuildInformNumberFromCurrentSelection();
  }

  private toDateInputValue(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private loadCurrentCustomerName(): void {
    this.authService.currentUser$
      .pipe(
        take(1),
        switchMap((firebaseUser) => {
          if (!firebaseUser) {
            return of(null);
          }

          return this.userService.getUserById(firebaseUser.uid).pipe(
            switchMap((appUser) => {
              this.currentAppUser.set(appUser);
              this.currentCustomerName.set(appUser?.customerName || 'Empresa actual');

              if (!appUser?.customerId) {
                return of(null);
              }

              return this.customerService.getCustomerById(appUser.customerId);
            })
          );
        })
      )
      .subscribe((customer) => {
        this.sessionCustomer.set(customer);
      });
  }

  private loadWorkOrders(): void {
    this.workOrderService
      .getWorkOrders()
      .pipe(take(1))
      .subscribe((workOrders) => {
        this.enrichAndSetWorkOrders(workOrders);
      });
  }

  private createWorkflowStepsIfPossible(
    idDoc: string,
    payload: Omit<workOrder, 'idDoc' | 'updatedAt'>,
    currentUser: User
  ): void {
    if (!payload.nomId) {
      this.createEquipmentsIfPossible(idDoc, { ...payload, idDoc });
      return;
    }

    this.normWorkflowService
      .getSteps(payload.nomId)
      .pipe(take(1))
      .subscribe({
        next: (steps) => {
          if (!steps.length) {
            this.createEquipmentsIfPossible(idDoc, { ...payload, idDoc });
            return;
          }

          const rawAssignments = this.createStepAssignments();
          const assignments: Record<string, { userId: string; userName: string }> = {};
          for (const [stepUid, userId] of Object.entries(rawAssignments)) {
            const user = this.availableSignatories().find((u) => u.idDoc === userId);
            if (user) assignments[stepUid] = { userId: user.idDoc, userName: user.displayName || `${user.firstName} ${user.lastName}` };
          }

          this.workOrderService
            .createWorkflowSteps(idDoc, payload.nomId, steps, currentUser, assignments)
            .subscribe({
              next: () => {
                const hasOtStep = steps.some((step) => step.code === 'OT');
                if (!hasOtStep) {
                  this.createEquipmentsIfPossible(idDoc, { ...payload, idDoc });
                  return;
                }

                this.workOrderService
                  .updateWorkOrder(idDoc, { status: 'in-progress' })
                  .subscribe({
                    next: () => {
                      this.createEquipmentsIfPossible(idDoc, {
                        ...payload,
                        idDoc,
                        status: 'in-progress',
                      });
                    },
                    error: (error) => {
                      console.error('Error updating work order status', error);
                      this.isSaving.set(false);
                      this.toastService.error(
                        'La orden se guardó, pero no fue posible actualizar su estatus inicial.'
                      );
                    },
                  });
              },
              error: (error) => {
                console.error('Error creating workflow steps', error);
                this.isSaving.set(false);
                this.toastService.error(
                  'La orden se guardó, pero no fue posible generar las fases del flujo.'
                );
              },
            });
        },
        error: (error) => {
          console.error('Error loading norm workflow steps', error);
          this.isSaving.set(false);
          this.toastService.error(
            'La orden se guardó, pero no fue posible consultar el flujo de la norma.'
          );
        },
      });
  }

  private loadActiveCategories(): void {
    this.nomCategoryService
      .getCategories()
      .pipe(take(1))
      .subscribe((categories) => {
        this.activeCategories.set(categories.filter((category) => category.active));
      });
  }

  private loadCategoryServices(categoryId: string): void {
    if (!categoryId) {
      this.categoryServices.set([]);
      return;
    }

    this.nomCategoryService
      .getCategoryServices(categoryId)
      .pipe(take(1))
      .subscribe((services) => {
        this.categoryServices.set(services.filter((service) => service.active));
      });
  }

  private loadActiveClients(): void {
    this.clientService
      .getClients()
      .pipe(take(1))
      .subscribe((clients) => {
        this.activeClients.set(
          clients
            .filter((client) => client.active)
            .sort((a, b) => a.legalName.localeCompare(b.legalName))
        );
      });
  }

  private loadActiveEquipments(): void {
    this.equipmentService
      .getEquipments()
      .pipe(take(1))
      .subscribe((equipments) => {
        this.activeEquipments.set(
          equipments
            .filter((item) => item.active)
            .sort((a, b) => a.name.localeCompare(b.name))
        );
      });
  }

  private loadAvailableSignatories(): void {
    this.userService
      .getUsers()
      .pipe(take(1))
      .subscribe((users) => {
        const signatories = users
          .filter((user) => {
            return user.roleId === this.signatoryRoleId;
          })
          .sort((a, b) => a.displayName.localeCompare(b.displayName));
        this.availableSignatories.set(signatories);
      });
  }

  private finalizeWorkOrderSave(workOrderItem: workOrder): void {
    const currentItems = this.workOrders().filter((item) => item.idDoc !== workOrderItem.idDoc);
    this.enrichAndSetWorkOrders([workOrderItem, ...currentItems], () => {
      this.isSaving.set(false);
      this.closeCreateModal();
      this.toastService.success('La orden de trabajo se guardó correctamente.');
    });
  }

  private createEquipmentsIfPossible(workOrderId: string, workOrderItem: workOrder): void {
    const equipments = this.selectedWorkOrderEquipments();
    console.log('WorkOrder createEquipmentsIfPossible', {
      workOrderId,
      equipmentsCount: equipments.length,
      equipments,
    });

    if (!equipments.length) {
      this.updateConsecutivesIfPossible(workOrderItem);
      return;
    }

    this.workOrderService.createEquipments(workOrderId, equipments, this.defaultEquipmentId() || undefined).subscribe({
      next: () => {
        console.log('WorkOrder equipments subcollection created', {
          workOrderId,
          equipmentIds: equipments.map((item) => item.idDoc),
        });
        this.updateConsecutivesIfPossible(workOrderItem);
      },
      error: (error) => {
        console.error('Error creating work order equipments', error);
        this.isSaving.set(false);
        this.toastService.error(
          'La orden se guardó, pero no fue posible registrar los equipos asociados.'
        );
      },
    });
  }

  private updateConsecutivesIfPossible(workOrderItem: workOrder): void {
    const customer = this.sessionCustomer();
    const workOrderNumberValue = Number.parseInt(workOrderItem.workOrderNumber, 10);
    const nextInformConsecutive = (customer?.consecutiveInform ?? 0) + 1;

    const serviceUpdate$ =
      workOrderItem.nomCategoryId && workOrderItem.nomCategoryServiceId
        ? this.nomCategoryService
            .updateCategoryService(workOrderItem.nomCategoryId, workOrderItem.nomCategoryServiceId, {
              consecutiveWorkOrder: Number.isNaN(workOrderNumberValue)
                ? undefined
                : workOrderNumberValue,
            })
            .pipe(
              map(() => ({ ok: true as const })),
              catchError((error) => {
                console.error('Error updating service consecutiveWorkOrder', error);
                return of({ ok: false as const, source: 'service' as const });
              })
            )
        : of({ ok: true as const });

    const customerUpdate$ = customer?.idDoc
      ? this.customerService.updateCustomer(customer.idDoc, { consecutiveInform: nextInformConsecutive }).pipe(
          map(() => ({ ok: true as const })),
          catchError((error) => {
            console.error('Error updating customer consecutiveInform', error);
            return of({ ok: false as const, source: 'customer' as const });
          })
        )
      : of({ ok: true as const });

    forkJoin({
      serviceUpdate: serviceUpdate$,
      customerUpdate: customerUpdate$,
    }).subscribe(({ serviceUpdate, customerUpdate }) => {
      if (customer?.idDoc && customerUpdate.ok) {
        this.sessionCustomer.set({
          ...customer,
          consecutiveInform: nextInformConsecutive,
        });
      }

      if (serviceUpdate.ok && customerUpdate.ok) {
        this.finalizeWorkOrderSave(workOrderItem);
        return;
      }

      this.isSaving.set(false);

      if (!customerUpdate.ok) {
        this.toastService.error(
          'La orden se guardó, pero no fue posible actualizar el consecutivo del informe.'
        );
        return;
      }

      this.toastService.error(
        'La orden se guardó, pero no fue posible actualizar el consecutivo de OT.'
      );
    });
  }

  private buildNextWorkOrderNumberFromService(serviceId?: string): string {
    if (!serviceId) {
      return '';
    }

    const selectedService =
      this.createCategoryServices().find((service) => service.idDoc === serviceId) || null;

    const nextValue =
      selectedService?.consecutiveWorkOrder !== undefined
        ? selectedService.consecutiveWorkOrder + 1
        : this.workOrders().filter((order) => order.nomCategoryServiceId === serviceId).length + 1;

    return String(nextValue).padStart(2, '0');
  }

  private buildInformNumber(
    service: nomCategoryServices | null,
    workOrderNumber: string
  ): string {
    if (!service || !workOrderNumber) {
      return '';
    }

    const prefix = (service.prefix || '').trim().toUpperCase();
    const codeCustomer = this.getSessionCodeCustomer();
    const year = String(new Date().getFullYear()).slice(-2);
    const nextConsecutive = (this.sessionCustomer()?.consecutiveInform ?? 0) + 1;
    const formattedConsecutive = String(nextConsecutive).padStart(2, '0');

    if (!prefix || !codeCustomer) {
      return '';
    }

    return `${prefix}/${workOrderNumber}-${codeCustomer}${year}/${formattedConsecutive}`;
  }

  private rebuildInformNumberFromCurrentSelection(): void {
    const selectedService =
      this.createCategoryServices().find(
        (service) => service.idDoc === this.createForm.nomCategoryServiceId
      ) || null;

    this.createForm = {
      ...this.createForm,
      informNumber: this.buildInformNumber(selectedService, this.createForm.workOrderNumber),
    };
  }

  private getSessionCodeCustomer(): string {
    const customer = this.sessionCustomer();
    const rawCode = customer?.codeCustomer || customer?.code || '';
    return rawCode.trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
  }

  private validateCreateForm(): string | null {
    if (!this.createForm.clientId) {
      return 'Selecciona una empresa.';
    }

    if (!this.createForm.plantId) {
      return 'Selecciona una planta.';
    }

    if (!this.createForm.nomCategoryId) {
      return 'Selecciona una categoría.';
    }

    if (!this.createForm.nomCategoryServiceId) {
      return 'Selecciona un servicio.';
    }

    if (!this.createForm.workOrderNumber) {
      return 'No. de OT no disponible.';
    }

    if (!this.createForm.informNumber) {
      return 'No. de informe no disponible.';
    }

    if (!this.createForm.signatoryId) {
      return 'Selecciona un signatario.';
    }

    return null;
  }

  private buildWorkOrderPayload(currentUser: User): Omit<workOrder, 'idDoc' | 'updatedAt'> | null {
    const createdAt = new Date(this.createForm.createdAt);
    if (Number.isNaN(createdAt.getTime())) {
      return null;
    }

    return {
      code: this.createForm.code,
      createdAt,
      evaluationDate: createdAt,
      evaluationNumber: this.createForm.evaluationNumber,
      workOrderNumber: this.createForm.workOrderNumber,
      informNumber: this.createForm.informNumber,
      purchaseOrderNumber: this.createForm.purchaseOrderNumber,
      quotationNumber: this.createForm.quotationNumber || undefined,
      clientId: this.createForm.clientId,
      clientName: this.createForm.clientName || undefined,
      plantId: this.createForm.plantId,
      plantName: this.createForm.plantName || undefined,
      nomCategoryId: this.createForm.nomCategoryId,
      nomCategoryName: this.createForm.nomCategoryName || undefined,
      nomCategoryServiceId: this.createForm.nomCategoryServiceId,
      nomCategoryServiceName: this.createForm.nomCategoryServiceName || undefined,
      nomId: this.createForm.nomId || '',
      nomName: this.createForm.nomName || undefined,
      userAssignedId: this.createForm.signatoryId,
      userAssignedName: this.createForm.signatoryName || undefined,
      assingDate: new Date(),
      signatoryId: this.createForm.signatoryId,
      signatoryName: this.createForm.signatoryName || undefined,
      impartiality: {
        ...this.createImpartiality,
        observations: this.createImpartiality.observations?.trim() || undefined,
      },
      createdUser: currentUser.idDoc,
      createdUserName: currentUser.displayName || undefined,
      active: true,
      status: 'pending',
    };
  }

  private toWorkOrderView(workOrderItem: workOrder, workflowSteps: workOrderStep[] = []): WorkOrderView {
    const flow = this.resolveFlowSummary(workOrderItem, workflowSteps);

    return {
      ...workOrderItem,
      serviceName:
        workOrderItem.nomCategoryServiceName || workOrderItem.nomName || 'Servicio sin definir',
      flowStepName: flow.stepName,
      flowStatusLabel: flow.statusLabel,
    };
  }

  private enrichAndSetWorkOrders(workOrders: workOrder[], onComplete?: () => void): void {
    if (!workOrders.length) {
      this.workOrders.set([]);
      onComplete?.();
      return;
    }

    forkJoin(
      workOrders.map((workOrderItem) =>
        this.workOrderService.getWorkflowSteps(workOrderItem.idDoc).pipe(take(1))
      )
    ).subscribe({
      next: (allSteps) => {
        const views = workOrders.map((workOrderItem, index) =>
          this.toWorkOrderView(workOrderItem, allSteps[index] || [])
        );
        this.workOrders.set(views);
        const selectedOrderId = this.selectedOrder()?.idDoc;
        if (selectedOrderId) {
          const refreshedSelection = views.find((item) => item.idDoc === selectedOrderId) || null;
          this.selectedOrder.set(refreshedSelection);
        }
        onComplete?.();
      },
      error: (error) => {
        console.error('Error loading workflow steps for work orders', error);
        this.workOrders.set(workOrders.map((workOrderItem) => this.toWorkOrderView(workOrderItem)));
        onComplete?.();
      },
    });
  }

  private resolveFlowSummary(
    workOrderItem: workOrder,
    workflowSteps: workOrderStep[]
  ): { stepName: string; statusLabel: string } {
    if (!workflowSteps.length) {
      return {
        stepName: 'Orden de trabajo',
        statusLabel:
          workOrderItem.status === 'in-progress'
            ? 'En progreso'
            : workOrderItem.status === 'completed'
              ? 'Concluido'
              : workOrderItem.status === 'cancelled'
                ? 'Cancelado'
                : 'Por iniciar',
      };
    }

    const inProgressStep = workflowSteps.find((step) => step.status === 'in-progress');
    if (inProgressStep) {
      return {
        stepName: inProgressStep.stepName,
        statusLabel: 'En progreso',
      };
    }

    if (workOrderItem.currentStepName && workOrderItem.status === 'in-progress') {
      return {
        stepName: workOrderItem.currentStepName,
        statusLabel: 'En progreso',
      };
    }

    const pendingStep = workflowSteps.find((step) => step.status === 'pending');
    if (pendingStep) {
      return {
        stepName: pendingStep.stepName,
        statusLabel: 'Por iniciar',
      };
    }

    const cancelledStep = workflowSteps.find((step) => step.status === 'cancelled');
    if (cancelledStep) {
      return {
        stepName: cancelledStep.stepName,
        statusLabel: 'Cancelado',
      };
    }

    const lastStep = workflowSteps[workflowSteps.length - 1];
    return {
      stepName: lastStep?.stepName || 'Flujo',
      statusLabel: 'Concluido',
    };
  }

  private mergeWorkOrderEquipmentWithMaster(
    workOrderEquipmentItem: workOrderEquipment,
    masterEquipment: equipment | null
  ): workOrderEquipment {
    if (!masterEquipment) {
      return workOrderEquipmentItem;
    }

    return {
      ...workOrderEquipmentItem,
      equipmentName: workOrderEquipmentItem.equipmentName || masterEquipment.name,
      equipmentType: workOrderEquipmentItem.equipmentType || masterEquipment.identifier,
      equipmentBrand: workOrderEquipmentItem.equipmentBrand || masterEquipment.brand,
      equipmentModel: workOrderEquipmentItem.equipmentModel || masterEquipment.model,
      equipmentNs: workOrderEquipmentItem.equipmentNs || masterEquipment.ns,
      equipmentSerialNumber: workOrderEquipmentItem.equipmentSerialNumber || masterEquipment.ns,
      equipmentFrecuency: workOrderEquipmentItem.equipmentFrecuency || masterEquipment.frecuency,
      equipmentMeditionInterval: workOrderEquipmentItem.equipmentMeditionInterval || masterEquipment.range,
      equipmentPrecition: workOrderEquipmentItem.equipmentPrecition || masterEquipment.precition,
      equipmentSpecifyEquipment: workOrderEquipmentItem.equipmentSpecifyEquipment || masterEquipment.especify_equipment,
    };
  }

  saveSelectedOrderObserver(): void {
    const order = this.selectedOrder();
    if (!order || this.isSavingObserver() || !this.guardEditable()) return;

    const observerName = this.selectedOrderObserver().trim() || undefined;
    const dateValue = this.selectedOrderObservationDate();
    const observationDate = dateValue ? new Date(dateValue) : undefined;
    const startTime = this.selectedOrderStartTime().trim() || undefined;
    const endTime = this.selectedOrderEndTime().trim() || undefined;
    const cableResistanceRaw = this.selectedOrderCableResistance();
    const cableResistance = this.shouldHideCableResistanceInDetail()
      ? undefined
      : cableResistanceRaw != null && !isNaN(Number(cableResistanceRaw))
        ? Number(cableResistanceRaw)
        : undefined;

    this.isSavingObserver.set(true);
    this.workOrderService
      .updateWorkOrder(order.idDoc, { observerName, observationDate, startTime, endTime, cableResistance })
      .subscribe({
      next: () => {
        const updated = { ...order, observerName, observationDate, startTime, endTime, cableResistance };
        this.selectedOrder.set(updated);
        this.workOrders.update((items) =>
          items.map((item) =>
            item.idDoc === order.idDoc
              ? { ...item, observerName, observationDate, startTime, endTime, cableResistance }
              : item
          )
        );
        this.isSavingObserver.set(false);
      },
      error: () => {
        this.isSavingObserver.set(false);
      },
    });
  }

  saveOrderChanges(): void {
    const order = this.selectedOrder();
    if (!order || this.isSavingImpartiality() || this.isSavingObserver() || !this.guardEditable()) return;

    const observerName = this.selectedOrderObserver().trim() || undefined;
    const dateValue = this.selectedOrderObservationDate();
    const observationDate = dateValue ? new Date(dateValue) : undefined;
    const startTime = this.selectedOrderStartTime().trim() || undefined;
    const endTime = this.selectedOrderEndTime().trim() || undefined;
    const cableResistanceRaw = this.selectedOrderCableResistance();
    const cableResistance = this.shouldHideCableResistanceInDetail()
      ? undefined
      : cableResistanceRaw != null && !isNaN(Number(cableResistanceRaw))
        ? Number(cableResistanceRaw)
        : undefined;

    const impartiality: WorkOrderImpartiality = {
      ...this.buildEmptyImpartiality(),
      ...(order.impartiality ?? {}),
      observations: order.impartiality?.observations?.trim() || '',
    };
    const serviceSchedule = this.buildServiceSchedulePayload(order.idDoc);

    this.isSavingImpartiality.set(true);
    this.isSavingObserver.set(true);

    forkJoin([
      this.workOrderService.updateWorkOrder(order.idDoc, { impartiality }),
      this.workOrderService.saveServiceSchedule(order.idDoc, serviceSchedule),
      this.workOrderService.updateWorkOrder(order.idDoc, {
        observerName,
        observationDate,
        startTime,
        endTime,
        cableResistance,
      }),
    ]).subscribe({
      next: () => {
        const updated = {
          ...order,
          impartiality,
          observerName,
          observationDate,
          startTime,
          endTime,
          cableResistance,
        };
        this.selectedOrder.set(updated);
        this.workOrders.update((items) =>
          items.map((item) =>
            item.idDoc === order.idDoc
              ? { ...item, impartiality, observerName, observationDate, startTime, endTime, cableResistance }
              : item
          )
        );
        this.isSavingImpartiality.set(false);
        this.isSavingObserver.set(false);
        this.toastService.success('Cambios guardados correctamente.');
      },
      error: () => {
        this.isSavingImpartiality.set(false);
        this.isSavingObserver.set(false);
        this.toastService.error('No fue posible guardar los cambios.');
      },
    });
  }

  buildPlantAddress(plant: ClientPlant): string {
    return [plant.street, plant.exteriorNumber, plant.colony, plant.municipality, plant.state]
      .filter(Boolean)
      .join(', ') || '—';
  }

  private normalizeText(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }

  updateServiceScheduleResponsible(rowId: string, userId: string): void {
    if (userId === 'NA') {
      this.selectedOrderServiceSchedule.update((rows) =>
        rows.map((row) =>
          row.idDoc === rowId
            ? {
                ...row,
                responsibleUserId: 'NA',
                responsibleUserName: 'NA',
              }
            : row
        )
      );
      return;
    }

    const user = this.availableSignatories().find((item) => item.idDoc === userId);
    this.selectedOrderServiceSchedule.update((rows) =>
      rows.map((row) =>
        row.idDoc === rowId
          ? {
              ...row,
              responsibleUserId: user?.idDoc || '',
              responsibleUserName: this.getFormalUserName(user || null),
            }
          : row
      )
    );
  }

  updateServiceScheduleDate(rowId: string, value: string): void {
    this.selectedOrderServiceSchedule.update((rows) =>
      rows.map((row) => (row.idDoc === rowId ? { ...row, scheduledDateText: value } : row))
    );
  }

  getServiceScheduleResponsibleName(row: WorkOrderServiceScheduleRow): string {
    if (row.responsibleUserId === 'NA') {
      return 'NA';
    }

    return row.responsibleUserName || this.getFormalUserName(
      this.availableSignatories().find((item) => item.idDoc === row.responsibleUserId) || null
    );
  }

  private buildDefaultServiceScheduleRows(): WorkOrderServiceScheduleRow[] {
    return this.serviceScheduleActivityTemplates.map((item) => ({
      idDoc: `${String(item.order).padStart(2, '0')}-${item.key}`,
      activityKey: item.key,
      activityLabel: item.label,
      responsibleUserId: '',
      responsibleUserName: '',
      scheduledDateText: '',
      order: item.order,
    }));
  }

  private toServiceScheduleRows(items: WorkOrderServiceScheduleItem[]): WorkOrderServiceScheduleRow[] {
    if (!items.length) {
      return this.buildDefaultServiceScheduleRows();
    }

    return items
      .sort((a, b) => a.order - b.order)
      .map((item) => ({
        idDoc: item.idDoc,
        activityKey: item.activityKey,
        activityLabel: item.activityLabel,
        responsibleUserId: item.responsibleUserId || '',
        responsibleUserName: item.responsibleUserName || '',
        scheduledDateText: item.scheduledDate ? this.toDateInputValue(item.scheduledDate) : '',
        order: item.order,
      }));
  }

  private buildServiceSchedulePayload(workOrderId: string): WorkOrderServiceScheduleItem[] {
    return this.selectedOrderServiceSchedule().map((row) => ({
      idDoc: row.idDoc,
      workOrderId,
      activityKey: row.activityKey,
      activityLabel: row.activityLabel,
      responsibleUserId: row.responsibleUserId || undefined,
      responsibleUserName: row.responsibleUserName || undefined,
      scheduledDate: row.scheduledDateText ? new Date(`${row.scheduledDateText}T00:00:00`) : undefined,
      order: row.order,
      active: true,
      createdAt: new Date(),
    }));
  }

  private isWorkOrderStep(step: workOrderStep): boolean {
    const code = (step.stepCode || '').trim().toUpperCase();
    const name = step.stepName.trim().toLowerCase();
    return code === 'OT' || name === 'orden de trabajo';
  }

  private getReadableUserName(user: User | null): string {
    if (!user) {
      return '';
    }

    const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
    return user.displayName || fullName || user.email || 'Usuario';
  }

  getFormalUserName(user: User | null): string {
    if (!user) {
      return '';
    }

    return [user.prefix?.trim(), user.firstName?.trim(), user.lastName?.trim()]
      .filter(Boolean)
      .join(' ')
      .trim();
  }

  private getStatusLabel(status: workOrderStep['status'] | workOrder['status']): string {
    return status === 'in-progress'
      ? 'En progreso'
      : status === 'completed'
        ? 'Concluido'
        : status === 'cancelled'
          ? 'Cancelado'
          : 'Por iniciar';
  }

  private getDetailDefaultTab(order: WorkOrderView): string {
    const inProgressStep = [...this.selectedOrderWorkflowSteps()]
      .sort((a, b) => a.order - b.order)
      .find((step) => step.status === 'in-progress');

    if (inProgressStep) {
      return this.isWorkOrderStep(inProgressStep) ? 'work-order' : `step:${inProgressStep.idDoc}`;
    }

    return order.status === 'in-progress' && order.flowStepName !== 'Orden de trabajo'
      ? this.findTabIdByStepName(order.flowStepName)
      : 'work-order';
  }

  private getDefaultTabFromSteps(workflowSteps: workOrderStep[]): string {
    const inProgressStep = [...workflowSteps]
      .sort((a, b) => a.order - b.order)
      .find((step) => step.status === 'in-progress');

    if (!inProgressStep) {
      return 'work-order';
    }

    return this.isWorkOrderStep(inProgressStep) ? 'work-order' : `step:${inProgressStep.idDoc}`;
  }

  private findTabIdByStepName(stepName: string): string {
    const step = this.selectedOrderWorkflowSteps().find((item) => item.stepName === stepName);
    if (!step) {
      return 'work-order';
    }

    return this.isWorkOrderStep(step) ? 'work-order' : `step:${step.idDoc}`;
  }

  private loadSelectedOrderDetail(order: WorkOrderView, onComplete?: () => void): void {
    forkJoin({
      workflowSteps: this.workOrderService.getWorkflowSteps(order.idDoc).pipe(take(1)),
      equipments: this.workOrderService.getEquipments(order.idDoc).pipe(take(1)),
      serviceSchedule: this.workOrderService.getServiceSchedule(order.idDoc).pipe(take(1)),
    }).subscribe({
      next: ({ workflowSteps, equipments, serviceSchedule }) => {
        this.selectedOrderWorkflowSteps.set(workflowSteps);
        this.selectedOrderServiceSchedule.set(this.toServiceScheduleRows(serviceSchedule));
        const selectedTab = this.selectedOrderTab();
        const availableTabs = new Set(['work-order', ...workflowSteps.map((step) => `step:${step.idDoc}`)]);
        const defaultTab = this.getDefaultTabFromSteps(workflowSteps);
        const resolvedTab =
          selectedTab === 'work-order' && defaultTab !== 'work-order'
            ? defaultTab
            : availableTabs.has(selectedTab)
              ? selectedTab
              : defaultTab;
        this.selectedOrderTab.set(resolvedTab);
        const selectedStep =
          resolvedTab === 'work-order'
            ? [...workflowSteps].sort((a, b) => a.order - b.order).find((item) => this.isWorkOrderStep(item)) || null
            : [...workflowSteps].find((item) => `step:${item.idDoc}` === resolvedTab) || null;
        this.prefillNextAssignedUserId(selectedStep);
        if (!equipments.length) {
          this.selectedOrderEquipments.set([]);
          onComplete?.();
          return;
        }

        forkJoin(
          equipments.map((equipmentItem) =>
            this.equipmentService.getEquipmentById(equipmentItem.equipmentId).pipe(
              take(1),
              map((masterEquipment) =>
                this.mergeWorkOrderEquipmentWithMaster(equipmentItem, masterEquipment)
              ),
              catchError(() => of(equipmentItem))
            )
          )
        ).subscribe((resolvedEquipments) => {
          this.selectedOrderEquipments.set(resolvedEquipments);
          onComplete?.();
        });
      },
      error: (error) => {
        console.error('Error loading work order detail', error);
        this.selectedOrderWorkflowSteps.set([]);
        this.selectedOrderEquipments.set([]);
        this.toastService.error('No fue posible cargar el detalle de la orden de trabajo.');
      },
    });
  }

  private buildEmptyImpartiality(): WorkOrderImpartiality {
    return {
      familiarAffinity: null,
      bloodRelationship: null,
      friendshipRelationship: null,
      commercialInterest: null,
      economicInterest: null,
      intimidation: null,
      serviceImpartialityRisk: null,
      observations: '',
    };
  }

  private loadCreateWorkflowPreview(nomId: string): void {
    if (!nomId) {
      this.createWorkflowPreview.set([]);
      this.isLoadingCreateWorkflowPreview.set(false);
      return;
    }

    this.isLoadingCreateWorkflowPreview.set(true);
    this.normWorkflowService
      .getSteps(nomId)
      .pipe(take(1))
      .subscribe({
        next: (steps) => {
          this.createWorkflowPreview.set(
            [...steps].sort((a, b) => (a.order || 0) - (b.order || 0))
          );
          this.createStepAssignments.set({});
          this.isLoadingCreateWorkflowPreview.set(false);
        },
        error: (error) => {
          console.error('Error loading workflow preview for work order', error);
          this.createWorkflowPreview.set([]);
          this.isLoadingCreateWorkflowPreview.set(false);
          this.toastService.error('No fue posible cargar el flujo de la norma seleccionada.');
        },
      });
  }
}
