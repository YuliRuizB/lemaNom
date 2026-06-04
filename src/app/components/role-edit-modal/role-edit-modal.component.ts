import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { Role } from '../../interfaces/role.interface';
import { RoleService } from '../../services/role.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-role-edit-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './role-edit-modal.component.html',
  styleUrl: './role-edit-modal.component.scss',
})
export class RoleEditModalComponent implements OnInit {
  @Input({ required: true }) role!: Role;
  @Output() closed = new EventEmitter<boolean>();

  private fb = inject(FormBuilder);
  private roleService = inject(RoleService);
  private toastService = inject(ToastService);

  saving = signal(false);

  form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    description: [''],
  });

  ngOnInit(): void {
    this.form.patchValue({
      name: this.role.name,
      description: this.role.description ?? '',
    });
  }

  get hasChanged(): boolean {
    return (
      this.form.value.name?.trim() !== this.role.name ||
      (this.form.value.description?.trim() ?? '') !== (this.role.description ?? '')
    );
  }

  save(): void {
    if (this.form.invalid || !this.hasChanged || this.saving()) return;

    this.saving.set(true);
    const { name, description } = this.form.getRawValue();

    this.roleService.updateRole(this.role.idDoc, { name: name!.trim(), description: description?.trim() ?? '' }).subscribe({
      next: () => {
        this.toastService.success('Rol actualizado correctamente.');
        this.closed.emit(true);
      },
      error: () => {
        this.toastService.error('Error al actualizar el rol.');
        this.saving.set(false);
      },
    });
  }

  cancel(): void {
    this.closed.emit(false);
  }
}
