import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { Role } from '../../interfaces/role.interface';
import { RoleService } from '../../services/role.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-role-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './role-modal.component.html',
  styleUrl: './role-modal.component.scss',
})
export class RoleModalComponent {
  @Output() closed = new EventEmitter<Role | null>();

  private fb = inject(FormBuilder);
  private roleService = inject(RoleService);
  private toastService = inject(ToastService);

  saving = signal(false);

  form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    description: [''],
    active: [true],
  });

  save(): void {
    if (this.form.invalid || this.saving()) return;

    this.saving.set(true);
    const { name, description, active } = this.form.getRawValue();

    this.roleService
      .createRole({ name: name!.trim(), description: description?.trim() || '', active: active! })
      .subscribe({
        next: (role) => {
          this.toastService.success('Rol creado correctamente.');
          this.closed.emit(role);
        },
        error: () => {
          this.toastService.error('Error al crear el rol. Intenta de nuevo.');
          this.saving.set(false);
        },
      });
  }

  cancel(): void {
    this.closed.emit(null);
  }
}
