import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, OnInit, SimpleChanges, computed, inject, signal } from '@angular/core';
import html2canvas from 'html2canvas';
import JSZip from 'jszip';
import { catchError, firstValueFrom, forkJoin, of, switchMap, take } from 'rxjs';

import { ClientPlant } from '../../interfaces/client.interface';
import { InformNom22Data } from '../../interfaces/documents/informNom22.interface';
import { Point } from '../../interfaces/measurements.interface';
import { workOrder, workOrderEquipment, workOrderStep } from '../../interfaces/workOrder.interface';
import { ClientService } from '../../services/client.service';
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
  private readonly table422Id = 'table_422';
  private readonly table51Id = 'table_51';
  private readonly imagePlaceholderKeys = new Set<keyof InformNom22Data>([
    'tabla_4_2_2_id',
    'tabla_5_1_id',
  ]);
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
  private workOrderService = inject(WorkOrderService);
  private clientService = inject(ClientService);
  private toastService = inject(ToastService);

  @Input() workOrderId = '';
  @Input() cableResistance: number | null = null;

  isLoading = signal(false);
  isGenerating = signal(false);
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

  async generateInform(): Promise<void> {
    if (!this.workOrderId || this.isGenerating()) {
      return;
    }

    this.isGenerating.set(true);

    try {
      const informData = await this.buildInformData();
      const response = await fetch(this.templatePath);

      if (!response.ok) {
        throw new Error('No fue posible leer la plantilla base del informe.');
      }

      const templateBuffer = await response.arrayBuffer();
      const zip = await JSZip.loadAsync(templateBuffer);
      const xmlEntries = zip.file(/^word\/(document|header\d+|footer\d+)\.xml$/);

      if (!xmlEntries.length) {
        throw new Error('La plantilla no contiene archivos XML de Word para reemplazar.');
      }

      for (const xmlEntry of xmlEntries) {
        const currentXml = await xmlEntry.async('string');
        const updatedXml = this.replaceTemplateValues(currentXml, informData);
        zip.file(xmlEntry.name, updatedXml);
      }

      const tableImages = await this.captureReportTableImages();
      if (tableImages.length) {
        await this.embedTableImagesIntoDocument(zip, tableImages);
      }

      const generatedDoc = await zip.generateAsync({
        type: 'uint8array',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      const fileName = `${(informData.inform_number || 'informe').replace(/[^\w.-]+/g, '_')}.docx`;
      this.downloadGeneratedDocument(generatedDoc, fileName);
      this.toastService.success('Informe generado con la plantilla base.');
    } catch (error) {
      console.error(error);
      this.toastService.error('No fue posible generar el informe.');
    } finally {
      this.isGenerating.set(false);
    }
  }

  private async buildInformData(): Promise<InformNom22Data> {
    const order = await firstValueFrom(this.workOrderService.getWorkOrderById(this.workOrderId));

    if (!order) {
      throw new Error('La orden de trabajo no fue encontrada.');
    }

    const [client, plant, equipments] = await Promise.all([
      order.clientId
        ? firstValueFrom(this.clientService.getClientById(order.clientId))
        : Promise.resolve(null),
      order.clientId && order.plantId
        ? firstValueFrom(this.clientService.getClientPlantById(order.clientId, order.plantId))
        : Promise.resolve(null),
      firstValueFrom(this.workOrderService.getEquipments(this.workOrderId)),
    ]);

    const mainEquipment = equipments.find((equipment) => equipment.active) ?? equipments[0] ?? null;
    const today = new Date();

    return {
      client_image: client?.urlLogo?.trim() || '',
      client_name: client?.name?.trim() || order.clientName?.trim() || '',
      client_address: this.buildClientAddress(plant),
      inform_number: order.informNumber?.trim() || '',
      date_address: this.buildDateAddress(plant, today),
      client_rfc: client?.rfc?.trim() || '',
      client_phone: client?.phone?.trim() || '',
      client_activity: client?.activity?.trim() || '',
      date: this.formatLongDate(today),
      signatario_name: order.signatoryName?.trim() || '',
      identifier: mainEquipment?.equipmentType?.trim() || '',
      model: mainEquipment?.equipmentModel?.trim() || '',
      ns: mainEquipment?.equipmentNs?.trim() || '',
      medition_interval: this.getMeasurementInterval(order, mainEquipment),
      precition: this.getEquipmentPrecision(order, mainEquipment),
      frecuency: mainEquipment?.equipmentFrecuency?.trim() || '',
      especify_equipment: this.getEquipmentDescription(mainEquipment),
      tabla_4_2_2_id: this.table422Id,
      tabla_5_1_id: this.table51Id,
      tabla_5_2_id: '',
      tabla_5_3_id: '',
      charts: '',
    };
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
      plant.postalCode ? `C. P. ${plant.postalCode}` : '',
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

  private replaceTemplateValues(xml: string, data: InformNom22Data): string {
    const replacements = Object.entries(data).filter(([, value]) => typeof value === 'string') as Array<
      [keyof InformNom22Data, string]
    >;

    let output = xml;

    for (const [key, value] of replacements) {
      if (this.imagePlaceholderKeys.has(key)) {
        continue;
      }
      const escapedValue = this.escapeXml(value);
      output = output.replace(new RegExp(`\\{\\{${String(key)}\\}\\}`, 'g'), escapedValue);
    }

    output = output.replace(
      /<w:t>\{\{inform_num<\/w:t><\/w:r><w:r[^>]*>[\s\S]*?<w:t>ber<\/w:t><\/w:r><w:r[^>]*>[\s\S]*?<w:t>\}\}<\/w:t>/g,
      `<w:t>${this.escapeXml(data.inform_number)}</w:t>`
    );

    return output;
  }

  private escapeXml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
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

  private async captureReportTableImages(): Promise<ReportTableImage[]> {
    const targets = [
      { placeholder: 'tabla_4_2_2_id', elementId: this.table422Id },
      { placeholder: 'tabla_5_1_id', elementId: this.table51Id },
    ] as const;

    const results: ReportTableImage[] = [];

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
  }

  private async embedTableImagesIntoDocument(
    zip: JSZip,
    images: ReportTableImage[]
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
        nextImageIndex + 1000
      );

      documentXml = this.replaceParagraphPlaceholderWithImage(
        documentXml,
        image.placeholder,
        imageParagraph
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

    return xml.replace(paragraphPattern, imageParagraph);
  }

  private buildWordImageParagraph(
    relationshipId: string,
    imageName: string,
    widthPx: number,
    heightPx: number,
    docPrId: number
  ): string {
    const maxWidthEmu = 5_900_000;
    const maxHeightEmu = 7_200_000;
    let widthEmu = Math.round(widthPx * 9525);
    let heightEmu = Math.round(heightPx * 9525);

    const widthRatio = widthEmu > maxWidthEmu ? maxWidthEmu / widthEmu : 1;
    const heightRatio = heightEmu > maxHeightEmu ? maxHeightEmu / heightEmu : 1;
    const ratio = Math.min(widthRatio, heightRatio);

    widthEmu = Math.max(1, Math.round(widthEmu * ratio));
    heightEmu = Math.max(1, Math.round(heightEmu * ratio));

    return `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:noProof/></w:rPr><w:drawing><wp:inline distT="0" distB="0" distL="114300" distR="114300" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="${widthEmu}" cy="${heightEmu}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${docPrId}" name="${imageName}"/><wp:cNvGraphicFramePr/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="${imageName}"/><pic:cNvPicPr preferRelativeResize="0"/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relationshipId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${widthEmu}" cy="${heightEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
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
}

interface ReportTableImage {
  placeholder: 'tabla_4_2_2_id' | 'tabla_5_1_id';
  bytes: Uint8Array;
  widthPx: number;
  heightPx: number;
}
