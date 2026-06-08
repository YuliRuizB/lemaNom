import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { of, switchMap, take } from 'rxjs';

import { User } from '../../interfaces/user.interface';
import { AuthService } from '../../services/auth.service';
import { ClientService } from '../../services/client.service';
import { ToastService } from '../../services/toast.service';
import { UserService } from '../../services/user.service';

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
  private authService = inject(AuthService);
  private clientService = inject(ClientService);
  private toastService = inject(ToastService);
  private userService = inject(UserService);

  saving = signal(false);
  currentAppUser = signal<User | null>(null);

  form = this.fb.group({
    clientNumber: ['', [Validators.required, Validators.minLength(1)]],
    name:      ['', [Validators.required, Validators.minLength(2)]],
    legalName: ['', [Validators.required, Validators.minLength(2)]],
    rfc:       [''],
    email:     ['', [Validators.email]],
    phone:     [''],
    active:    [true],
  });

  constructor() {
    this.loadCurrentUser();
  }

  isFieldInvalid(field: string): boolean {
    const c = this.form.get(field);
    return !!(c?.invalid && (c.dirty || c.touched));
  }

  submit(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }

    this.saving.set(true);
    const v = this.form.getRawValue();

    this.clientService.createClient({
      customerId: this.currentAppUser()?.customerId,
      customerName: this.currentAppUser()?.customerName,
      clientNumber: v.clientNumber!.trim(),
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

  private loadCurrentUser(): void {
    this.authService.currentUser$
      .pipe(
        take(1),
        switchMap((firebaseUser) => {
          if (!firebaseUser) {
            return of(null);
          }

          return this.userService.getUserById(firebaseUser.uid);
        })
      )
      .subscribe((user) => {
        this.currentAppUser.set(user);
      });
  }
}
