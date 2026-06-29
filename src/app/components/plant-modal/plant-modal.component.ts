import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { ClientService } from '../../services/client.service';
import { ToastService } from '../../services/toast.service';
import { ClientPlant } from '../../interfaces/client.interface';

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

  ngOnInit(): void {
    if (!this.plant) {
      return;
    }

    this.form.reset({
      code: this.plant.code || '',
      name: this.plant.name || '',
      description: this.plant.description || '',
      shiftDiurnal: !!this.plant.shifts?.some((shift) => shift.type === 'diurnal'),
      shiftNocturnal: !!this.plant.shifts?.some((shift) => shift.type === 'nocturnal'),
      contactName: this.plant.contactName || '',
      contactPosition: this.plant.contactPosition || '',
      contactEmail: this.plant.contactEmail || '',
      contactPhone: this.plant.contactPhone || '',
      street: this.plant.street || '',
      exteriorNumber: this.plant.exteriorNumber || '',
      interiorNumber: this.plant.interiorNumber || '',
      colony: this.plant.colony || '',
      municipality: this.plant.municipality || '',
      state: this.plant.state || '',
      country: this.plant.country || '',
      postalCode: this.plant.postalCode || '',
      active: this.plant.active,
    });
  }

  isFieldInvalid(field: string): boolean {
    const c = this.form.get(field);
    return !!(c?.invalid && (c.dirty || c.touched));
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

    const request$ = this.plant?.idDoc
      ? this.clientService.updatePlant(this.clientId, this.plant.idDoc, payload)
      : this.clientService.addPlant(this.clientId, payload);

    request$.subscribe({
      next: () => {
        this.toastService.success(this.plant ? 'Planta actualizada correctamente.' : 'Planta agregada correctamente.');
        this.closed.emit(true);
      },
      error: () => {
        this.toastService.error(this.plant ? 'Error al actualizar la planta.' : 'Error al agregar la planta.');
        this.saving.set(false);
      },
    });
  }

  cancel(): void { this.closed.emit(false); }
}
