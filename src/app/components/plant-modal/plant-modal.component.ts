import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin, of, switchMap } from 'rxjs';

import { ClientService } from '../../services/client.service';
import { ToastService } from '../../services/toast.service';
import { ClientPlant, Witness } from '../../interfaces/client.interface';

@Component({
  selector: 'app-plant-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './plant-modal.component.html',
  styleUrl: './plant-modal.component.scss',
})
export class PlantModalComponent implements OnInit {
  @Input({ required: true }) clientId!: string;
  @Input() plant: ClientPlant | null = null;
  @Output() closed = new EventEmitter<boolean>();

  private fb = inject(FormBuilder);
  private clientService = inject(ClientService);
  private toastService = inject(ToastService);

  saving = signal(false);
  witnesses = signal<Witness[]>([]);
  loadingWitnesses = signal(false);
  showWitnessForm = signal(false);
  savingWitness = signal(false);
  deletingWitnessId = signal<string | null>(null);
  editingWitness = signal<Witness | null>(null);

  form = this.fb.group({
    code:             [''],
    name:             ['', [Validators.required, Validators.minLength(2)]],
    description:      [''],
    shiftDiurnal:     [false],
    shiftNocturnal:   [false],
    contactName:      [''],
    contactPosition:  [''],
    contactEmail:     ['', [Validators.email]],
    contactPhone:     [''],
    street:           [''],
    exteriorNumber:   [''],
    interiorNumber:   [''],
    colony:           [''],
    municipality:     [''],
    state:            [''],
    country:          [''],
    postalCode:       [''],
    active:           [true],
  });

  witnessForm = this.fb.group({
    name:     ['', [Validators.required, Validators.minLength(2)]],
    lastName: ['', [Validators.required, Validators.minLength(2)]],
    email:    ['', [Validators.required, Validators.email]],
    phone:    [''],
    active:   [true],
  });

  ngOnInit(): void {
    if (!this.plant) return;

    this.form.reset({
      code:            this.plant.code || '',
      name:            this.plant.name || '',
      description:     this.plant.description || '',
      shiftDiurnal:    !!this.plant.shifts?.some((s) => s.type === 'diurnal'),
      shiftNocturnal:  !!this.plant.shifts?.some((s) => s.type === 'nocturnal'),
      contactName:     this.plant.contactName || '',
      contactPosition: this.plant.contactPosition || '',
      contactEmail:    this.plant.contactEmail || '',
      contactPhone:    this.plant.contactPhone || '',
      street:          this.plant.street || '',
      exteriorNumber:  this.plant.exteriorNumber || '',
      interiorNumber:  this.plant.interiorNumber || '',
      colony:          this.plant.colony || '',
      municipality:    this.plant.municipality || '',
      state:           this.plant.state || '',
      country:         this.plant.country || '',
      postalCode:      this.plant.postalCode || '',
      active:          this.plant.active,
    });

    this.loadWitnesses();
  }

  isFieldInvalid(field: string): boolean {
    const c = this.form.get(field);
    return !!(c?.invalid && (c.dirty || c.touched));
  }

  isWitnessFieldInvalid(field: string): boolean {
    const c = this.witnessForm.get(field);
    return !!(c?.invalid && (c.dirty || c.touched));
  }

  openWitnessForm(witness?: Witness): void {
    this.editingWitness.set(witness ?? null);
    this.witnessForm.reset({
      name:     witness?.name     ?? '',
      lastName: witness?.lastName ?? '',
      email:    witness?.email    ?? '',
      phone:    witness?.phone    ?? '',
      active:   witness?.active   ?? true,
    });
    this.showWitnessForm.set(true);
  }

  cancelWitnessForm(): void {
    this.showWitnessForm.set(false);
    this.editingWitness.set(null);
  }

  saveWitness(): void {
    if (this.witnessForm.invalid) { this.witnessForm.markAllAsTouched(); return; }

    const v = this.witnessForm.getRawValue();
    const payload: Omit<Witness, 'idDoc' | 'createdAt' | 'updatedAt'> = {
      name:     v.name!.trim(),
      lastName: v.lastName!.trim(),
      email:    v.email!.trim(),
      phone:    v.phone?.trim() || undefined,
      active:   v.active!,
    };

    const editing = this.editingWitness();

    if (this.plant?.idDoc) {
      this.savingWitness.set(true);
      const op$ = editing
        ? this.clientService.updatePlantWitness(this.clientId, this.plant.idDoc, editing.idDoc, payload)
        : this.clientService.addPlantWitness(this.clientId, this.plant.idDoc, payload);

      op$.pipe(switchMap(() => this.clientService.getPlantWitnesses(this.clientId, this.plant!.idDoc)))
        .subscribe({
          next: (witnesses) => {
            this.witnesses.set(witnesses);
            this.showWitnessForm.set(false);
            this.editingWitness.set(null);
            this.savingWitness.set(false);
          },
          error: () => {
            this.toastService.error('Error al guardar el testigo.');
            this.savingWitness.set(false);
          },
        });
    } else {
      if (editing) {
        this.witnesses.update((list) =>
          list.map((w) => (w.idDoc === editing.idDoc ? { ...w, ...payload } : w))
        );
      } else {
        this.witnesses.update((list) => [
          ...list,
          { ...payload, idDoc: crypto.randomUUID(), createdAt: new Date() },
        ]);
      }
      this.showWitnessForm.set(false);
      this.editingWitness.set(null);
    }
  }

  removeWitness(witness: Witness): void {
    if (this.plant?.idDoc) {
      const confirmed = window.confirm(`¿Eliminar al testigo "${witness.name} ${witness.lastName}"?`);
      if (!confirmed) return;

      this.deletingWitnessId.set(witness.idDoc);
      this.clientService.deletePlantWitness(this.clientId, this.plant.idDoc, witness.idDoc)
        .pipe(switchMap(() => this.clientService.getPlantWitnesses(this.clientId, this.plant!.idDoc)))
        .subscribe({
          next: (witnesses) => {
            this.witnesses.set(witnesses);
            this.deletingWitnessId.set(null);
          },
          error: () => {
            this.toastService.error('Error al eliminar el testigo.');
            this.deletingWitnessId.set(null);
          },
        });
    } else {
      this.witnesses.update((list) => list.filter((w) => w.idDoc !== witness.idDoc));
    }
  }

  submit(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }

    this.saving.set(true);
    const v = this.form.getRawValue();

    const shifts = [];
    if (v.shiftDiurnal)   shifts.push({ idDoc: crypto.randomUUID(), name: 'Turno Diurno',   type: 'diurnal'   as const, startTime: '', endTime: '', active: true });
    if (v.shiftNocturnal) shifts.push({ idDoc: crypto.randomUUID(), name: 'Turno Nocturno', type: 'nocturnal' as const, startTime: '', endTime: '', active: true });

    const payload = {
      code:            v.code?.trim()            || undefined,
      name:            v.name!.trim(),
      description:     v.description?.trim()     || undefined,
      contactName:     v.contactName?.trim()     || undefined,
      contactPosition: v.contactPosition?.trim() || undefined,
      contactEmail:    v.contactEmail?.trim()    || undefined,
      contactPhone:    v.contactPhone?.trim()    || undefined,
      street:          v.street?.trim()          || undefined,
      exteriorNumber:  v.exteriorNumber?.trim()  || undefined,
      interiorNumber:  v.interiorNumber?.trim()  || undefined,
      colony:          v.colony?.trim()          || undefined,
      municipality:    v.municipality?.trim()    || undefined,
      state:           v.state?.trim()           || undefined,
      country:         v.country?.trim()         || undefined,
      postalCode:      v.postalCode?.trim()      || undefined,
      active:          v.active!,
      shifts,
    };

    if (this.plant?.idDoc) {
      // Update — witnesses already saved individually
      this.clientService.updatePlant(this.clientId, this.plant.idDoc, payload).subscribe({
        next: () => {
          this.toastService.success('Planta actualizada correctamente.');
          this.saving.set(false);
          this.closed.emit(true);
        },
        error: () => {
          this.toastService.error('Error al actualizar la planta.');
          this.saving.set(false);
        },
      });
    } else {
      // Create plant then save pending witnesses
      this.clientService.addPlant(this.clientId, payload).pipe(
        switchMap((plantId) => {
          const pending = this.witnesses();
          if (!pending.length) return of(void 0);
          return forkJoin(
            pending.map((w) =>
              this.clientService.addPlantWitness(this.clientId, plantId, {
                name: w.name,
                lastName: w.lastName,
                email: w.email,
                phone: w.phone,
                active: w.active,
              })
            )
          );
        })
      ).subscribe({
        next: () => {
          this.toastService.success('Planta agregada correctamente.');
          this.saving.set(false);
          this.closed.emit(true);
        },
        error: () => {
          this.toastService.error('Error al agregar la planta.');
          this.saving.set(false);
        },
      });
    }
  }

  cancel(): void { this.closed.emit(false); }

  private loadWitnesses(): void {
    if (!this.plant?.idDoc) return;
    this.loadingWitnesses.set(true);
    this.clientService.getPlantWitnesses(this.clientId, this.plant.idDoc).subscribe({
      next: (witnesses) => {
        this.witnesses.set(witnesses);
        this.loadingWitnesses.set(false);
      },
      error: () => this.loadingWitnesses.set(false),
    });
  }
}
