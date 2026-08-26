import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, OnInit, SimpleChanges, computed, inject, signal } from '@angular/core';
import { Storage, getBlob, ref } from '@angular/fire/storage';
import { FormsModule } from '@angular/forms';
import { catchError, firstValueFrom, forkJoin, of, switchMap, take } from 'rxjs';

import { ClientPlant } from '../../interfaces/client.interface';
import { InformNom22Data } from '../../interfaces/documents/informNom22.interface';
import { MeditionBaseDocumentData } from '../../interfaces/documents/meditionBase.interface';
import { MeditionTableRow } from '../../interfaces/documents/meditionTable.interface';
import { WorkOrderBaseDocumentData } from '../../interfaces/documents/workOrderBase.interface';
import { equipment } from '../../interfaces/meditionType.interface';
import { Point } from '../../interfaces/measurements.interface';
import { User } from '../../interfaces/user.interface';
import {
  WorkOrderImpartiality,
  WorkOrderServiceScheduleActivity,
  WorkOrderServiceScheduleItem,
  workOrder,
  workOrderEquipment,
  workOrderStep,
} from '../../interfaces/workOrder.interface';
import { ClientService } from '../../services/client.service';
import { EquipmentService } from '../../services/equipment.service';
import { ToastService } from '../../services/toast.service';
import { UserService } from '../../services/user.service';
import { WorkOrderService } from '../../services/work-order.service';

@Component({
  selector: 'app-inform',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './inform.component.html',
  styleUrl: './inform.component.scss',
})
export class InformComponent implements OnInit, OnChanges {
  private readonly signatoryRoleId = '97YgNetUGyyC7Bnm2I2Z';
  private readonly table422Id = 'table_422';
  private readonly table51Id = 'table_51';
  private readonly table52Id = 'table_52';
  private readonly table53Id = 'table_53';
  private readonly noLightningRodText =
    'La empresa no cuenta con sistema de protección contra descargas eléctricas atmosféricas.';
  private readonly yesLightningRodText =
    'Si la empresa cuenta con pararrayos se pone la tabla correspondiente con la siguiente leyenda:';
  private readonly imagePlaceholderKeys = new Set<keyof InformNom22Data>([
    'client_image',
    'tabla_4_2_2_id',
    'tabla_5_1_id',
    'tabla_5_2_id',
    'tabla_5_3_id',
  ]);
  private readonly stackedImagePlaceholderKeys = new Set<keyof InformNom22Data>(['charts']);
  readonly chartWidth = 420;
  readonly chartHeight = 240;
  readonly chartPadding = { top: 22, right: 18, bottom: 34, left: 42 };
  readonly measurementDistances = [
    { label: 'P1 (1)', distance: 1, key: 'p1_1m' as const },
    { label: 'P1 (2)', distance: 4, key: 'p1_4m' as const },
    { label: 'P1 (3)', distance: 7, key: 'p1_7m' as const },
    { label: 'P1 (4)', distance: 10, key: 'p1_10m' as const },
    { label: 'P1 (5)', distance: 13, key: 'p1_13m' as const },
    { label: 'P1 (6)', distance: 16, key: 'p1_16m' as const },
    { label: 'P1 (7)', distance: 19, key: 'p1_19m' as const },
  ];
  private readonly measurementWorkflowId = 'ZHvnk9BPyKO6c4mJot5A';
  private readonly templatePath = '/base22.docx';
  private readonly workOrderTemplatePath = '/assets/documents/OT_Base.docx';
  private readonly meditionTemplatePath = '/assets/documents/Medition_Base.docx';
  private workOrderService = inject(WorkOrderService);
  private clientService = inject(ClientService);
  private equipmentService = inject(EquipmentService);
  private toastService = inject(ToastService);
  private userService = inject(UserService);
  private storage = inject(Storage);

  @Input() workOrderId = '';
  @Input() workOrderStatus = '';
  @Input() cableResistance: number | null = null;

  isLoading = signal(false);
  isGenerating = signal(false);
  showProgressModal = signal(false);
  generationTitle = signal('Generando informe');
  generationProgress = signal(0);
  generationStep = signal('');
  canCancelGeneration = signal(false);
  clientLogoPreviewUrl = signal('');
  showHumidityQuestion = false;
  activeTab = signal<'tables' | 'charts'>('tables');
  points = signal<Point[]>([]);
  measurementStep = signal<workOrderStep | null>(null);
  stepEquipments = signal<workOrderEquipment[]>([]);
  workOrderBaseData = signal<WorkOrderBaseDocumentData | null>(null);
  availableSignatories = signal<User[]>([]);
  serviceScheduleRows = signal<InformServiceScheduleRow[]>([]);
  isSavingServiceSchedule = signal(false);
  lightningRodPoints = computed(() => this.points().filter((point) => this.hasLightningRodEnabled(point)));
  meditionTableRows = computed(() => this.buildMeditionTableRows(this.points()));
  meditionTableChunks = computed(() => this.chunkMeditionTableRows(this.meditionTableRows(), 15));
  private humidityQuestionResolver: ((value: boolean | null) => void) | null = null;
  private cancelGenerationRequested = false;
  private html2canvasLoader?: Promise<typeof import('html2canvas')['default']>;
  private jszipLoader?: Promise<any>;
  readonly factorCorreccion = computed(
    () => this.stepEquipments().find((equipment) => equipment.promedioFC != null)?.promedioFC ?? null
  );

  ngOnInit(): void {
    this.loadSignatories();
    this.loadInformData();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['workOrderId'] || changes['cableResistance']) {
      this.loadInformData();
    }
  }

  private loadInformData(): void {
    if (!this.workOrderId) {
      this.points.set([]);
      this.measurementStep.set(null);
      this.stepEquipments.set([]);
      this.workOrderBaseData.set(null);
      this.serviceScheduleRows.set([]);
      this.isLoading.set(false);
      return;
    }

    this.isLoading.set(true);
    this.loadWorkOrderBasePreview();

    this.workOrderService
      .getWorkflowSteps(this.workOrderId)
      .pipe(
        take(1),
        switchMap((steps) => {
          const measurementStep =
            steps.find((step) => step.workflowId === this.measurementWorkflowId) ||
            steps.find((step) => step.stepName.trim().toLowerCase() === 'medicion') ||
            steps.find((step) => step.stepName.trim().toLowerCase() === 'medición') ||
            null;

          this.measurementStep.set(measurementStep);

          if (!measurementStep) {
            this.stepEquipments.set([]);
            return of({ points: [] as Point[], equipments: [] as workOrderEquipment[] });
          }

          return forkJoin({
            points: this.workOrderService
              .getMeasurementPoints(this.workOrderId, measurementStep.idDoc)
              .pipe(take(1)),
            equipments: this.workOrderService
              .getWorkflowStepEquipments(this.workOrderId, measurementStep.idDoc)
              .pipe(take(1)),
          });
        }),
        catchError(() => {
          this.toastService.error('No fue posible cargar los puntos para el informe.');
          this.isLoading.set(false);
          return of({ points: [] as Point[], equipments: [] as workOrderEquipment[] });
        })
      )
      .subscribe(({ points, equipments }) => {
        this.points.set(points);
        this.stepEquipments.set(equipments);
        this.isLoading.set(false);
      });
  }

  private async loadWorkOrderBasePreview(): Promise<void> {
    try {
      const order = await firstValueFrom(this.workOrderService.getWorkOrderById(this.workOrderId));

      if (!order) {
        this.workOrderBaseData.set(null);
        return;
      }

      const [client, plant, equipments, serviceSchedule, signatoryUser] = await Promise.all([
        order.clientId
          ? firstValueFrom(this.clientService.getClientById(order.clientId))
          : Promise.resolve(null),
        order.clientId && order.plantId
          ? firstValueFrom(this.clientService.getClientPlantById(order.clientId, order.plantId))
          : Promise.resolve(null),
        firstValueFrom(this.workOrderService.getEquipments(this.workOrderId)),
        firstValueFrom(this.workOrderService.getServiceSchedule(this.workOrderId)),
        order.signatoryId
          ? firstValueFrom(this.userService.getUserById(order.signatoryId))
          : Promise.resolve(null),
      ]);

      const mainEquipment = equipments.find((equipment) => equipment.active) ?? equipments[0] ?? null;
      const masterEquipment =
        mainEquipment?.equipmentId
          ? await firstValueFrom(this.equipmentService.getEquipmentById(mainEquipment.equipmentId))
          : null;
      const resolvedEquipment = this.mergeWorkOrderEquipmentWithMaster(mainEquipment, masterEquipment);

      this.workOrderBaseData.set(
        this.buildWorkOrderBaseData(order, plant, resolvedEquipment, serviceSchedule, signatoryUser)
      );
      this.clientLogoPreviewUrl.set(client?.urlLogo?.trim() || client?.brandUrl?.trim() || '');
      this.serviceScheduleRows.set(this.toInformServiceScheduleRows(serviceSchedule));
    } catch {
      this.workOrderBaseData.set(null);
      this.clientLogoPreviewUrl.set('');
      this.serviceScheduleRows.set([]);
    }
  }

  private loadSignatories(): void {
    this.userService
      .getUsersByRole(this.signatoryRoleId)
      .pipe(take(1))
      .subscribe({
        next: (users) => {
          this.availableSignatories.set(
            users
              .filter((user) => user.active)
              .sort((a, b) => this.getFormalUserName(a).localeCompare(this.getFormalUserName(b)))
          );
        },
        error: () => {
          this.availableSignatories.set([]);
        },
      });
  }

  getFormalUserName(user: User | null | undefined): string {
    if (!user) {
      return '';
    }

    return [user.prefix, user.firstName, user.lastName].filter((value) => !!value?.trim()).join(' ');
  }

  updateServiceScheduleResponsible(rowId: string, userId: string): void {
    const user = this.availableSignatories().find((item) => item.idDoc === userId);
    this.serviceScheduleRows.update((rows) =>
      rows.map((row) =>
        row.idDoc === rowId
          ? {
              ...row,
              responsibleUserId: user?.idDoc || '',
              responsibleUserName: this.getFormalUserName(user),
            }
          : row
      )
    );
  }

  updateServiceScheduleDate(rowId: string, value: string): void {
    this.serviceScheduleRows.update((rows) =>
      rows.map((row) => (row.idDoc === rowId ? { ...row, scheduledDateText: value } : row))
    );
  }

  saveServiceSchedule(): void {
    if (!this.workOrderId || this.isSavingServiceSchedule()) {
      return;
    }

    this.isSavingServiceSchedule.set(true);
    const items = this.buildServiceSchedulePayload();

    this.workOrderService.saveServiceSchedule(this.workOrderId, items).pipe(take(1)).subscribe({
      next: async () => {
        await this.loadWorkOrderBasePreview();
        this.isSavingServiceSchedule.set(false);
        this.toastService.success('La programación del servicio se guardó correctamente.');
      },
      error: () => {
        this.isSavingServiceSchedule.set(false);
        this.toastService.error('No fue posible guardar la programación del servicio.');
      },
    });
  }

  labelGeneratorSource(point: Point): string {
    const source = point.generatorSources?.[0] || point.connectedEquipment[0]?.description;

    if (!source) return '—';

    return source === 'electrical_equipment'
      ? 'Equipo eléctrico'
      : source === 'lightning_rod'
        ? 'Pararrayos'
        : source === 'structure'
          ? 'Estructura'
          : 'Sin equipo';
  }

  labelConnectedEquipment(description?: string): string {
    if (!description) return '//';

    return description === 'electrical_equipment'
      ? 'Equipo eléctrico'
      : description === 'lightning_rod'
        ? 'Pararrayos'
        : description === 'structure'
          ? 'Estructura'
          : description === 'no_equipment'
            ? 'Sin equipo'
            : description;
  }

  getElectrodeType(point: Point): string {
    return point.hasLightningRod ? 'Sistema de pararrayos' : 'Red de puesta a tierra';
  }

  getElectrodeTypeDisplay(point: Point): string {
    return point.electrodeType === 'multiple' ? 'Múltiple' : 'Único';
  }

  getContinuityLabel(point: Point): string {
    if (point.hasContinuity === true) return 'Sí';
    if (point.hasContinuity === false) return 'No';
    return '—';
  }

  getLimit(point: Point): number {
    return point.hasLightningRod ? 10 : 25;
  }

  getCorrectedP113(point: Point): number | null {
    const measurement = point.measurementData.p1_13m;
    if (measurement == null) return null;

    const factor = this.factorCorreccion();
    if (factor == null) {
      return measurement;
    }

    const correctedByFactor = measurement * factor;
    if (this.cableResistance == null) {
      return correctedByFactor;
    }

    return correctedByFactor - this.cableResistance;
  }

  getSystemTypeLabel(point: Point): string {
    return point.systemType?.trim() ? point.systemType.trim() : '';
  }

  getLightningRodHeightLabel(point: Point): string | number {
    return point.lightningRodHeight != null ? point.lightningRodHeight : '-';
  }

  getProtectionRadiusLabel(point: Point): string | number {
    return point.protectionRadius != null ? point.protectionRadius : '';
  }

  getProtectionArea(point: Point): number | null {
    if (point.protectionRadius == null) {
      return null;
    }

    return Math.PI * Math.pow(point.protectionRadius, 2);
  }

  private hasLightningRodEnabled(point: Point): boolean {
    const value = point.hasLightningRod as boolean | string | null | undefined;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      return normalized === 'si' || normalized === 'sí' || normalized === 'yes' || normalized === 'true';
    }

    return value === true;
  }

  getVoltageLabel(point: Point): string {
    return point.voltageStatus === 'absence'
      ? 'Ausencia'
      : point.voltageStatus === 'presence'
        ? 'Presencia'
        : point.voltageStatus === 'empty'
          ? 'Vacío'
          : '—';
  }

  getP15Resistance(point: Point): number | null {
    return this.getCorrectedMeasurementValue(point, 'p1_13m');
  }

  getConnectedEquipmentRows(point: Point): string[] {
    return Array.from({ length: 3 }, (_, index) =>
      this.labelConnectedEquipment(point.connectedEquipment[index]?.description)
    );
  }

  getMeasurementSeries(point: Point): Array<{ label: string; distance: number; value: number | null }> {
    return this.measurementDistances.map((item) => ({
      label: item.label,
      distance: item.distance,
      value: this.getCorrectedMeasurementValue(point, item.key),
    }));
  }

  private getCorrectedMeasurementValue(
    point: Point,
    key: keyof Point['measurementData']
  ): number | null {
    const measurement = point.measurementData[key];
    if (measurement == null) {
      return null;
    }

    const factor = this.factorCorreccion();
    const correctedByFactor = factor != null ? measurement * factor : measurement;

    if (this.cableResistance == null) {
      return correctedByFactor;
    }

    return correctedByFactor - this.cableResistance;
  }

  getChartPolyline(point: Point): string {
    const values = this.getMeasurementSeries(point).map((item) => item.value);
    const numericValues = values.filter((value): value is number => value != null);
    if (numericValues.length < 2) return '';

    const min = Math.min(...numericValues);
    const max = Math.max(...numericValues);
    const range = max - min || 1;
    const innerWidth = this.chartWidth - this.chartPadding.left - this.chartPadding.right;
    const innerHeight = this.chartHeight - this.chartPadding.top - this.chartPadding.bottom;

    return this.getMeasurementSeries(point)
      .map((item, index) => {
        const fallback = numericValues[0];
        const value = item.value ?? fallback;
        const x =
          this.chartPadding.left +
          (index / Math.max(this.measurementDistances.length - 1, 1)) * innerWidth;
        const y =
          this.chartPadding.top + innerHeight - ((value - min) / range) * innerHeight;
        return `${x},${y}`;
      })
      .join(' ');
  }

  getChartYTicks(point: Point): number[] {
    const numericValues = this.getMeasurementSeries(point)
      .map((item) => item.value)
      .filter((value): value is number => value != null);

    if (!numericValues.length) {
      return [0, 1, 2];
    }

    const min = Math.min(...numericValues);
    const max = Math.max(...numericValues);
    const range = max - min || 1;

    return [0, 1, 2].map((step) => min + (range / 2) * step);
  }

  getChartYPosition(point: Point, value: number): number {
    const numericValues = this.getMeasurementSeries(point)
      .map((item) => item.value)
      .filter((current): current is number => current != null);

    const min = numericValues.length ? Math.min(...numericValues) : 0;
    const max = numericValues.length ? Math.max(...numericValues) : 1;
    const range = max - min || 1;
    const innerHeight = this.chartHeight - this.chartPadding.top - this.chartPadding.bottom;

    return this.chartPadding.top + innerHeight - ((value - min) / range) * innerHeight;
  }

  getChartXPosition(index: number): number {
    const innerWidth = this.chartWidth - this.chartPadding.left - this.chartPadding.right;
    return (
      this.chartPadding.left +
      (index / Math.max(this.measurementDistances.length - 1, 1)) * innerWidth
    );
  }

  async generateInform(): Promise<void> {
    if (!this.workOrderId || this.isGenerating()) {
      return;
    }

    this.isGenerating.set(true);
    this.cancelGenerationRequested = false;
    this.canCancelGeneration.set(true);

    try {
      const answer = await this.askHumidityControlQuestion();
      if (answer === null) {
        return;
      }

      this.generationProgress.set(0);
      this.generationTitle.set('Generando informe');
      this.generationStep.set('Cargando datos de la orden...');
      this.showProgressModal.set(true);

      const includeHumidityControl = answer;
      this.ensureGenerationNotCancelled();
      const informData = await this.buildInformData(includeHumidityControl);
      this.generationProgress.set(15);

      this.generationStep.set('Descargando plantilla...');
      const response = await fetch(this.templatePath);

      if (!response.ok) {
        throw new Error('No fue posible leer la plantilla base del informe.');
      }

      const templateBuffer = await response.arrayBuffer();
      this.generationProgress.set(30);

      this.generationStep.set('Procesando documento...');
      this.ensureGenerationNotCancelled();
      const JSZipModule = await this.getJSZip();
      const zip = await JSZipModule.loadAsync(templateBuffer);
      const xmlEntries = zip.file(/^word\/(document|header\d+|footer\d+)\.xml$/);

      if (!xmlEntries.length) {
        throw new Error('La plantilla no contiene archivos XML de Word para reemplazar.');
      }

      for (const xmlEntry of xmlEntries) {
        this.ensureGenerationNotCancelled();
        const currentXml = await xmlEntry.async('string');
        const updatedXml = this.replaceTemplateValues(currentXml, informData);
        zip.file(xmlEntry.name, updatedXml);
      }
      this.generationProgress.set(50);

      this.generationStep.set('Capturando tablas...');
      this.ensureGenerationNotCancelled();
      const tableImages = await this.captureReportTableImages(includeHumidityControl);
      const clientLogoImage = await this.captureClientLogoImage(informData.client_image);
      if (!clientLogoImage) {
        await this.removeDelimitedPlaceholderFromDocument(zip, 'client_image', '{{', '}}');
      }
      this.generationProgress.set(65);

      this.generationStep.set('Capturando gráficas...');
      this.ensureGenerationNotCancelled();
      const chartImages = await this.captureChartImages();
      const reportImages = [
        ...(clientLogoImage ? [clientLogoImage] : []),
        ...tableImages,
        ...chartImages,
      ];
      this.generationProgress.set(78);

      if (reportImages.length) {
        this.generationStep.set('Integrando imágenes...');
        this.ensureGenerationNotCancelled();
        await this.embedImagesIntoDocument(zip, reportImages);
        this.generationProgress.set(90);
      }

      this.generationStep.set('Generando archivo...');
      this.ensureGenerationNotCancelled();
      const generatedDoc = await zip.generateAsync({
        type: 'uint8array',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      this.generationProgress.set(98);

      this.generationStep.set('Descargando...');
      this.ensureGenerationNotCancelled();
      const safeInformNumber = (informData.inform_number || 'informe').replace(/[^\w.-]+/g, '_');
      const fileName = `${safeInformNumber}.docx`;
      this.downloadGeneratedDocument(generatedDoc, fileName);
      this.generationProgress.set(100);
      this.generationStep.set('¡Informe generado!');
    } catch (error) {
      console.error(error);
      if (this.cancelGenerationRequested) {
        this.toastService.warning('Generación cancelada.');
      } else {
        this.toastService.error('No fue posible generar el informe.');
        this.showProgressModal.set(false);
      }
    } finally {
      this.isGenerating.set(false);
      this.canCancelGeneration.set(false);
      setTimeout(() => this.showProgressModal.set(false), 900);
    }
  }

  async generateWorkOrderDocument(): Promise<void> {
    if (!this.workOrderId || this.isGenerating()) {
      return;
    }

    this.isGenerating.set(true);
    this.cancelGenerationRequested = false;
    this.canCancelGeneration.set(true);

    try {
      this.generationTitle.set('Generando orden de trabajo');
      this.generationProgress.set(0);
      this.generationStep.set('Cargando datos de la orden...');
      this.showProgressModal.set(true);

      let workOrderData = this.workOrderBaseData();
      if (!workOrderData) {
        await this.loadWorkOrderBasePreview();
        workOrderData = this.workOrderBaseData();
      }

      if (!workOrderData) {
        throw new Error('No fue posible construir los datos de la orden de trabajo.');
      }

      this.generationProgress.set(20);
      this.generationStep.set('Descargando plantilla...');
      const response = await fetch(this.workOrderTemplatePath);

      if (!response.ok) {
        throw new Error('No fue posible leer la plantilla base de la orden de trabajo.');
      }

      const templateBuffer = await response.arrayBuffer();
      this.generationProgress.set(45);

      this.generationStep.set('Procesando documento...');
      this.ensureGenerationNotCancelled();
      const JSZipModule = await this.getJSZip();
      const zip = await JSZipModule.loadAsync(templateBuffer);
      const xmlEntries = zip.file(/^word\/(document|header\d+|footer\d+)\.xml$/);

      if (!xmlEntries.length) {
        throw new Error('La plantilla no contiene archivos XML de Word para reemplazar.');
      }

      for (const xmlEntry of xmlEntries) {
        this.ensureGenerationNotCancelled();
        const currentXml = await xmlEntry.async('string');
        const updatedXml = this.replaceWorkOrderTemplateValues(currentXml, workOrderData);
        zip.file(xmlEntry.name, updatedXml);
      }

      this.generationProgress.set(80);
      this.generationStep.set('Generando archivo...');
      this.ensureGenerationNotCancelled();
      const generatedDoc = await zip.generateAsync({
        type: 'uint8array',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

      this.generationProgress.set(95);
      this.generationStep.set('Descargando...');
      this.ensureGenerationNotCancelled();
      const safeOtNumber = (workOrderData.ot_number || 'sin_ot').replace(/[^\w.-]+/g, '_');
      const safeInformNumber = (workOrderData.inform_num || 'sin_informe').replace(/[^\w.-]+/g, '_');
      const fileName = `OT-${safeOtNumber}-${safeInformNumber}.docx`;
      this.downloadGeneratedDocument(generatedDoc, fileName);
      this.generationProgress.set(100);
      this.generationStep.set('¡Orden de trabajo generada!');
    } catch (error) {
      console.error(error);
      if (this.cancelGenerationRequested) {
        this.toastService.warning('Generación cancelada.');
      } else {
        this.toastService.error('No fue posible generar la orden de trabajo.');
        this.showProgressModal.set(false);
      }
    } finally {
      this.isGenerating.set(false);
      this.canCancelGeneration.set(false);
      setTimeout(() => this.showProgressModal.set(false), 900);
    }
  }

  async generateMeditionDocument(): Promise<void> {
    if (!this.workOrderId || this.isGenerating()) {
      return;
    }

    this.isGenerating.set(true);
    this.cancelGenerationRequested = false;
    this.canCancelGeneration.set(true);

    try {
      this.generationTitle.set('Generando registro de mediciones');
      this.generationProgress.set(0);
      this.generationStep.set('Cargando datos de la orden...');
      this.showProgressModal.set(true);

      const meditionData = await this.buildMeditionBaseData();
      this.generationProgress.set(22);

      this.generationStep.set('Descargando plantilla...');
      const response = await fetch(this.meditionTemplatePath);

      if (!response.ok) {
        throw new Error('No fue posible leer la plantilla base del registro de mediciones.');
      }

      const templateBuffer = await response.arrayBuffer();
      this.generationProgress.set(45);

      this.generationStep.set('Procesando documento...');
      this.ensureGenerationNotCancelled();
      const JSZipModule = await this.getJSZip();
      const zip = await JSZipModule.loadAsync(templateBuffer);
      const xmlEntries = zip.file(/^word\/(document|header\d+|footer\d+)\.xml$/);

      if (!xmlEntries.length) {
        throw new Error('La plantilla no contiene archivos XML de Word para reemplazar.');
      }

      for (const xmlEntry of xmlEntries) {
        this.ensureGenerationNotCancelled();
        const currentXml = await xmlEntry.async('string');
        const updatedXml = this.replaceBraceTemplateValues(currentXml, meditionData);
        zip.file(xmlEntry.name, updatedXml);
      }

      this.generationProgress.set(62);
      this.generationStep.set('Capturando tabla de mediciones...');
      this.ensureGenerationNotCancelled();
      const meditionTableImages = await this.captureMeditionTableImages();

      if (meditionTableImages.length) {
        this.generationProgress.set(78);
        this.generationStep.set('Integrando tabla al documento...');
        this.ensureGenerationNotCancelled();
        await this.embedImagesIntoDocument(zip, meditionTableImages);
      }

      this.generationProgress.set(82);
      this.generationStep.set('Generando archivo...');
      this.ensureGenerationNotCancelled();
      const generatedDoc = await zip.generateAsync({
        type: 'uint8array',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

      this.generationProgress.set(96);
      this.generationStep.set('Descargando...');
      this.ensureGenerationNotCancelled();
      const fileName = `${(meditionData.inform_num || 'registro_mediciones').replace(/[^\w.-]+/g, '_')}.docx`;
      this.downloadGeneratedDocument(generatedDoc, fileName);
      this.generationProgress.set(100);
      this.generationStep.set('¡Registro de mediciones generado!');
    } catch (error) {
      console.error(error);
      if (this.cancelGenerationRequested) {
        this.toastService.warning('Generación cancelada.');
      } else {
        this.toastService.error('No fue posible generar el registro de mediciones.');
        this.showProgressModal.set(false);
      }
    } finally {
      this.isGenerating.set(false);
      this.canCancelGeneration.set(false);
      setTimeout(() => this.showProgressModal.set(false), 900);
    }
  }

  private async buildInformData(includeHumidityControl: boolean): Promise<InformNom22Data> {
    const order = await firstValueFrom(this.workOrderService.getWorkOrderById(this.workOrderId));

    if (!order) {
      throw new Error('La orden de trabajo no fue encontrada.');
    }

    console.log('InformData observerName', order.observerName);

    const [client, plant, equipments, signatoryUser] = await Promise.all([
      order.clientId
        ? firstValueFrom(this.clientService.getClientById(order.clientId))
        : Promise.resolve(null),
      order.clientId && order.plantId
        ? firstValueFrom(this.clientService.getClientPlantById(order.clientId, order.plantId))
        : Promise.resolve(null),
      firstValueFrom(this.workOrderService.getEquipments(this.workOrderId)),
      order.signatoryId
        ? firstValueFrom(this.userService.getUserById(order.signatoryId))
        : Promise.resolve(null),
    ]);

    const mainEquipment = equipments.find((equipment) => equipment.active) ?? equipments[0] ?? null;
    const masterEquipment =
      mainEquipment?.equipmentId
        ? await firstValueFrom(this.equipmentService.getEquipmentById(mainEquipment.equipmentId))
        : null;
    const resolvedEquipment = this.mergeWorkOrderEquipmentWithMaster(mainEquipment, masterEquipment);
    const today = new Date();
    const orderCreatedAt = order.createdAt || today;
    const measurementStep = this.measurementStep();
    const serviceSchedule = await firstValueFrom(
      this.workOrderService.getServiceSchedule(this.workOrderId).pipe(take(1))
    );

    this.workOrderBaseData.set(
      this.buildWorkOrderBaseData(order, plant, resolvedEquipment, serviceSchedule, signatoryUser)
    );
    const hasLightningRodData = this.lightningRodPoints().length > 0;

    return {
      client_image: client?.urlLogo?.trim() || client?.brandUrl?.trim() || '',
      client_name: client?.legalName?.trim() || client?.name?.trim() || order.clientName?.trim() || '',
      client_activity: client?.client_activity?.trim() || '',
      client_address: this.buildClientAddressForInform(plant),
      inform_number: order.informNumber?.trim() || '',
      date_address: this.buildDateAddress(plant, orderCreatedAt),
      date_address_med: this.buildDateAddress(
        plant,
        order.observationDate || orderCreatedAt
      ),
      client_rfc: client?.rfc?.trim() || '',
      client_phone: client?.phone?.trim() || '',
      date: this.formatLongDate(today),
      signatario_name: order.observerName?.trim() || '',
      identifier: resolvedEquipment?.equipmentType?.trim() || '',
      model: resolvedEquipment?.equipmentModel?.trim() || '',
      ns: resolvedEquipment?.equipmentNs?.trim() || '',
      medition_interval:
        resolvedEquipment?.equipmentMeditionInterval?.trim() ||
        this.getMeasurementInterval(order, resolvedEquipment),
      precition:
        resolvedEquipment?.equipmentPrecition?.trim() ||
        this.getEquipmentPrecision(order, resolvedEquipment),
      frecuency: resolvedEquipment?.equipmentFrecuency?.trim() || '',
      especify_equipment:
        resolvedEquipment?.equipmentSpecifyEquipment?.trim() ||
        this.getEquipmentDescription(resolvedEquipment),
      no_pararrayos_title: hasLightningRodData ? '' : this.noLightningRodText,
      si_pararrayos_title: hasLightningRodData ? this.yesLightningRodText : '',
      tabla_4_2_2_id: this.table422Id,
      tabla_5_1_id: this.table51Id,
      tabla_5_2_id: includeHumidityControl ? this.table52Id : '',
      tabla_5_3_id: hasLightningRodData ? this.table53Id : '',
      charts: '',
    };
  }

  private buildWorkOrderBaseData(
    order: workOrder,
    plant: ClientPlant | null,
    equipment: workOrderEquipment | null,
    serviceSchedule: WorkOrderServiceScheduleItem[],
    signatoryUser: User | null
  ): WorkOrderBaseDocumentData {
    console.log('WorkOrderBaseData observerName', order.observerName);

    const scheduleByKey = new Map(
      serviceSchedule.map((item) => [item.activityKey, item] as const)
    );
    const impartiality = order.impartiality ?? this.buildEmptyImpartialityForInform();

    return {
      order_num: order.purchaseOrderNumber?.trim() || '',
      quote_num: order.quotationNumber?.trim() || '',
      ot_number: order.workOrderNumber?.trim() || '',
      inform_num: order.informNumber?.trim() || '',

      client_name: order.clientName?.trim() || '',
      plant_name: order.plantName?.trim() || plant?.name?.trim() || '',
      plant_adress: this.buildClientAddress(plant),
      plant_city: plant?.municipality?.trim() || '',
      plant_cp: plant?.postalCode?.trim() || '',
      contact_name: plant?.contactName?.trim() || '',
      contact_num: plant?.contactPhone?.trim() || '',

      service_name: order.nomCategoryServiceName?.trim() || order.nomName?.trim() || '',
      signatario_name: order.observerName?.trim() || '',
      equip_name: equipment?.equipmentType?.trim() || equipment?.equipmentName?.trim() || '',

      q1: this.getImpartialityAnswerLabel(impartiality.familiarAffinity),
      q2: this.getImpartialityAnswerLabel(impartiality.bloodRelationship),
      q3: this.getImpartialityAnswerLabel(impartiality.friendshipRelationship),
      q4: this.getImpartialityAnswerLabel(impartiality.commercialInterest),
      q5: this.getImpartialityAnswerLabel(impartiality.economicInterest),
      q6: this.getImpartialityAnswerLabel(impartiality.intimidation),
      q7: this.getImpartialityAnswerLabel(impartiality.serviceImpartialityRisk),

      responsable_1: this.getScheduleResponsible(scheduleByKey, 'reconocimiento'),
      responsable_1_date: this.getScheduleDate(scheduleByKey, 'reconocimiento'),
      responsable_2: this.getScheduleResponsible(scheduleByKey, 'medicion'),
      responsable_2_date: this.getScheduleDate(scheduleByKey, 'medicion'),
      responsable_3: this.getScheduleResponsible(scheduleByKey, 'plano'),
      responsable_3_date: this.getScheduleDate(scheduleByKey, 'plano'),
      responsable_4: this.getScheduleResponsible(scheduleByKey, 'generar_y_revisar_informe'),
      responsable_4_date: this.getScheduleDate(scheduleByKey, 'generar_y_revisar_informe'),
      responsable_5: this.getScheduleResponsible(scheduleByKey, 'revision_formato_campo'),
      responsable_5_date: this.getScheduleDate(scheduleByKey, 'revision_formato_campo'),
      responsable_6: this.getScheduleResponsible(scheduleByKey, 'impresion_informe'),
      responsable_6_date: this.getScheduleDate(scheduleByKey, 'impresion_informe'),
      responsable_7: this.getScheduleResponsible(scheduleByKey, 'entrega_y_facturacion'),
      responsable_7_date: this.getScheduleDate(scheduleByKey, 'entrega_y_facturacion'),

      comments: impartiality.observations?.trim() || '',
    };
  }

  private async buildMeditionBaseData(): Promise<MeditionBaseDocumentData> {
    const order = await firstValueFrom(this.workOrderService.getWorkOrderById(this.workOrderId));

    if (!order) {
      throw new Error('La orden de trabajo no fue encontrada.');
    }

    const [plant, equipments, signatoryUser] = await Promise.all([
      order.clientId && order.plantId
        ? firstValueFrom(this.clientService.getClientPlantById(order.clientId, order.plantId))
        : Promise.resolve(null),
      firstValueFrom(this.workOrderService.getEquipments(this.workOrderId)),
      order.signatoryId
        ? firstValueFrom(this.userService.getUserById(order.signatoryId))
        : Promise.resolve(null),
    ]);

    const mainEquipment = equipments.find((equipment) => equipment.active) ?? equipments[0] ?? null;
    const measurementStepEquipment =
      this.stepEquipments().find(
        (equipment) =>
          equipment.idDoc === mainEquipment?.idDoc ||
          equipment.equipmentId === mainEquipment?.equipmentId
      ) ?? null;
    const effectiveEquipment = mainEquipment
      ? {
          ...mainEquipment,
          equipmentVoltage:
            measurementStepEquipment?.equipmentVoltage || mainEquipment.equipmentVoltage,
        }
      : null;
    const masterEquipment =
      effectiveEquipment?.equipmentId
        ? await firstValueFrom(this.equipmentService.getEquipmentById(effectiveEquipment.equipmentId))
        : null;
    const resolvedEquipment = this.mergeWorkOrderEquipmentWithMaster(effectiveEquipment, masterEquipment);
    const measurementStep = this.measurementStep();

    return {
      inform_num: order.informNumber?.trim() || '',
      client_name: order.clientName?.trim() || '',
      plant_name: order.plantName?.trim() || plant?.name?.trim() || '',
      plant_adress: this.buildClientAddress(plant),
      plant_city: plant?.municipality?.trim() || '',
      plant_cp: plant?.postalCode?.trim() || '',
      contact_name: plant?.contactName?.trim() || '',
      contact_num: plant?.contactPhone?.trim() || '',
      medition_date: this.getMeditionDocumentDate(order, measurementStep),
      equip_name: resolvedEquipment?.equipmentName?.trim() || '',
      equip_identifier: resolvedEquipment?.equipmentType?.trim() || '',
      equip_brand: resolvedEquipment?.equipmentBrand?.trim() || '',
      equip_model: resolvedEquipment?.equipmentModel?.trim() || '',
      equip_ns: resolvedEquipment?.equipmentNs?.trim() || '',
      equip_range:
        resolvedEquipment?.equipmentMeditionInterval?.trim() ||
        this.getMeasurementInterval(order, resolvedEquipment),
      signatary_name: this.getFormalUserName(signatoryUser) || order.signatoryName?.trim() || '',
      value_volts:
        resolvedEquipment?.equipmentVoltage?.trim() ||
        masterEquipment?.voltage?.trim() ||
        '',
      number_polos: masterEquipment?.polos?.trim() || '',
      medition_table: '{medition_table}',
      comments: measurementStep?.observations?.trim() || '',
    };
  }

  private buildMeditionTableRows(points: Point[]): MeditionTableRow[] {
    return points.map((point) => ({
      point_number: point.pointNumber,
      area: point.location?.trim() || '',
      electrode_type: this.getElectrodeTypeDisplay(point),
      has_lightning_rod: point.hasLightningRod ? 'Sí' : 'No',

      soil_cemento: point.soilType === 'cement',
      soil_asfalto: point.soilType === 'asphalt',
      soil_tierra: point.soilType === 'soil',

      condition_seco: point.measurementCondition === 'dry',
      condition_humedo: point.measurementCondition === 'wet',

      voltage_yes: point.voltageStatus === 'presence',
      voltage_no: point.voltageStatus === 'absence',

      continuity_yes: point.hasContinuity === true,
      continuity_no: point.hasContinuity === false,

      measurement_1: this.formatMeditionTableValue(point.measurementData.p1_1m),
      measurement_4: this.formatMeditionTableValue(point.measurementData.p1_4m),
      measurement_7: this.formatMeditionTableValue(point.measurementData.p1_7m),
      measurement_10: this.formatMeditionTableValue(point.measurementData.p1_10m),
      measurement_13: this.formatMeditionTableValue(point.measurementData.p1_13m),
      measurement_16: this.formatMeditionTableValue(point.measurementData.p1_16m),
      measurement_19: this.formatMeditionTableValue(point.measurementData.p1_19m),

      generator_source: this.labelGeneratorSource(point),
      connected_equipment: this.getConnectedEquipmentRows(point)
        .filter((item) => item && item !== '//')
        .join(', '),
    }));
  }

  private chunkMeditionTableRows(rows: MeditionTableRow[], chunkSize: number): MeditionTableRow[][] {
    if (!rows.length) {
      return [];
    }

    const chunks: MeditionTableRow[][] = [];
    for (let index = 0; index < rows.length; index += chunkSize) {
      chunks.push(rows.slice(index, index + chunkSize));
    }

    return chunks;
  }

  private buildClientAddress(plant: ClientPlant | null): string {
    if (!plant) {
      return '';
    }

    return [
      plant.street,
      plant.exteriorNumber,
      plant.colony,
      plant.municipality,
      plant.state,
      plant.country,
    ]
      .map((part) => part?.trim() || '')
      .filter(Boolean)
      .join(', ');
  }

  private buildClientAddressForInform(plant: ClientPlant | null): string {
    if (!plant) {
      return '';
    }

    return [
      plant.street,
      plant.exteriorNumber,
      plant.colony,
      plant.municipality,
      plant.state,
      plant.country,
      plant.postalCode ? `C. P. ${plant.postalCode.trim()}` : '',
    ]
      .map((part) => part?.trim() || '')
      .filter(Boolean)
      .join(', ');
  }

  private buildDateAddress(plant: ClientPlant | null, currentDate: Date): string {
    const location = [plant?.municipality, plant?.state]
      .map((part) => part?.trim() || '')
      .filter(Boolean)
      .join(', ');

    const formattedDate = this.formatLongDate(currentDate);
    return location ? `${location}. ${formattedDate}` : formattedDate;
  }

  private formatLongDate(value: Date): string {
    const parts = new Intl.DateTimeFormat('es-MX', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).formatToParts(value);

    const day = parts.find((part) => part.type === 'day')?.value ?? '';
    const month = parts.find((part) => part.type === 'month')?.value ?? '';
    const year = parts.find((part) => part.type === 'year')?.value ?? '';

    return `${day} de ${month} de ${year}`;
  }

  private getMeasurementInterval(_order: workOrder, equipment: workOrderEquipment | null): string {
    return (equipment?.createdAt ? this.formatShortDate(equipment.createdAt) : '') || '';
  }

  private getEquipmentPrecision(_order: workOrder, _equipment: workOrderEquipment | null): string {
    return '';
  }

  private getEquipmentDescription(equipment: workOrderEquipment | null): string {
    return [
      equipment?.equipmentName,
      equipment?.equipmentBrand,
      equipment?.equipmentModel,
    ]
      .map((part) => part?.trim() || '')
      .filter(Boolean)
      .join(' ');
  }

  private formatShortDate(value: Date): string {
    return new Intl.DateTimeFormat('es-MX', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(value);
  }

  private toDateInputValue(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private parseDateInputValue(value: string): Date | undefined {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }

    const [yearText, monthText, dayText] = trimmed.split('-');
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);

    if (!year || !month || !day) {
      return undefined;
    }

    const parsedDate = new Date(year, month - 1, day);
    return Number.isNaN(parsedDate.getTime()) ? undefined : parsedDate;
  }

  private formatMeditionTableValue(value: number | null | undefined): string {
    return value != null ? value.toFixed(2) : '';
  }

  private getImpartialityAnswerLabel(value: boolean | null | undefined): string {
    if (value === true) return 'Sí';
    if (value === false) return 'No';
    return '';
  }

  private getScheduleResponsible(
    scheduleByKey: Map<WorkOrderServiceScheduleActivity, WorkOrderServiceScheduleItem>,
    key: WorkOrderServiceScheduleActivity
  ): string {
    return scheduleByKey.get(key)?.responsibleUserName?.trim() || '';
  }

  private getScheduleDate(
    scheduleByKey: Map<WorkOrderServiceScheduleActivity, WorkOrderServiceScheduleItem>,
    key: WorkOrderServiceScheduleActivity
  ): string {
    const date = scheduleByKey.get(key)?.scheduledDate;
    return date ? this.formatShortDate(date) : '';
  }

  private toInformServiceScheduleRows(items: WorkOrderServiceScheduleItem[]): InformServiceScheduleRow[] {
    const byKey = new Map(items.map((item) => [item.activityKey, item] as const));

    return this.getDefaultServiceScheduleTemplates().map((template) => {
      const item = byKey.get(template.activityKey);

      return {
        idDoc: item?.idDoc || template.idDoc,
        activityKey: template.activityKey,
        activityLabel: template.activityLabel,
        responsibleUserId: item?.responsibleUserId || '',
        responsibleUserName: item?.responsibleUserName || '',
        scheduledDateText: item?.scheduledDate ? this.toDateInputValue(item.scheduledDate) : '',
        order: template.order,
      };
    });
  }

  private buildServiceSchedulePayload(): WorkOrderServiceScheduleItem[] {
    return this.serviceScheduleRows().map((row) => ({
      idDoc: row.idDoc,
      workOrderId: this.workOrderId,
      activityKey: row.activityKey,
      activityLabel: row.activityLabel,
      responsibleUserId: row.responsibleUserId || undefined,
      responsibleUserName: row.responsibleUserName || undefined,
      scheduledDate: this.parseDateInputValue(row.scheduledDateText),
      order: row.order,
      active: true,
      createdAt: new Date(),
    }));
  }

  private getDefaultServiceScheduleTemplates(): InformServiceScheduleRow[] {
    return [
      { idDoc: '01-reconocimiento', activityKey: 'reconocimiento', activityLabel: 'Reconocimiento', responsibleUserId: '', responsibleUserName: '', scheduledDateText: '', order: 1 },
      { idDoc: '02-medicion', activityKey: 'medicion', activityLabel: 'Medición', responsibleUserId: '', responsibleUserName: '', scheduledDateText: '', order: 2 },
      { idDoc: '03-plano', activityKey: 'plano', activityLabel: 'Plano', responsibleUserId: '', responsibleUserName: '', scheduledDateText: '', order: 3 },
      { idDoc: '04-generar_y_revisar_informe', activityKey: 'generar_y_revisar_informe', activityLabel: 'Generar y revisar informe', responsibleUserId: '', responsibleUserName: '', scheduledDateText: '', order: 4 },
      { idDoc: '05-revision_formato_campo', activityKey: 'revision_formato_campo', activityLabel: 'Revisión del formato de campo', responsibleUserId: '', responsibleUserName: '', scheduledDateText: '', order: 5 },
      { idDoc: '06-impresion_informe', activityKey: 'impresion_informe', activityLabel: 'Impresión informe', responsibleUserId: '', responsibleUserName: '', scheduledDateText: '', order: 6 },
      { idDoc: '07-entrega_y_facturacion', activityKey: 'entrega_y_facturacion', activityLabel: 'Entrega y Facturación', responsibleUserId: '', responsibleUserName: '', scheduledDateText: '', order: 7 },
    ];
  }

  private buildEmptyImpartialityForInform(): WorkOrderImpartiality {
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

  private replaceTemplateValues(xml: string, data: InformNom22Data): string {
    const replacements = Object.entries(data)
      .filter(([, value]) => typeof value === 'string')
      .filter(([key, value]) => {
        const typedKey = key as keyof InformNom22Data;
        if (this.stackedImagePlaceholderKeys.has(typedKey)) {
          return false;
        }

        if (this.imagePlaceholderKeys.has(typedKey) && value) {
          return false;
        }

        return true;
      }) as Array<[keyof InformNom22Data, string]>;

    return this.replaceDelimitedTemplateValues(xml, replacements, '{{', '}}');
  }

  private replaceWorkOrderTemplateValues(xml: string, data: WorkOrderBaseDocumentData): string {
    return this.replaceBraceTemplateValues(xml, data);
  }

  private replaceBraceTemplateValues<T extends object>(xml: string, data: T): string {
    const parser = new DOMParser();
    const xmlDocument = parser.parseFromString(xml, 'application/xml');
    const parserError = xmlDocument.getElementsByTagName('parsererror')[0];

    if (parserError) {
      return xml;
    }

    const textNodes = Array.from(xmlDocument.getElementsByTagName('w:t'));
    if (!textNodes.length) {
      return xml;
    }

    const placeholders = Object.entries(data) as Array<[keyof T, string]>;

    for (const [key, rawValue] of placeholders) {
      const placeholder = `{${String(key)}}`;
      if ((rawValue || '') === placeholder) {
        continue;
      }

      while (true) {
        const occurrence = this.findWorkOrderPlaceholderOccurrence(textNodes, placeholder);
        if (!occurrence) {
          break;
        }

        const startText = textNodes[occurrence.startNodeIndex].textContent ?? '';
        const endText = textNodes[occurrence.endNodeIndex].textContent ?? '';
        const prefix = startText.slice(0, occurrence.startOffset);
        const suffix = endText.slice(occurrence.endOffset + 1);

        textNodes[occurrence.startNodeIndex].textContent = `${prefix}${rawValue || ''}${suffix}`;

        for (
          let nodeIndex = occurrence.startNodeIndex + 1;
          nodeIndex <= occurrence.endNodeIndex;
          nodeIndex += 1
        ) {
          textNodes[nodeIndex].textContent = '';
        }
      }
    }

    let serializedXml = new XMLSerializer().serializeToString(xmlDocument);

    for (const [key, rawValue] of placeholders) {
      const placeholder = `{${String(key)}}`;
      serializedXml = serializedXml.replace(
        new RegExp(this.escapeRegExp(placeholder), 'g'),
        this.escapeXml(rawValue || '')
      );
    }

    return serializedXml;
  }

  private replaceDelimitedTemplateValues<T extends string>(
    xml: string,
    replacements: Array<[T, string]>,
    opening: string,
    closing: string
  ): string {
    const parser = new DOMParser();
    const xmlDocument = parser.parseFromString(xml, 'application/xml');
    const parserError = xmlDocument.getElementsByTagName('parsererror')[0];

    if (parserError) {
      return xml;
    }

    const textNodes = Array.from(xmlDocument.getElementsByTagName('w:t'));
    if (!textNodes.length) {
      return xml;
    }

    for (const [key, rawValue] of replacements) {
      const placeholder = `${opening}${String(key)}${closing}`;

      while (true) {
        const occurrence = this.findPlaceholderOccurrence(textNodes, placeholder);
        if (!occurrence) {
          break;
        }

        const startText = textNodes[occurrence.startNodeIndex].textContent ?? '';
        const endText = textNodes[occurrence.endNodeIndex].textContent ?? '';
        const prefix = startText.slice(0, occurrence.startOffset);
        const suffix = endText.slice(occurrence.endOffset + 1);

        textNodes[occurrence.startNodeIndex].textContent = `${prefix}${rawValue || ''}${suffix}`;

        for (
          let nodeIndex = occurrence.startNodeIndex + 1;
          nodeIndex <= occurrence.endNodeIndex;
          nodeIndex += 1
        ) {
          textNodes[nodeIndex].textContent = '';
        }
      }
    }

    let serializedXml = new XMLSerializer().serializeToString(xmlDocument);

    for (const [key, rawValue] of replacements) {
      const placeholder = `${opening}${String(key)}${closing}`;
      serializedXml = serializedXml.replace(
        new RegExp(this.escapeRegExp(placeholder), 'g'),
        this.escapeXml(rawValue || '')
      );
    }

    return serializedXml;
  }

  private findPlaceholderOccurrence(
    textNodes: Element[],
    placeholder: string
  ): {
    startNodeIndex: number;
    startOffset: number;
    endNodeIndex: number;
    endOffset: number;
  } | null {
    let combined = '';
    const charMap: Array<{ nodeIndex: number; offset: number }> = [];

    textNodes.forEach((node, nodeIndex) => {
      const value = node.textContent ?? '';
      for (let offset = 0; offset < value.length; offset += 1) {
        combined += value[offset];
        charMap.push({ nodeIndex, offset });
      }
    });

    const start = combined.indexOf(placeholder);
    if (start === -1) {
      return null;
    }

    const end = start + placeholder.length - 1;
    const startPosition = charMap[start];
    const endPosition = charMap[end];

    if (!startPosition || !endPosition) {
      return null;
    }

    return {
      startNodeIndex: startPosition.nodeIndex,
      startOffset: startPosition.offset,
      endNodeIndex: endPosition.nodeIndex,
      endOffset: endPosition.offset,
    };
  }

  private findWorkOrderPlaceholderOccurrence(
    textNodes: Element[],
    placeholder: string
  ): {
    startNodeIndex: number;
    startOffset: number;
    endNodeIndex: number;
    endOffset: number;
  } | null {
    let combined = '';
    const charMap: Array<{ nodeIndex: number; offset: number }> = [];

    textNodes.forEach((node, nodeIndex) => {
      const value = node.textContent ?? '';
      for (let offset = 0; offset < value.length; offset += 1) {
        combined += value[offset];
        charMap.push({ nodeIndex, offset });
      }
    });

    const start = combined.indexOf(placeholder);
    if (start === -1) {
      return null;
    }

    const end = start + placeholder.length - 1;
    const startPosition = charMap[start];
    const endPosition = charMap[end];

    if (!startPosition || !endPosition) {
      return null;
    }

    return {
      startNodeIndex: startPosition.nodeIndex,
      startOffset: startPosition.offset,
      endNodeIndex: endPosition.nodeIndex,
      endOffset: endPosition.offset,
    };
  }

  private escapeXml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private downloadGeneratedDocument(content: Uint8Array, fileName: string): void {
    const blobBytes = new Uint8Array(Array.from(content));
    const blob = new Blob([blobBytes], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private async captureReportTableImages(
    includeHumidityControl: boolean
  ): Promise<ReportEmbeddedImage[]> {
    const previousTab = this.activeTab();
    this.activeTab.set('tables');
    await this.waitForDomRender();

    try {
      const targets = [
        { placeholder: 'tabla_4_2_2_id', elementId: this.table422Id },
        { placeholder: 'tabla_5_1_id', elementId: this.table51Id },
        ...(includeHumidityControl
          ? ([{ placeholder: 'tabla_5_2_id', elementId: this.table52Id }] as const)
          : []),
        { placeholder: 'tabla_5_3_id', elementId: this.table53Id },
      ] as const;

      const results: ReportEmbeddedImage[] = [];

      const html2canvas = await this.getHtml2Canvas();

      for (const target of targets) {
        const element = document.getElementById(target.elementId);
        if (!element) {
          continue;
        }

        const canvas = await html2canvas(element, {
          backgroundColor: '#ffffff',
          scale: 2,
          useCORS: true,
          logging: false,
        });

        const blob = await this.canvasToBlob(canvas);
        const bytes = new Uint8Array(await blob.arrayBuffer());

        results.push({
          placeholder: target.placeholder,
          bytes,
          widthPx: canvas.width,
          heightPx: canvas.height,
        });
      }

      return results;
    } finally {
      this.activeTab.set(previousTab);
      await this.waitForDomRender();
    }
  }

  private async captureClientLogoImage(imageUrl: string): Promise<ReportEmbeddedImage | null> {
    const imageSrc = imageUrl.trim() || this.clientLogoPreviewUrl().trim();
    if (!imageSrc) {
      return null;
    }

    let preparedLogo: { blob: Blob; width: number; height: number; dataUrl: string } | null = null;

    try {
      const storageBlob = await getBlob(ref(this.storage, imageSrc));
      const { blob, width, height } = await this.convertImageBlobToPng(storageBlob);
      const dataUrl = await this.blobToDataUrl(blob);
      preparedLogo = { blob, width, height, dataUrl };
    } catch {
      preparedLogo = null;
    }

    if (!preparedLogo) {
      try {
        const directImageResult = await this.loadRemoteImageAsPng(imageSrc);
        const dataUrl = await this.blobToDataUrl(directImageResult.blob);
        preparedLogo = { ...directImageResult, dataUrl };
      } catch {
        preparedLogo = null;
      }
    }

    if (!preparedLogo) {
      return null;
    }

    const bytes = new Uint8Array(await preparedLogo.blob.arrayBuffer());
    return {
      placeholder: 'client_image',
      bytes,
      widthPx: preparedLogo.width,
      heightPx: preparedLogo.height,
      maxWidthEmu: 2_300_000,
      maxHeightEmu: 1_100_000,
      targetWidthEmu: 2_300_000,
      targetHeightEmu: 900_000,
    };
  }

  private waitForClientLogoRender(): Promise<void> {
    return new Promise((resolve, reject) => {
      const image = document.getElementById('inform-client-logo-preview-image') as HTMLImageElement | null;
      if (!image) {
        reject(new Error('No fue posible preparar el logo del cliente.'));
        return;
      }

      if (image.complete && image.naturalWidth > 0) {
        resolve();
        return;
      }

      const cleanup = () => {
        image.onload = null;
        image.onerror = null;
      };

      image.onload = () => {
        cleanup();
        resolve();
      };

      image.onerror = () => {
        cleanup();
        reject(new Error('No fue posible cargar el logo del cliente.'));
      };
    });
  }

  private async loadRemoteImageAsPng(
    imageUrl: string
  ): Promise<{ blob: Blob; width: number; height: number }> {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.referrerPolicy = 'no-referrer';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('No fue posible cargar el logo del cliente.'));
      img.src = imageUrl;
    });

    const width = image.naturalWidth || image.width || 1;
    const height = image.naturalHeight || image.height || 1;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('No fue posible preparar el canvas del logo del cliente.');
    }

    context.drawImage(image, 0, 0, width, height);

    const blob = await this.canvasToBlob(canvas);
    return { blob, width, height };
  }

  private async captureChartImages(): Promise<ReportEmbeddedImage[]> {
    const previousTab = this.activeTab();
    this.activeTab.set('charts');
    await this.waitForDomRender();

    try {
      const html2canvas = await this.getHtml2Canvas();
      const results: ReportEmbeddedImage[] = [];

      for (const point of this.points()) {
        const element = document.getElementById(`inform-chart-card-point-${point.pointNumber}`);
        if (!element) {
          continue;
        }

        const canvas = await html2canvas(element, {
          backgroundColor: '#ffffff',
          scale: 2,
          useCORS: true,
          logging: false,
        });

        const blob = await this.canvasToBlob(canvas);
        const bytes = new Uint8Array(await blob.arrayBuffer());

        results.push({
          placeholder: 'charts',
          bytes,
          widthPx: canvas.width,
          heightPx: canvas.height,
        });
      }

      return results;
    } finally {
      this.activeTab.set(previousTab);
      await this.waitForDomRender();
    }
  }

  private async captureMeditionTableImages(): Promise<ReportEmbeddedImage[]> {
    const previousTab = this.activeTab();
    this.activeTab.set('tables');
    await this.waitForDomRender();

    try {
      const html2canvas = await this.getHtml2Canvas();
      const results: ReportEmbeddedImage[] = [];

      for (let index = 0; index < this.meditionTableChunks().length; index += 1) {
        const element = document.getElementById(`medition_table_chunk_${index}`);
        if (!element) {
          continue;
        }

        const canvas = await html2canvas(element, {
          backgroundColor: '#ffffff',
          scale: 3,
          useCORS: true,
          logging: false,
        });

        const blob = await this.canvasToBlob(canvas);
        const bytes = new Uint8Array(await blob.arrayBuffer());

        results.push({
          placeholder: 'medition_table',
          bytes,
          widthPx: canvas.width,
          heightPx: canvas.height,
          targetWidthEmu: 9_546_336,
          targetHeightEmu: 1_609_344,
        });
      }

      return results;
    } finally {
      this.activeTab.set(previousTab);
      await this.waitForDomRender();
    }
  }

  private async embedImagesIntoDocument(
    zip: any,
    images: ReportEmbeddedImage[]
  ): Promise<void> {
    const documentFile = zip.file('word/document.xml');
    const relsFile = zip.file('word/_rels/document.xml.rels');

    if (!documentFile || !relsFile) {
      throw new Error('La plantilla no contiene el documento principal para insertar imágenes.');
    }

    let documentXml = await documentFile.async('string');
    let relsXml = await relsFile.async('string');
    let nextRelationshipId = this.getNextRelationshipId(relsXml);
    let nextImageIndex = this.getNextImageIndex(relsXml);
    let nextDocPrId = nextImageIndex + 1000;
    const placeholderParagraphs = new Map<ReportEmbeddedImage['placeholder'], string[]>();

    for (const image of images) {
      const relationshipId = `rId${nextRelationshipId++}`;
      const imageName = `image${nextImageIndex++}.png`;

      zip.file(`word/media/${imageName}`, image.bytes);
      relsXml = relsXml.replace(
        '</Relationships>',
        `<Relationship Id="${relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${imageName}"/></Relationships>`
      );

      const imageParagraph = this.buildWordImageParagraph(
        relationshipId,
        imageName,
        image.widthPx,
        image.heightPx,
        nextDocPrId++,
        image.maxWidthEmu,
        image.maxHeightEmu,
        image.targetWidthEmu,
        image.targetHeightEmu
      );

      const existingParagraphs = placeholderParagraphs.get(image.placeholder) ?? [];
      existingParagraphs.push(imageParagraph);
      placeholderParagraphs.set(image.placeholder, existingParagraphs);
    }

    for (const [placeholder, paragraphs] of placeholderParagraphs.entries()) {
      documentXml = this.replaceParagraphPlaceholderWithImage(
        documentXml,
        placeholder,
        placeholder === 'charts'
          ? this.joinImageParagraphsWithPageBreaks(paragraphs)
          : placeholder === 'medition_table'
            ? paragraphs.join('')
            : paragraphs.join('')
      );
    }

    zip.file('word/document.xml', documentXml);
    zip.file('word/_rels/document.xml.rels', relsXml);
  }

  private replaceParagraphPlaceholderWithImage(
    xml: string,
    placeholder: string,
    imageParagraph: string
  ): string {
    const escapedPlaceholder = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const paragraphPattern = new RegExp(
      `<w:p[^>]*>(?:(?!<w:p\\b|<\\/w:p>)[\\s\\S])*?<w:t>\\{\\{${escapedPlaceholder}\\}\\}<\\/w:t>(?:(?!<w:p\\b|<\\/w:p>)[\\s\\S])*?<\\/w:p>`,
      'g'
    );

    const splitParagraphPattern = new RegExp(
      `<w:p[^>]*>(?:(?!<w:p\\b|<\\/w:p>)[\\s\\S])*?<w:t>\\{\\{<\\/w:t>(?:(?!<w:p\\b|<\\/w:p>)[\\s\\S])*?<w:t>${escapedPlaceholder}<\\/w:t>(?:(?!<w:p\\b|<\\/w:p>)[\\s\\S])*?<w:t>\\}\\}<\\/w:t>(?:(?!<w:p\\b|<\\/w:p>)[\\s\\S])*?<\\/w:p>`,
      'g'
    );

    const singleParagraphPattern = new RegExp(
      `<w:p[^>]*>(?:(?!<w:p\\b|<\\/w:p>)[\\s\\S])*?<w:t>\\{${escapedPlaceholder}\\}<\\/w:t>(?:(?!<w:p\\b|<\\/w:p>)[\\s\\S])*?<\\/w:p>`,
      'g'
    );

    const splitSingleParagraphPattern = new RegExp(
      `<w:p[^>]*>(?:(?!<w:p\\b|<\\/w:p>)[\\s\\S])*?<w:t>\\{<\\/w:t>(?:(?!<w:p\\b|<\\/w:p>)[\\s\\S])*?<w:t>${escapedPlaceholder}<\\/w:t>(?:(?!<w:p\\b|<\\/w:p>)[\\s\\S])*?<w:t>\\}<\\/w:t>(?:(?!<w:p\\b|<\\/w:p>)[\\s\\S])*?<\\/w:p>`,
      'g'
    );

    const replaced = xml
      .replace(paragraphPattern, imageParagraph)
      .replace(splitParagraphPattern, imageParagraph)
      .replace(singleParagraphPattern, imageParagraph);

    return replaced.replace(splitSingleParagraphPattern, imageParagraph);
  }

  private buildWordImageParagraph(
    relationshipId: string,
    imageName: string,
    widthPx: number,
    heightPx: number,
    docPrId: number,
    maxWidthEmu = 5_900_000,
    maxHeightEmu = 7_200_000,
    targetWidthEmu?: number,
    targetHeightEmu?: number
  ): string {
    if (targetWidthEmu && targetHeightEmu) {
      return `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:noProof/></w:rPr><w:drawing><wp:inline distT="0" distB="0" distL="114300" distR="114300" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="${targetWidthEmu}" cy="${targetHeightEmu}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${docPrId}" name="${imageName}"/><wp:cNvGraphicFramePr/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="${imageName}"/><pic:cNvPicPr preferRelativeResize="0"/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relationshipId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${targetWidthEmu}" cy="${targetHeightEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
    }

    let widthEmu = Math.round(widthPx * 9525);
    let heightEmu = Math.round(heightPx * 9525);

    const widthRatio = widthEmu > maxWidthEmu ? maxWidthEmu / widthEmu : 1;
    const heightRatio = heightEmu > maxHeightEmu ? maxHeightEmu / heightEmu : 1;
    const ratio = Math.min(widthRatio, heightRatio);

    widthEmu = Math.max(1, Math.round(widthEmu * ratio));
    heightEmu = Math.max(1, Math.round(heightEmu * ratio));

    return `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:noProof/></w:rPr><w:drawing><wp:inline distT="0" distB="0" distL="114300" distR="114300" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="${widthEmu}" cy="${heightEmu}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${docPrId}" name="${imageName}"/><wp:cNvGraphicFramePr/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="${imageName}"/><pic:cNvPicPr preferRelativeResize="0"/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relationshipId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${widthEmu}" cy="${heightEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
  }

  private joinImageParagraphsWithPageBreaks(paragraphs: string[]): string {
    return paragraphs
      .map((paragraph, index) =>
        index === 0 ? paragraph : `${this.buildWordPageBreakParagraph()}${paragraph}`
      )
      .join('');
  }

  private buildWordPageBreakParagraph(): string {
    return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  }

  private async removeDelimitedPlaceholderFromDocument(
    zip: any,
    placeholder: string,
    opening: string,
    closing: string
  ): Promise<void> {
    const xmlEntries = zip.file(/^word\/(document|header\d+|footer\d+)\.xml$/);
    for (const xmlEntry of xmlEntries) {
      const currentXml = await xmlEntry.async('string');
      const updatedXml = this.replaceDelimitedTemplateValues(
        currentXml,
        [[placeholder, '']],
        opening,
        closing
      );
      zip.file(xmlEntry.name, updatedXml);
    }
  }

  private getHtml2Canvas(): Promise<typeof import('html2canvas')['default']> {
    this.html2canvasLoader ??= import('html2canvas').then((module) => module.default);
    return this.html2canvasLoader;
  }

  private getJSZip(): Promise<any> {
    this.jszipLoader ??= import('jszip').then((module) => module.default);
    return this.jszipLoader;
  }

  private getNextRelationshipId(relsXml: string): number {
    const matches = Array.from(relsXml.matchAll(/Id="rId(\d+)"/g));
    return matches.length
      ? Math.max(...matches.map((match) => Number(match[1] || 0))) + 1
      : 1;
  }

  private getNextImageIndex(relsXml: string): number {
    const matches = Array.from(relsXml.matchAll(/Target="media\/image(\d+)\.png"/g));
    return matches.length
      ? Math.max(...matches.map((match) => Number(match[1] || 0))) + 1
      : 1;
  }

  private canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        reject(new Error('No fue posible convertir la tabla a imagen.'));
      }, 'image/png');
    });
  }

  private blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('No fue posible convertir el logo del cliente.'));
      reader.readAsDataURL(blob);
    });
  }


  private getImageDimensionsFromBlob(blob: Blob): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(blob);
      const image = new Image();

      image.onload = () => {
        const width = image.naturalWidth || 1;
        const height = image.naturalHeight || 1;
        URL.revokeObjectURL(objectUrl);
        resolve({ width, height });
      };

      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('No fue posible leer el tamaño de la imagen.'));
      };

      image.src = objectUrl;
    });
  }

  private async convertImageBlobToPng(
    blob: Blob
  ): Promise<{ blob: Blob; width: number; height: number }> {
    const objectUrl = URL.createObjectURL(blob);

    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('No fue posible cargar la imagen del cliente.'));
        img.src = objectUrl;
      });

      const width = image.naturalWidth || 1;
      const height = image.naturalHeight || 1;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('No fue posible preparar el canvas del logo del cliente.');
      }

      context.drawImage(image, 0, 0, width, height);

      const pngBlob = await this.canvasToBlob(canvas);
      return { blob: pngBlob, width, height };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  private waitForDomRender(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  cancelGeneration(): void {
    if (!this.isGenerating()) {
      return;
    }

    this.cancelGenerationRequested = true;
    this.generationStep.set('Cancelando...');
  }

  private ensureGenerationNotCancelled(): void {
    if (this.cancelGenerationRequested) {
      throw new Error('Generation cancelled by user');
    }
  }

  private askHumidityControlQuestion(): Promise<boolean | null> {
    this.showHumidityQuestion = true;

    return new Promise<boolean | null>((resolve) => {
      this.humidityQuestionResolver = resolve;
    });
  }

  answerHumidityControlQuestion(answer: boolean | null): void {
    this.showHumidityQuestion = false;
    this.humidityQuestionResolver?.(answer);
    this.humidityQuestionResolver = null;
  }

  private mergeWorkOrderEquipmentWithMaster(
    item: workOrderEquipment | null,
    master: equipment | null
  ): workOrderEquipment | null {
    if (!item) {
      return null;
    }

    if (!master) {
      return item;
    }

    return {
      ...item,
      equipmentName: item.equipmentName || master.name,
      equipmentType: item.equipmentType || master.identifier,
      equipmentBrand: item.equipmentBrand || master.brand,
      equipmentModel: item.equipmentModel || master.model,
      equipmentNs: item.equipmentNs || master.ns,
      equipmentSerialNumber: item.equipmentSerialNumber || master.ns,
      equipmentFrecuency: item.equipmentFrecuency || master.frecuency,
      equipmentMeditionInterval: item.equipmentMeditionInterval || master.range,
      equipmentPrecition: item.equipmentPrecition || master.precition,
      equipmentSpecifyEquipment: item.equipmentSpecifyEquipment || master.especify_equipment,
      equipmentVoltage: item.equipmentVoltage || master.voltage,
    };
  }

  private getMeditionDocumentDate(order: workOrder, step: workOrderStep | null): string {
    const date = step?.completedAt || step?.startedAt || order.observationDate || new Date();
    return this.formatShortDate(date);
  }

}

interface ReportEmbeddedImage {
  placeholder:
    | 'client_image'
    | 'tabla_4_2_2_id'
    | 'tabla_5_1_id'
    | 'tabla_5_2_id'
    | 'tabla_5_3_id'
    | 'charts'
    | 'medition_table';
  bytes: Uint8Array;
  widthPx: number;
  heightPx: number;
  maxWidthEmu?: number;
  maxHeightEmu?: number;
  targetWidthEmu?: number;
  targetHeightEmu?: number;
}

interface InformServiceScheduleRow {
  idDoc: string;
  activityKey: WorkOrderServiceScheduleActivity;
  activityLabel: string;
  responsibleUserId: string;
  responsibleUserName: string;
  scheduledDateText: string;
  order: number;
}
