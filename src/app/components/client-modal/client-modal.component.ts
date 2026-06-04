import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { ClientService } from '../../services/client.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-client-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './client-modal.component.html',
  styleUrl: './client-modal.component.scss',
})
export class ClientModalComponent {
  @Output() closed = new EventEmitter<boolean>();

  private fb = inject(FormBuilder);
  private clientService = inject(ClientService);
  private toastService = inject(ToastService);

  saving = signal(false);

  form = this.fb.group({
    name:      ['', [Validators.required, Validators.minLength(2)]],
    legalName: ['', [Validators.required, Validators.minLength(2)]],
    rfc:       [''],
    email:     ['', [Validators.email]],
    phone:     [''],
    active:    [true],
  });

  isFieldInvalid(field: string): boolean {
    const c = this.form.get(field);
    return !!(c?.invalid && (c.dirty || c.touched));
  }

  submit(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }

    this.saving.set(true);
    const v = this.form.getRawValue();

    this.clientService.createClient({
      name:      v.name!.trim(),
      legalName: v.legalName!.trim(),
      rfc:       v.rfc?.trim()   || undefined,
      email:     v.email?.trim() || undefined,
      phone:     v.phone?.trim() || undefined,
      active:    v.active!,
    }).subscribe({
      next: () => {
        this.toastService.success('Cliente creado correctamente.');
        this.closed.emit(true);
      },
      error: () => {
        this.toastService.error('Error al crear el cliente.');
        this.saving.set(false);
      },
    });
  }

  cancel(): void { this.closed.emit(false); }
}
