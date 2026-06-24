import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnInit,
  SimpleChanges,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, forkJoin, map, of, switchMap, take } from 'rxjs';
import * as XLSX from 'xlsx';

import { AuthService } from '../../services/auth.service';
import { CalibrationRow, equipment } from '../../interfaces/meditionType.interface';
import { GeneratorSource, Point } from '../../interfaces/measurements.interface';
import { WorkOrderClientVisitSignature, workOrderEquipment } from '../../interfaces/workOrder.interface';
import { EquipmentService } from '../../services/equipment.service';
import { ToastService } from '../../services/toast.service';
import { WorkOrderService } from '../../services/work-order.service';

@Component({
  selector: 'app-measurements',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './measurements.component.html',
  styleUrl: './measurements.component.scss',
})
export class MeasurementsComponent implements OnInit, OnChanges {
  @ViewChild('signatureCanvas') signatureCanvas?: ElementRef<HTMLCanvasElement>;

  @Input() workOrderId = '';
  @Input() workflowStepId = '';
  @Input() cableResistance: number | null = null;

  private authService = inject(AuthService);
  private workOrderService = inject(WorkOrderService);
  private equipmentService = inject(EquipmentService);
  private toastService = inject(ToastService);

  equipments = signal<workOrderEquipment[]>([]);
  points = signal<Point[]>([]);
  selectedPointId = signal<string>('');
  draftPointId = signal<string>('');
  activeTab = signal<'points' | 'correction'>('points');
  voltageEdits = signal<Record<string, string>>({});
  savingVoltageId = signal<string | null>(null);
  isSavingPoints = signal(false);
  isSavingSignature = signal(false);
  isLoading = signal(true);
  currentUserId = signal('');
  savedSignaturePreview = signal('');
  signatureSignedAt = signal('');
  signatureForm = {
    signedByName: '',
    signedByRole: '',
    observations: '',
  };
  private isDrawingSignature = false;
  private hasSignatureStroke = false;
  readonly generatorSourceOptions: Array<{ value: GeneratorSource; label: string }> = [
    { value: 'structure', label: 'Estructura' },
    { value: 'electrical_equipment', label: 'Equipo eléctrico' },
    { value: 'lightning_rod', label: 'Pararrayo' },
    { value: 'no_equipment', label: 'Sin equipo' },
  ];
  readonly factorCorreccion = computed(() =>
    this.equipments().find((e) => e.promedioFC != null)?.promedioFC ?? null
  );

  readonly selectedPoint = computed(
    () => this.points().find((point) => point.idDoc === this.selectedPointId()) || null
  );

  ngOnInit(): void {
    this.authService.currentUser$.pipe(take(1)).subscribe((user) => {
      this.currentUserId.set(user?.uid || '');
    });
    this.loadMeasurementData();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['workOrderId'] || changes['workflowStepId']) {
      this.loadMeasurementData();
    }
  }

  private loadMeasurementData(): void {
    if (!this.workOrderId || !this.workflowStepId) {
      this.isLoading.set(false);
      return;
    }

    this.isLoading.set(true);

    this.workOrderService
      .getEquipments(this.workOrderId)
      .pipe(take(1))
      .subscribe({
        next: (items) => {
          if (!items.length) {
            this.equipments.set([]);
            this.isLoading.set(false);
            return;
          }

          forkJoin({
            orderEquipments: forkJoin(
              items.map((item) =>
                this.equipmentService.getEquipmentById(item.equipmentId).pipe(
                  take(1),
                  map((master) => this.merge(item, master)),
                  catchError(() => of(item))
                )
              )
            ),
            stepEquipments: this.workOrderService
              .getWorkflowStepEquipments(this.workOrderId, this.workflowStepId)
              .pipe(take(1)),
            points: this.workOrderService
              .getMeasurementPoints(this.workOrderId, this.workflowStepId)
              .pipe(take(1)),
            step: this.workOrderService
              .getWorkflowStep(this.workOrderId, this.workflowStepId)
              .pipe(take(1)),
          }).subscribe({
            next: ({ orderEquipments, stepEquipments, points, step }) => {
              const stepEquipmentsMap = new Map(stepEquipments.map((item) => [item.idDoc, item]));
              const merged = orderEquipments.map((item) => {
                const step = stepEquipmentsMap.get(item.idDoc);
                return {
                  ...item,
                  equipmentVoltage: step?.equipmentVoltage || item.equipmentVoltage,
                  promedioFC: step?.promedioFC ?? item.promedioFC,
                };
              });
              this.equipments.set(merged);
              this.points.set(points);
              const currentSelectedId = this.selectedPointId();
              const existsSelected = points.some((point) => point.idDoc === currentSelectedId);
              this.selectedPointId.set(existsSelected ? currentSelectedId : '');
              this.applyClientVisitSignature(step?.clientVisitSignature);
              this.isLoading.set(false);

              // Para equipos con voltaje guardado pero sin promedioFC, calcularlo automáticamente
              merged
                .filter((e) => e.equipmentVoltage && e.promedioFC == null)
                .forEach((e) => this.recalcPromedioFC(e));

              setTimeout(() => this.renderSignatureCanvas(), 0);
            },
            error: () => {
              this.toastService.error('No fue posible cargar la información de medición.');
              this.isLoading.set(false);
            },
          });
        },
        error: () => {
          this.isLoading.set(false);
          this.toastService.error('No fue posible cargar los equipos de la orden.');
        },
      });
  }

  setVoltageEdit(equipmentId: string, value: string): void {
    this.voltageEdits.update((edits) => ({ ...edits, [equipmentId]: value }));
  }

  saveVoltage(item: workOrderEquipment): void {
    if (this.savingVoltageId()) return;

    const voltage = (this.voltageEdits()[item.idDoc] ?? item.equipmentVoltage ?? '').trim();

    this.savingVoltageId.set(item.idDoc);

    this.equipmentService.getCalibrationRecords(item.equipmentId).pipe(
      take(1),
      switchMap((records) => {
        const latest = records[0] ?? null;
        const promedioFC = latest ? this.computePromedioFC(latest.calibrationRows25v, latest.calibrationRows50v, voltage) : null;
        return this.workOrderService
          .updateWorkflowStepEquipmentVoltage(this.workOrderId, this.workflowStepId, item, voltage, promedioFC)
          .pipe(map(() => promedioFC));
      })
    ).subscribe({
      next: (promedioFC) => {
        this.equipments.update((list) =>
          list.map((e) =>
            e.idDoc === item.idDoc
              ? { ...e, equipmentVoltage: voltage, promedioFC: promedioFC ?? undefined }
              : e
          )
        );
        this.voltageEdits.update((edits) => {
          const updated = { ...edits };
          delete updated[item.idDoc];
          return updated;
        });
        this.savingVoltageId.set(null);
        this.toastService.success('Voltaje actualizado correctamente.');
      },
      error: () => {
        this.savingVoltageId.set(null);
        this.toastService.error('No fue posible actualizar el voltaje.');
      },
    });
  }

  private recalcPromedioFC(item: workOrderEquipment): void {
    this.equipmentService.getCalibrationRecords(item.equipmentId).pipe(
      take(1),
      switchMap((records) => {
        const latest = records[0] ?? null;
        const promedioFC = latest
          ? this.computePromedioFC(latest.calibrationRows25v, latest.calibrationRows50v, item.equipmentVoltage ?? '')
          : null;
        return this.workOrderService
          .updateWorkflowStepEquipmentVoltage(this.workOrderId, this.workflowStepId, item, item.equipmentVoltage ?? '', promedioFC)
          .pipe(map(() => promedioFC));
      })
    ).subscribe({
      next: (promedioFC) => {
        this.equipments.update((list) =>
          list.map((e) => e.idDoc === item.idDoc ? { ...e, promedioFC: promedioFC ?? undefined } : e)
        );
      },
    });
  }

  private computePromedioFC(
    rows25v: CalibrationRow[],
    rows50v: CalibrationRow[],
    voltage: string
  ): number | null {
    const is50v = voltage.replace(/\s/g, '').toUpperCase().includes('50');
    const rows = is50v ? rows50v : rows25v;
    const fcs = rows
      .filter((r) => r.patron !== null && r.valorMedido !== null && r.valorMedido !== 0)
      .map((r) => r.patron! / r.valorMedido!);
    if (!fcs.length) return null;
    return fcs.reduce((a, b) => a + b, 0) / fcs.length;
  }

  addPoint(): void {
    const nextNumber = this.points().length + 1;
    const newPoint: Point = {
      idDoc: `point-${Date.now()}`,
      pointNumber: nextNumber,
      location: '',
      electrodeType: 'unique',
      hasLightningRod: false,
      measurementCondition: 'dry',
      soilType: 'soil',
      measurementData: {},
      connectedEquipment: [],
      createdBy: this.currentUserId(),
      createdAt: new Date(),
    };

    this.points.update((items) => [...items, newPoint]);
    this.draftPointId.set(newPoint.idDoc);
    this.selectedPointId.set(newPoint.idDoc);
  }

  closeEditor(): void {
    const draft = this.draftPointId();
    if (draft) {
      this.points.update((items) => items.filter((p) => p.idDoc !== draft));
      this.draftPointId.set('');
    }
    this.selectedPointId.set('');
  }

  savePoints(): void {
    if (!this.points().length || this.isSavingPoints()) {
      return;
    }

    this.isSavingPoints.set(true);
    forkJoin(
      this.points().map((point) =>
        this.workOrderService.updateMeasurementPoint(this.workOrderId, this.workflowStepId, point.idDoc, {
          pointNumber: point.pointNumber,
          location: point.location,
          electrodeType: point.electrodeType,
          hasLightningRod: point.hasLightningRod,
          lightningRodHeight: point.lightningRodHeight,
          protectionRadius: point.protectionRadius,
          systemType: point.systemType,
          temperature: point.temperature,
          humidity: point.humidity,
          measurementCondition: point.measurementCondition,
          soilType: point.soilType,
          startTime: point.startTime,
          endTime: point.endTime,
          measurementData: point.measurementData,
          voltageStatus: point.voltageStatus,
          hasContinuity: point.hasContinuity,
          generatorSources: point.generatorSources,
          connectedEquipment: point.connectedEquipment,
          observations: point.observations,
        })
      )
    ).subscribe({
      next: () => {
        this.draftPointId.set('');
        this.isSavingPoints.set(false);
        this.toastService.success('Los puntos de medición se guardaron correctamente.');
      },
      error: () => {
        this.isSavingPoints.set(false);
        this.toastService.error('No fue posible guardar los puntos de medición.');
      },
    });
  }

  updatePoint<K extends keyof Point>(pointId: string, key: K, value: Point[K]): void {
    this.points.update((items) =>
      items.map((item) => (item.idDoc === pointId ? { ...item, [key]: value } : item))
    );
    if (this.draftPointId() === pointId) return;
    void this.workOrderService
      .updateMeasurementPoint(this.workOrderId, this.workflowStepId, pointId, { [key]: value } as Partial<Point>)
      .pipe(take(1))
      .subscribe({
        error: () => {
          this.toastService.error('No fue posible actualizar el punto de medición.');
        },
      });
  }

  selectPoint(pointId: string): void {
    this.selectedPointId.set(pointId);
  }

  deletePoint(pointId: string): void {
    const isDraft = this.draftPointId() === pointId;
    this.points.update((items) => items.filter((p) => p.idDoc !== pointId));
    if (this.selectedPointId() === pointId) {
      this.selectedPointId.set('');
    }
    if (isDraft) {
      this.draftPointId.set('');
      return;
    }
    this.workOrderService
      .deleteMeasurementPoint(this.workOrderId, this.workflowStepId, pointId)
      .pipe(take(1))
      .subscribe({
        error: () => {
          this.toastService.error('No fue posible eliminar el punto de medición.');
          this.loadMeasurementData();
        },
      });
  }

  updatePointMeasurementValue(
    pointId: string,
    key: keyof Point['measurementData'],
    value: string
  ): void {
    const measurementDataValue = value === '' ? undefined : Number(value);
    this.points.update((items) =>
      items.map((item) =>
        item.idDoc === pointId
          ? {
              ...item,
              measurementData: {
                ...item.measurementData,
                [key]: measurementDataValue,
              },
            }
          : item
      )
    );
    if (this.draftPointId() === pointId) return;
    const point = this.points().find((item) => item.idDoc === pointId);
    if (!point) {
      return;
    }
    void this.workOrderService
      .updateMeasurementPoint(this.workOrderId, this.workflowStepId, pointId, {
        measurementData: {
          ...point.measurementData,
          [key]: measurementDataValue,
        },
      })
      .pipe(take(1))
      .subscribe({
        error: () => {
          this.toastService.error('No fue posible actualizar los datos de medición.');
        },
      });
  }

  onGeneratorSourceChange(pointId: string, value: string): void {
    this.updatePoint(pointId, 'generatorSources', value ? [value as GeneratorSource] : undefined);
  }

  getConnectedEquipmentValue(point: Point, index: number): string {
    return point.connectedEquipment[index]?.description || '';
  }

  updateConnectedEquipment(pointId: string, index: number, value: string): void {
    this.points.update((items) =>
      items.map((item) => {
        if (item.idDoc !== pointId) {
          return item;
        }

        const connectedEquipment = [...item.connectedEquipment];
        if (!value) {
          connectedEquipment.splice(index, 1);
        } else {
          connectedEquipment[index] = {
            idDoc: `${pointId}-connected-${index + 1}`,
            description: value as GeneratorSource,
          };
        }

        return {
          ...item,
          connectedEquipment,
        };
      })
    );
    if (this.draftPointId() === pointId) return;
    const point = this.points().find((item) => item.idDoc === pointId);
    if (!point) {
      return;
    }
    void this.workOrderService
      .updateMeasurementPoint(this.workOrderId, this.workflowStepId, pointId, {
        connectedEquipment: point.connectedEquipment,
      })
      .pipe(take(1))
      .subscribe({
        error: () => {
          this.toastService.error('No fue posible actualizar los equipos conectados.');
        },
      });
  }

  labelGeneratorSource(value: string | undefined): string {
    const map: Record<string, string> = {
      structure: 'Estructura',
      electrical_equipment: 'Equipo eléctrico',
      lightning_rod: 'Pararrayo',
      no_equipment: 'Sin equipo',
    };
    return value ? (map[value] ?? value) : '—';
  }

  labelGeneratorSources(sources: string[] | undefined): string {
    if (!sources?.length) return '—';
    return sources.map((s) => this.labelGeneratorSource(s)).join(', ');
  }

  exportToExcel(): void {
    const rows = this.points().map((p) => ({
      'Punto No.': p.pointNumber,
      'Ubicación': p.location ?? '',
      'Tipo de Electrodo': p.electrodeType === 'unique' ? 'Único' : 'Múltiple',
      'Pararrayo': p.hasLightningRod ? 'Sí' : 'No',
      'Altura del pararrayos (m)': p.lightningRodHeight ?? '',
      'Radio de protección (m)': p.protectionRadius ?? '',
      'Tipo de sistema': p.systemType ?? '',
      'Temperatura ambiental (°C)': p.temperature ?? '',
      'Humedad Relativa (%)': p.humidity ?? '',
      'Condiciones de medición': p.measurementCondition === 'dry' ? 'Seco' : 'Húmedo',
      'Tipo de suelo': p.soilType === 'cement' ? 'Cemento' : p.soilType === 'soil' ? 'Tierra' : 'Asfalto',
      'Hora inicial (hh:mm)': p.startTime ?? '',
      'Hora final (hh:mm)': p.endTime ?? '',
      'P1 (1m)': p.measurementData.p1_1m ?? '',
      'P1 (4m)': p.measurementData.p1_4m ?? '',
      'P1 (7m)': p.measurementData.p1_7m ?? '',
      'P1 (10m)': p.measurementData.p1_10m ?? '',
      'P1 (13m)': p.measurementData.p1_13m ?? '',
      'P1 (16m)': p.measurementData.p1_16m ?? '',
      'P1 (19m)': p.measurementData.p1_19m ?? '',
      'Voltaje': p.voltageStatus === 'absence' ? 'Ausencia' : p.voltageStatus === 'presence' ? 'Presencia' : p.voltageStatus === 'empty' ? 'Vacío' : '',
      'Existe continuidad': p.hasContinuity === true ? 'Sí' : p.hasContinuity === false ? 'No' : '',
      'Fuentes generadoras': this.labelGeneratorSources(p.generatorSources),
      'Equipo conectado 1': this.labelGeneratorSource(p.connectedEquipment[0]?.description),
      'Equipo conectado 2': this.labelGeneratorSource(p.connectedEquipment[1]?.description),
      'Equipo conectado 3': this.labelGeneratorSource(p.connectedEquipment[2]?.description),
      'Observaciones': p.observations ?? '',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Puntos');
    XLSX.writeFile(wb, `mediciones-${this.workOrderId}.xlsx`);
  }

  setActiveTab(tab: 'points' | 'correction'): void {
    this.activeTab.set(tab);
    if (tab === 'points') {
      setTimeout(() => this.renderSignatureCanvas(), 0);
    }
  }

  startSignatureDraw(event: PointerEvent): void {
    const canvas = this.signatureCanvas?.nativeElement;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    this.isDrawingSignature = true;
    this.hasSignatureStroke = true;
    const { x, y } = this.getSignatureCoordinates(event, canvas);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  moveSignatureDraw(event: PointerEvent): void {
    if (!this.isDrawingSignature) return;
    const canvas = this.signatureCanvas?.nativeElement;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const { x, y } = this.getSignatureCoordinates(event, canvas);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  endSignatureDraw(): void {
    this.isDrawingSignature = false;
  }

  clearSignature(): void {
    const canvas = this.signatureCanvas?.nativeElement;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.hasSignatureStroke = false;
    this.savedSignaturePreview.set('');
  }

  saveClientVisitSignature(): void {
    const canvas = this.signatureCanvas?.nativeElement;
    if (!this.workOrderId || !this.workflowStepId || this.isSavingSignature()) {
      return;
    }

    if (!this.signatureForm.signedByName.trim()) {
      this.toastService.warning('Captura el nombre de quien firma por parte del cliente.');
      return;
    }

    const signatureDataUrl = this.hasSignatureStroke && canvas
      ? canvas.toDataURL('image/png')
      : this.savedSignaturePreview();

    if (!signatureDataUrl) {
      this.toastService.warning('Captura la firma del cliente antes de guardar.');
      return;
    }

    const signedAt = this.signatureSignedAt()
      ? (() => { const [y, m, d] = this.signatureSignedAt().split('-').map(Number); return new Date(y, m - 1, d); })()
      : new Date();

    const signature: WorkOrderClientVisitSignature = {
      signedByName: this.signatureForm.signedByName.trim(),
      signedByRole: this.signatureForm.signedByRole.trim() || undefined,
      signedAt,
      observations: this.signatureForm.observations.trim() || undefined,
      confirmedVisit: true,
      signatureDataUrl,
      updatedByUserId: this.currentUserId() || undefined,
      updatedByUserName: undefined,
      updatedAt: new Date(),
    };

    this.isSavingSignature.set(true);
    this.workOrderService
      .updateWorkflowStepSignature(this.workOrderId, this.workflowStepId, signature)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.savedSignaturePreview.set(signatureDataUrl);
          this.signatureSignedAt.set(this.toDateTimeLocalValue(signedAt));
          this.isSavingSignature.set(false);
          this.toastService.success('La firma del cliente se guardó correctamente.');
        },
        error: () => {
          this.isSavingSignature.set(false);
          this.toastService.error('No fue posible guardar la firma del cliente.');
        },
      });
  }

  private applyClientVisitSignature(signature?: WorkOrderClientVisitSignature): void {
    this.signatureForm.signedByName = signature?.signedByName || '';
    this.signatureForm.signedByRole = signature?.signedByRole || '';
    this.signatureForm.observations = signature?.observations || '';
    this.signatureSignedAt.set(
      signature?.signedAt ? this.toDateTimeLocalValue(signature.signedAt) : ''
    );
    this.savedSignaturePreview.set(signature?.signatureDataUrl || '');
    this.hasSignatureStroke = Boolean(signature?.signatureDataUrl);
  }

  private renderSignatureCanvas(): void {
    const canvas = this.signatureCanvas?.nativeElement;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) {
      return;
    }

    canvas.width = 760;
    canvas.height = 220;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1f2937';

    const dataUrl = this.savedSignaturePreview();
    if (!dataUrl) {
      this.hasSignatureStroke = false;
      return;
    }

    const image = new Image();
    image.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      this.hasSignatureStroke = true;
    };
    image.src = dataUrl;
  }

  private getSignatureCoordinates(event: PointerEvent, canvas: HTMLCanvasElement): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  private toDateTimeLocalValue(value: Date): string {
    const pad = (part: number) => String(part).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }

  private merge(item: workOrderEquipment, master: equipment | null): workOrderEquipment {
    if (!master) return item;
    return {
      ...item,
      equipmentName: item.equipmentName || master.name,
      equipmentType: item.equipmentType || master.identifier,
      equipmentBrand: item.equipmentBrand || master.brand,
      equipmentModel: item.equipmentModel || master.model,
      equipmentNs: item.equipmentNs || master.ns,
      equipmentFrecuency: item.equipmentFrecuency || master.frecuency,
      equipmentMeditionInterval: item.equipmentMeditionInterval || master.range,
      equipmentPrecition: item.equipmentPrecition || master.precition,
      equipmentSpecifyEquipment: item.equipmentSpecifyEquipment || master.especify_equipment,
    };
  }
}
