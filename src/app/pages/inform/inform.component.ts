import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, OnInit, SimpleChanges, computed, inject, signal } from '@angular/core';
import { catchError, forkJoin, of, switchMap, take } from 'rxjs';

import { Point } from '../../interfaces/measurements.interface';
import { workOrderEquipment, workOrderStep } from '../../interfaces/workOrder.interface';
import { ToastService } from '../../services/toast.service';
import { WorkOrderService } from '../../services/work-order.service';

@Component({
  selector: 'app-inform',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './inform.component.html',
  styleUrl: './inform.component.scss',
})
export class InformComponent implements OnInit, OnChanges {
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
  private workOrderService = inject(WorkOrderService);
  private toastService = inject(ToastService);

  @Input() workOrderId = '';
  @Input() cableResistance: number | null = null;

  isLoading = signal(false);
  activeTab = signal<'tables' | 'charts'>('tables');
  points = signal<Point[]>([]);
  measurementStep = signal<workOrderStep | null>(null);
  stepEquipments = signal<workOrderEquipment[]>([]);
  readonly factorCorreccion = computed(
    () => this.stepEquipments().find((equipment) => equipment.promedioFC != null)?.promedioFC ?? null
  );

  ngOnInit(): void {
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
      this.isLoading.set(false);
      return;
    }

    this.isLoading.set(true);

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
    return point.measurementData.p1_13m ?? null;
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
      value: point.measurementData[item.key] ?? null,
    }));
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
}
