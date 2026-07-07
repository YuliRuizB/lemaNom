import { CommonModule, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { switchMap, take } from 'rxjs';

import { EquipmentModalComponent } from '../../components/equipment-modal/equipment-modal.component';
import { ToastService } from '../../services/toast.service';
import {
  CalibrationRecord,
  CalibrationRow,
  EquipmentCertificate,
  LightingCalibrationRecord,
  LightingCertificateRow,
  LightingMeasurementRow,
  RepeatabilityRecord,
  UserReading,
  equipment,
} from '../../interfaces/meditionType.interface';
import { EquipmentService } from '../../services/equipment.service';
import { AuthService } from '../../services/auth.service';
import { UserService } from '../../services/user.service';
import { User } from '../../interfaces/user.interface';

@Component({
  selector: 'app-equipo-medicion',
  standalone: true,
  imports: [CommonModule, DatePipe, ReactiveFormsModule, FormsModule, EquipmentModalComponent],
  templateUrl: './equipo-medicion.component.html',
  styleUrl: './equipo-medicion.component.scss',
})
export class EquipoMedicionComponent {
  private equipmentService = inject(EquipmentService);
  private toastService = inject(ToastService);
  private authService = inject(AuthService);
  private userService = inject(UserService);
  private fb = inject(FormBuilder);

  private allEquipments = signal<equipment[]>([]);
  search = signal('');
  loading = signal(true);
  showModal = signal(false);
  selectedEquipment = signal<equipment | null>(null);
  uploading = signal(false);
  editMode = signal(false);
  saving = signal(false);
  activeTab = signal<'info' | 'certificates' | 'calibration' | 'calibration-illumination' | 'rrr'>('info');

  // ── Certificates ──────────────────────────────────────────────────────────
  certificates = signal<EquipmentCertificate[]>([]);
  loadingCertificates = signal(false);

  // ── Calibration history ───────────────────────────────────────────────────
  calibrationRecords = signal<CalibrationRecord[]>([]);
  loadingCalibrations = signal(false);
  savingCalibration = signal(false);
  selectedCalibrationRecord = signal<CalibrationRecord | null>(null);
  isNewCalibration = signal(false);
  isEditingCalibration = signal(false);
  lightingCalibrationRecords = signal<LightingCalibrationRecord[]>([]);
  loadingLightingCalibrations = signal(false);
  savingLightingCalibration = signal(false);
  isNewLightingCalibration = signal(false);
  selectedLightingCalibrationRecord = signal<LightingCalibrationRecord | null>(null);
  isEditingLightingCalibration = signal(false);

  calibrationForm = this.fb.group({
    certNumber:      ['', Validators.required],
    calibrationDate: ['', Validators.required],
    expirationDate:  [''],
    voltage:         ['Ambos', Validators.required],
  });

  rows25v = signal<CalibrationRow[]>(this.emptyRows());
  rows50v = signal<CalibrationRow[]>(this.emptyRows());
  lightingCalibrationForm = this.fb.group({
    calibrationDate: ['', Validators.required],
    verificationDate: [''],
    receptionDate: [''],
  });
  lightingReceptionRows = signal<LightingMeasurementRow[]>(this.emptyLightingMeasurementRows());
  lightingVerificationRows = signal<LightingMeasurementRow[]>(this.emptyLightingMeasurementRows());
  lightingCertificateRows = signal<LightingCertificateRow[]>(this.emptyLightingCertificateRows());

  fc25v = computed(() =>
    this.rows25v().map((r) =>
      r.patron != null && r.valorMedido ? r.patron / r.valorMedido : null
    )
  );
  fc50v = computed(() =>
    this.rows50v().map((r) =>
      r.patron != null && r.valorMedido ? r.patron / r.valorMedido : null
    )
  );
  avg25v = computed(() => {
    const vals = this.fc25v().filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  });
  avg50v = computed(() => {
    const vals = this.fc50v().filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  });
  lightingFcp = computed(() => {
    const values = this.lightingCertificateRows()
      .map((row) => row.fc)
      .filter((value): value is number => value !== null);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  });

  // ── Repeatability & Reproducibility ──────────────────────────────────────
  readonly REPEATABILITY_ROLE = '97YgNetUGyyC7Bnm2I2Z';
  readonly READINGS_COUNT = 10;

  roleUsers = signal<User[]>([]);
  loadingRoleUsers = signal(false);
  repeatabilityRecords = signal<RepeatabilityRecord[]>([]);
  loadingRepeatability = signal(false);
  savingRepeatability = signal(false);
  isNewRepeatability = signal(false);
  selectedRepeatabilityRecord = signal<RepeatabilityRecord | null>(null);
  isEditingRepeatability = signal(false);
  selectedUserIds = signal<string[]>([]);
  rrReadings = signal<Record<string, (number | null)[]>>({});

  urPerUser = computed(() => {
    const result: Record<string, number | null> = {};
    for (const userId of this.selectedUserIds()) {
      const readings = (this.rrReadings()[userId] ?? []).filter((v): v is number => v !== null);
      result[userId] = readings.length >= 2 ? this.stdev(readings) / Math.sqrt(this.READINGS_COUNT) : null;
    }
    return result;
  });

  urOverall = computed(() => {
    const all: number[] = [];
    for (const userId of this.selectedUserIds()) {
      (this.rrReadings()[userId] ?? []).forEach((v) => { if (v !== null) all.push(v); });
    }
    const n = this.selectedUserIds().length * this.READINGS_COUNT;
    return all.length >= 2 ? this.stdev(all) / Math.sqrt(n) : null;
  });

  toggleRoleUser(user: User): void {
    const current = this.selectedUserIds();
    const exists = current.includes(user.idDoc);
    const next = exists ? current.filter((id) => id !== user.idDoc) : [...current, user.idDoc];
    this.selectedUserIds.set(next);
    if (!exists) {
      this.rrReadings.update((r) => ({
        ...r,
        [user.idDoc]: Array(this.READINGS_COUNT).fill(null),
      }));
    } else {
      this.rrReadings.update((r) => {
        const updated = { ...r };
        delete updated[user.idDoc];
        return updated;
      });
    }
  }

  updateReading(userId: string, index: number, raw: string): void {
    const value = raw === '' ? null : Number(raw);
    this.rrReadings.update((r) => {
      const readings = [...(r[userId] ?? Array(this.READINGS_COUNT).fill(null))];
      readings[index] = value;
      return { ...r, [userId]: readings };
    });
  }

  openNewRepeatability(): void {
    this.selectedRepeatabilityRecord.set(null);
    this.isEditingRepeatability.set(false);
    this.selectedUserIds.set([]);
    this.rrReadings.set({});
    this.isNewRepeatability.set(true);
  }

  viewRepeatabilityRecord(record: RepeatabilityRecord): void {
    this.selectedRepeatabilityRecord.set(record);
    this.isNewRepeatability.set(false);
    this.isEditingRepeatability.set(false);
    const ids = record.userReadings.map((u) => u.userId);
    this.selectedUserIds.set(ids);
    const map: Record<string, (number | null)[]> = {};
    record.userReadings.forEach((u) => { map[u.userId] = u.readings; });
    this.rrReadings.set(map);
  }

  cancelRepeatabilityForm(): void {
    this.isNewRepeatability.set(false);
    this.isEditingRepeatability.set(false);
    this.selectedRepeatabilityRecord.set(null);
    this.selectedUserIds.set([]);
    this.rrReadings.set({});
  }

  saveRepeatability(): void {
    const eq = this.selectedEquipment();
    if (!eq || !this.selectedUserIds().length) return;

    this.savingRepeatability.set(true);
    const userReadings: UserReading[] = this.selectedUserIds().map((uid) => {
      const user = this.roleUsers().find((u) => u.idDoc === uid)!;
      return {
        userId: uid,
        userName: user ? `${user.firstName} ${user.lastName}` : uid,
        readings: this.rrReadings()[uid] ?? Array(this.READINGS_COUNT).fill(null),
      };
    });

    this.authService.currentUser$.pipe(take(1)).subscribe((authUser) => {
      const createdBy = authUser?.displayName || authUser?.email || '';
      this.equipmentService.addRepeatabilityRecord(eq.idDoc, { userReadings, createdBy })
        .subscribe({
          next: () => {
            this.toastService.success('Registro guardado correctamente.');
            this.savingRepeatability.set(false);
            this.isNewRepeatability.set(false);
            this.loadRepeatabilityRecords(eq.idDoc);
          },
          error: () => {
            this.toastService.error('Error al guardar el registro.');
            this.savingRepeatability.set(false);
          },
        });
    });
  }

  saveRepeatabilityEdit(): void {
    const eq = this.selectedEquipment();
    const record = this.selectedRepeatabilityRecord();
    if (!eq || !record) return;

    this.savingRepeatability.set(true);
    const userReadings: UserReading[] = this.selectedUserIds().map((uid) => {
      const user = this.roleUsers().find((u) => u.idDoc === uid)!;
      return {
        userId: uid,
        userName: user ? `${user.firstName} ${user.lastName}` : uid,
        readings: this.rrReadings()[uid] ?? Array(this.READINGS_COUNT).fill(null),
      };
    });

    this.equipmentService.updateRepeatabilityRecord(eq.idDoc, record.idDoc, userReadings)
      .subscribe({
        next: () => {
          this.toastService.success('Registro actualizado correctamente.');
          this.savingRepeatability.set(false);
          this.isEditingRepeatability.set(false);
          this.selectedRepeatabilityRecord.set({ ...record, userReadings });
          this.loadRepeatabilityRecords(eq.idDoc);
        },
        error: () => {
          this.toastService.error('Error al actualizar el registro.');
          this.savingRepeatability.set(false);
        },
      });
  }

  getRoleUserName(userId: string): string {
    const user = this.roleUsers().find((u) => u.idDoc === userId);
    return user ? `${user.firstName} ${user.lastName}` : userId;
  }

  private stdev(values: number[]): number {
    if (values.length < 2) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (values.length - 1);
    return Math.sqrt(variance);
  }

  private loadRepeatabilityRecords(equipmentId: string): void {
    this.loadingRepeatability.set(true);
    this.equipmentService.getRepeatabilityRecords(equipmentId).pipe(take(1)).subscribe({
      next: (items) => {
        if (this.selectedEquipment()?.idDoc !== equipmentId) {
          return;
        }
        this.repeatabilityRecords.set(items);
        this.loadingRepeatability.set(false);
      },
      error: () => {
        if (this.selectedEquipment()?.idDoc !== equipmentId) {
          return;
        }
        this.loadingRepeatability.set(false);
      },
    });
  }

  private loadRoleUsers(): void {
    this.loadingRoleUsers.set(true);
    this.userService.getUsersByRole(this.REPEATABILITY_ROLE).pipe(take(1)).subscribe({
      next: (users) => { this.roleUsers.set(users); this.loadingRoleUsers.set(false); },
      error: () => { this.loadingRoleUsers.set(false); },
    });
  }

  // ── Equipment list ────────────────────────────────────────────────────────
  editForm = this.fb.group({
    name:       ['', [Validators.required, Validators.minLength(2)]],
    identifier: ['', [Validators.required]],
    ns:         ['', [Validators.required]],
    brand:      [''],
    model:      [''],
    range:      [''],
    frecuency:  [''],
    precition:  [''],
    especify_equipment: [''],
    voltage:    [''],
    active:     [true],
  });

  readonly pageSize = 5;
  currentPage = signal(1);

  filteredEquipments = computed(() => {
    const term = this.search().toLowerCase().trim();
    if (!term) return this.allEquipments();
    return this.allEquipments().filter(
      (e) =>
        e.name?.toLowerCase().includes(term) ||
        e.identifier?.toLowerCase().includes(term) ||
        e.brand?.toLowerCase().includes(term) ||
        e.model?.toLowerCase().includes(term) ||
        e.ns?.toLowerCase().includes(term)
    );
  });

  totalPages = computed(() => Math.max(1, Math.ceil(this.filteredEquipments().length / this.pageSize)));

  pagedEquipments = computed(() => {
    const page = this.currentPage();
    const start = (page - 1) * this.pageSize;
    return this.filteredEquipments().slice(start, start + this.pageSize);
  });

  constructor() {
    this.loadEquipments();
    this.loadRoleUsers();
  }

  onSearch(value: string): void {
    this.search.set(value);
    this.currentPage.set(1);
  }

  selectEquipment(item: equipment): void {
    const isSame = this.selectedEquipment()?.idDoc === item.idDoc;
    this.resetEquipmentDetailState();

    if (isSame) {
      this.selectedEquipment.set(null);
    } else {
      this.selectedEquipment.set(item);
      this.activeTab.set('info');
      this.loadCertificates(item.idDoc);
      this.loadCalibrationRecords(item.idDoc);
      this.loadLightingCalibrationRecords(item.idDoc);
      this.loadRepeatabilityRecords(item.idDoc);
    }
    this.editMode.set(false);
  }

  // ── Calibration history actions ───────────────────────────────────────────

  openNewCalibration(): void {
    this.selectedCalibrationRecord.set(null);
    this.calibrationForm.reset({ voltage: 'Ambos' });
    this.rows25v.set(this.emptyRows());
    this.rows50v.set(this.emptyRows());
    this.isNewCalibration.set(true);
  }

  viewCalibrationRecord(record: CalibrationRecord): void {
    this.selectedCalibrationRecord.set(record);
    this.isNewCalibration.set(false);
    this.calibrationForm.patchValue({
      certNumber:      record.certNumber,
      calibrationDate: record.calibrationDate,
      expirationDate:  record.expirationDate ?? '',
      voltage:         record.voltage,
    });
    this.rows25v.set(record.calibrationRows25v?.length ? record.calibrationRows25v : this.emptyRows());
    this.rows50v.set(record.calibrationRows50v?.length ? record.calibrationRows50v : this.emptyRows());
  }

  cancelCalibrationForm(): void {
    this.isNewCalibration.set(false);
    this.isEditingCalibration.set(false);
    this.selectedCalibrationRecord.set(null);
  }

  startEditCalibration(): void {
    this.isEditingCalibration.set(true);
  }

  saveCalibrationEdit(): void {
    if (this.calibrationForm.invalid) {
      this.calibrationForm.markAllAsTouched();
      return;
    }
    const eq = this.selectedEquipment();
    const record = this.selectedCalibrationRecord();
    if (!eq || !record) return;

    this.savingCalibration.set(true);
    const v = this.calibrationForm.getRawValue();

    this.equipmentService.updateCalibrationRecord(eq.idDoc, record.idDoc, {
      certNumber:         v.certNumber!.trim(),
      calibrationDate:    v.calibrationDate!,
      expirationDate:     v.expirationDate || undefined,
      voltage:            (v.voltage as CalibrationRecord['voltage']) || 'Ambos',
      calibrationRows25v: this.rows25v(),
      calibrationRows50v: this.rows50v(),
    }).subscribe({
      next: () => {
        this.toastService.success('Calibración actualizada correctamente.');
        this.savingCalibration.set(false);
        this.isEditingCalibration.set(false);
        this.loadCalibrationRecords(eq.idDoc);
        // actualiza el registro seleccionado con los nuevos valores
        this.selectedCalibrationRecord.set({
          ...record,
          certNumber:         v.certNumber!.trim(),
          calibrationDate:    v.calibrationDate!,
          expirationDate:     v.expirationDate || undefined,
          voltage:            (v.voltage as CalibrationRecord['voltage']) || 'Ambos',
          calibrationRows25v: this.rows25v(),
          calibrationRows50v: this.rows50v(),
        });
      },
      error: () => {
        this.toastService.error('Error al actualizar la calibración.');
        this.savingCalibration.set(false);
      },
    });
  }

  saveCalibration(): void {
    if (this.calibrationForm.invalid) {
      this.calibrationForm.markAllAsTouched();
      return;
    }
    const eq = this.selectedEquipment();
    if (!eq) return;

    this.savingCalibration.set(true);
    const v = this.calibrationForm.getRawValue();

    this.authService.currentUser$.pipe(take(1)).subscribe((user) => {
      const createdBy = user?.displayName || user?.email || user?.uid || '';

      this.equipmentService.addCalibrationRecord(eq.idDoc, {
        certNumber:         v.certNumber!.trim(),
        calibrationDate:    v.calibrationDate!,
        expirationDate:     v.expirationDate || undefined,
        voltage:            (v.voltage as CalibrationRecord['voltage']) || 'Ambos',
        calibrationRows25v: this.rows25v(),
        calibrationRows50v: this.rows50v(),
        createdBy,
      }).subscribe({
        next: () => {
          this.toastService.success('Calibración registrada correctamente.');
          this.savingCalibration.set(false);
          this.isNewCalibration.set(false);
          this.loadCalibrationRecords(eq.idDoc);
        },
        error: () => {
          this.toastService.error('Error al guardar la calibración.');
          this.savingCalibration.set(false);
        },
      });
    });
  }

  updateCalibrationRow(table: '25v' | '50v', index: number, field: keyof CalibrationRow, raw: string): void {
    const value = raw === '' ? null : Number(raw);
    const sig = table === '25v' ? this.rows25v : this.rows50v;
    sig.update((rows) => {
      const updated = [...rows];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }

  openNewLightingCalibration(): void {
    this.selectedLightingCalibrationRecord.set(null);
    this.isEditingLightingCalibration.set(false);
    this.lightingCalibrationForm.reset();
    this.lightingReceptionRows.set(this.emptyLightingMeasurementRows());
    this.lightingVerificationRows.set(this.emptyLightingMeasurementRows());
    this.lightingCertificateRows.set(this.emptyLightingCertificateRows());
    this.isNewLightingCalibration.set(true);
  }

  viewLightingCalibrationRecord(record: LightingCalibrationRecord): void {
    this.selectedLightingCalibrationRecord.set(record);
    this.isNewLightingCalibration.set(false);
    this.isEditingLightingCalibration.set(false);
    this.lightingCalibrationForm.patchValue({
      calibrationDate: record.calibrationDate,
      verificationDate: record.verificationDate ?? '',
      receptionDate: record.receptionDate ?? '',
    });
    this.lightingReceptionRows.set(
      record.laboratoryReceptionRows?.length ? record.laboratoryReceptionRows : this.emptyLightingMeasurementRows()
    );
    this.lightingVerificationRows.set(
      record.verificationRows?.length ? record.verificationRows : this.emptyLightingMeasurementRows()
    );
    this.lightingCertificateRows.set(
      record.certificateRows?.length ? record.certificateRows : this.emptyLightingCertificateRows()
    );
  }

  cancelLightingCalibrationForm(): void {
    this.isNewLightingCalibration.set(false);
    this.isEditingLightingCalibration.set(false);
    this.selectedLightingCalibrationRecord.set(null);
  }

  startEditLightingCalibration(): void {
    this.isEditingLightingCalibration.set(true);
  }

  saveLightingCalibration(): void {
    if (this.lightingCalibrationForm.invalid) {
      this.lightingCalibrationForm.markAllAsTouched();
      this.toastService.warning('Captura al menos la fecha de calibración para guardar.');
      return;
    }
    const eq = this.selectedEquipment();
    if (!eq) {
      this.toastService.error('No se encontró un equipo válido para guardar la calibración.');
      return;
    }

    this.savingLightingCalibration.set(true);
    const v = this.lightingCalibrationForm.getRawValue();

    this.authService.currentUser$.pipe(take(1)).subscribe((user) => {
      const createdBy = user?.displayName || user?.email || user?.uid || '';

      this.equipmentService.addLightingCalibrationRecord(eq.idDoc, {
        calibrationDate: v.calibrationDate!,
        verificationDate: v.verificationDate || undefined,
        receptionDate: v.receptionDate || undefined,
        laboratoryReceptionRows: this.lightingReceptionRows(),
        verificationRows: this.lightingVerificationRows(),
        certificateRows: this.lightingCertificateRows(),
        fcp: this.lightingFcp(),
        createdBy,
      }).subscribe({
        next: () => {
          this.toastService.success('Calibración de iluminación registrada correctamente.');
          this.savingLightingCalibration.set(false);
          this.isNewLightingCalibration.set(false);
          this.loadLightingCalibrationRecords(eq.idDoc);
        },
        error: () => {
          this.toastService.error('Error al guardar la calibración de iluminación.');
          this.savingLightingCalibration.set(false);
        },
      });
    });
  }

  saveLightingCalibrationEdit(): void {
    if (this.lightingCalibrationForm.invalid) {
      this.lightingCalibrationForm.markAllAsTouched();
      this.toastService.warning('Captura al menos la fecha de calibración para guardar.');
      return;
    }
    const eq = this.selectedEquipment();
    const record = this.selectedLightingCalibrationRecord();
    if (!eq || !record) {
      this.toastService.error('No se encontró una calibración de iluminación válida para actualizar.');
      return;
    }

    this.savingLightingCalibration.set(true);
    const v = this.lightingCalibrationForm.getRawValue();

    this.equipmentService.updateLightingCalibrationRecord(eq.idDoc, record.idDoc, {
      calibrationDate: v.calibrationDate!,
      verificationDate: v.verificationDate || undefined,
      receptionDate: v.receptionDate || undefined,
      laboratoryReceptionRows: this.lightingReceptionRows(),
      verificationRows: this.lightingVerificationRows(),
      certificateRows: this.lightingCertificateRows(),
      fcp: this.lightingFcp(),
    }).subscribe({
      next: () => {
        this.toastService.success('Calibración de iluminación actualizada correctamente.');
        this.savingLightingCalibration.set(false);
        this.isEditingLightingCalibration.set(false);
        this.loadLightingCalibrationRecords(eq.idDoc);
        this.selectedLightingCalibrationRecord.set({
          ...record,
          calibrationDate: v.calibrationDate!,
          verificationDate: v.verificationDate || undefined,
          receptionDate: v.receptionDate || undefined,
          laboratoryReceptionRows: this.lightingReceptionRows(),
          verificationRows: this.lightingVerificationRows(),
          certificateRows: this.lightingCertificateRows(),
          fcp: this.lightingFcp(),
        });
      },
      error: () => {
        this.toastService.error('Error al actualizar la calibración de iluminación.');
        this.savingLightingCalibration.set(false);
      },
    });
  }

  updateLightingMeasurementRow(table: 'reception' | 'verification', index: number, raw: string): void {
    const value = this.parseLocalizedNumber(raw);
    const sig = table === 'reception' ? this.lightingReceptionRows : this.lightingVerificationRows;
    sig.update((rows) => {
      const updated = [...rows];
      updated[index] = { ...updated[index], lux: value };
      return updated;
    });
  }

  updateLightingCertificateRow(index: number, field: 'fc' | 'relativeUncertainty', raw: string): void {
    const value = this.parseLocalizedNumber(raw);
    this.lightingCertificateRows.update((rows) => {
      const updated = [...rows];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }

  // ── Equipment edit ────────────────────────────────────────────────────────

  startEdit(): void {
    const eq = this.selectedEquipment();
    if (!eq) return;
    this.editForm.patchValue({
      name:       eq.name,
      identifier: eq.identifier,
      ns:         eq.ns,
      brand:      eq.brand ?? '',
      model:      eq.model ?? '',
      range:      eq.range ?? '',
      frecuency:  eq.frecuency ?? '',
      precition:  eq.precition ?? '',
      especify_equipment: eq.especify_equipment ?? '',
      voltage:    eq.voltage ?? '',
      active:     eq.active,
    });
    this.editMode.set(true);
  }

  cancelEdit(): void {
    this.editMode.set(false);
  }

  saveEdit(): void {
    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }
    const eq = this.selectedEquipment();
    if (!eq) return;

    this.saving.set(true);
    const v = this.editForm.getRawValue();

    this.equipmentService.updateEquipment(eq.idDoc, {
      name:       v.name!.trim(),
      identifier: v.identifier!.trim(),
      ns:         v.ns!.trim(),
      brand:      v.brand?.trim() ?? '',
      model:      v.model?.trim() ?? '',
      range:      v.range?.trim() ?? '',
      frecuency:  v.frecuency?.trim() ?? '',
      precition:  v.precition?.trim() ?? '',
      especify_equipment: v.especify_equipment?.trim() ?? '',
      voltage:    v.voltage?.trim() ?? '',
      active:     v.active!,
    }).subscribe({
      next: () => {
        const updated: equipment = {
          ...eq,
          name:       v.name!.trim(),
          identifier: v.identifier!.trim(),
          ns:         v.ns!.trim(),
          brand:      v.brand?.trim() || undefined,
          model:      v.model?.trim() || undefined,
          range:      v.range?.trim() || undefined,
          frecuency:  v.frecuency?.trim() || undefined,
          precition:  v.precition?.trim() || undefined,
          especify_equipment: v.especify_equipment?.trim() || undefined,
          voltage:    v.voltage?.trim() || undefined,
          active:     v.active!,
          updatedAt:  new Date(),
        };
        this.selectedEquipment.set(updated);
        this.allEquipments.update((items) => items.map((i) => i.idDoc === eq.idDoc ? updated : i));
        this.toastService.success('Equipo actualizado correctamente.');
        this.editMode.set(false);
        this.saving.set(false);
      },
      error: () => {
        this.toastService.error('Error al actualizar el equipo.');
        this.saving.set(false);
      },
    });
  }

  prevPage(): void { this.currentPage.update((p) => Math.max(1, p - 1)); }
  nextPage(): void { this.currentPage.update((p) => Math.min(this.totalPages(), p + 1)); }
  openModal(): void { this.showModal.set(true); }

  onModalClosed(saved: boolean): void {
    this.showModal.set(false);
    if (saved) this.loadEquipments();
  }

  onCertificateSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    const eq = this.selectedEquipment();
    if (!file || !eq) return;

    this.uploading.set(true);
    this.authService.currentUser$.pipe(take(1)).subscribe((user) => {
      const uploadedBy = user?.displayName || user?.email || user?.uid || '';

      this.equipmentService.uploadCertificate(eq.idDoc, file).pipe(
        switchMap((url) =>
          this.equipmentService.addCertificateRecord(eq.idDoc, { certificateUrl: url, fileName: file.name, uploadedBy })
        )
      ).subscribe({
        next: () => {
          this.toastService.success('Certificado subido correctamente.');
          this.uploading.set(false);
          (event.target as HTMLInputElement).value = '';
          this.loadCertificates(eq.idDoc);
        },
        error: () => {
          this.toastService.error('Error al subir el certificado.');
          this.uploading.set(false);
        },
      });
    });
  }

  // ── Private loaders ───────────────────────────────────────────────────────

  private loadCertificates(equipmentId: string): void {
    this.loadingCertificates.set(true);
    this.equipmentService.getCertificates(equipmentId).pipe(take(1)).subscribe({
      next: (items) => {
        if (this.selectedEquipment()?.idDoc !== equipmentId) {
          return;
        }
        this.certificates.set(items);
        this.loadingCertificates.set(false);
      },
      error: () => {
        if (this.selectedEquipment()?.idDoc !== equipmentId) {
          return;
        }
        this.loadingCertificates.set(false);
      },
    });
  }

  private loadCalibrationRecords(equipmentId: string): void {
    this.loadingCalibrations.set(true);
    this.equipmentService.getCalibrationRecords(equipmentId).pipe(take(1)).subscribe({
      next: (items) => {
        if (this.selectedEquipment()?.idDoc !== equipmentId) {
          return;
        }
        this.calibrationRecords.set(items);
        this.loadingCalibrations.set(false);
      },
      error: () => {
        if (this.selectedEquipment()?.idDoc !== equipmentId) {
          return;
        }
        this.loadingCalibrations.set(false);
      },
    });
  }

  private loadLightingCalibrationRecords(equipmentId: string): void {
    this.loadingLightingCalibrations.set(true);
    this.equipmentService.getLightingCalibrationRecords(equipmentId).pipe(take(1)).subscribe({
      next: (items) => {
        if (this.selectedEquipment()?.idDoc !== equipmentId) {
          return;
        }
        this.lightingCalibrationRecords.set(items);
        this.loadingLightingCalibrations.set(false);
      },
      error: () => {
        if (this.selectedEquipment()?.idDoc !== equipmentId) {
          return;
        }
        this.loadingLightingCalibrations.set(false);
      },
    });
  }

  private loadEquipments(): void {
    this.loading.set(true);
    this.equipmentService.getEquipments().subscribe({
      next: (items) => { this.allEquipments.set(items); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  private emptyRows(): CalibrationRow[] {
    return Array.from({ length: 11 }, () => ({
      patron: null, valorMedido: null, incertidumbreOhm: null, incertidumbrePct: null,
    }));
  }

  private resetEquipmentDetailState(): void {
    this.editMode.set(false);
    this.activeTab.set('info');

    this.certificates.set([]);
    this.calibrationRecords.set([]);
    this.lightingCalibrationRecords.set([]);
    this.repeatabilityRecords.set([]);

    this.loadingCertificates.set(false);
    this.loadingCalibrations.set(false);
    this.loadingLightingCalibrations.set(false);
    this.loadingRepeatability.set(false);

    this.isNewCalibration.set(false);
    this.isEditingCalibration.set(false);
    this.selectedCalibrationRecord.set(null);
    this.calibrationForm.reset({ voltage: 'Ambos' });
    this.rows25v.set(this.emptyRows());
    this.rows50v.set(this.emptyRows());

    this.isNewLightingCalibration.set(false);
    this.isEditingLightingCalibration.set(false);
    this.selectedLightingCalibrationRecord.set(null);
    this.lightingCalibrationForm.reset();
    this.lightingReceptionRows.set(this.emptyLightingMeasurementRows());
    this.lightingVerificationRows.set(this.emptyLightingMeasurementRows());
    this.lightingCertificateRows.set(this.emptyLightingCertificateRows());

    this.isNewRepeatability.set(false);
    this.isEditingRepeatability.set(false);
    this.selectedRepeatabilityRecord.set(null);
    this.selectedUserIds.set([]);
    this.rrReadings.set({});
  }

  private emptyLightingMeasurementRows(): LightingMeasurementRow[] {
    return [30, 40, 50, 60, 70].map((distanceCm) => ({ distanceCm, lux: null }));
  }

  private emptyLightingCertificateRows(): LightingCertificateRow[] {
    return [4000, 2000, 1000, 700, 500, 300, 200, 100, 50, 20].map((illumination) => ({
      illumination,
      fc: null,
      relativeUncertainty: null,
    }));
  }

  private parseLocalizedNumber(raw: string): number | null {
    const normalized = raw.trim().replace(',', '.');
    if (!normalized) {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
}
