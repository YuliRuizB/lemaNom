import { CommonModule } from '@angular/common';
import { Component, EventEmitter, OnInit, Output, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { take, switchMap } from 'rxjs';

import { AuthService } from '../../services/auth.service';
import { EquipmentService } from '../../services/equipment.service';
import { ToastService } from '../../services/toast.service';
import { UserService } from '../../services/user.service';

@Component({
  selector: 'app-equipment-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './equipment-modal.component.html',
  styleUrl: './equipment-modal.component.scss',
})
export class EquipmentModalComponent implements OnInit {
  @Output() closed = new EventEmitter<boolean>();

  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private userService = inject(UserService);
  private equipmentService = inject(EquipmentService);
  private toastService = inject(ToastService);

  saving = signal(false);
  private customerId = '';
  private customerName = '';

  form = this.fb.group({
    name:       ['', [Validators.required, Validators.minLength(2)]],
    identifier: ['', [Validators.required]],
    ns:         ['', [Validators.required]],
    polos:      [''],
    brand:      [''],
    model:      [''],
    range:      [''],
    frecuency:  [''],
    precition:  [''],
    especify_equipment: [''],
    voltage:    [''],
    active:     [true],
  });

  ngOnInit(): void {
    this.authService.currentUser$.pipe(
      take(1),
      switchMap((firebaseUser) => this.userService.getUserById(firebaseUser!.uid).pipe(take(1)))
    ).subscribe((appUser) => {
      this.customerId   = appUser?.customerId   ?? '';
      this.customerName = appUser?.customerName ?? '';
    });
  }

  isFieldInvalid(field: string): boolean {
    const control = this.form.get(field);
    return !!(control?.invalid && (control.dirty || control.touched));
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    const v = this.form.getRawValue();

    this.equipmentService.createEquipment({
      name:         v.name!.trim(),
      identifier:   v.identifier!.trim(),
      ns:           v.ns!.trim(),
      polos:        v.polos?.trim()    || undefined,
      brand:        v.brand?.trim()    || undefined,
      model:        v.model?.trim()    || undefined,
      range:        v.range?.trim()    || undefined,
      frecuency:    v.frecuency?.trim() || undefined,
      precition:    v.precition?.trim() || undefined,
      especify_equipment: v.especify_equipment?.trim() || undefined,
      voltage:      v.voltage?.trim()   || undefined,
      active:       v.active!,
      customerId:   this.customerId   || undefined,
      customerName: this.customerName || undefined,
    }).subscribe({
      next: () => {
        this.toastService.success('Equipo registrado correctamente.');
        this.closed.emit(true);
      },
      error: () => {
        this.toastService.error('Error al guardar el equipo.');
        this.saving.set(false);
      },
    });
  }

  cancel(): void {
    this.closed.emit(false);
  }
}
