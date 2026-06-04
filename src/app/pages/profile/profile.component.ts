import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize, of, switchMap, take } from 'rxjs';

import { User } from '../../interfaces/user.interface';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { UserService } from '../../services/user.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss',
})
export class ProfileComponent implements OnInit {
  constructor(
    private authService: AuthService,
    private userService: UserService,
    private toastService: ToastService,
    private cdr: ChangeDetectorRef
  ) {}

  user: User | null = null;
  isLoading = true;
  isSaving = false;
  isUploadingPhoto = false;

  profileForm = {
    firstName: '',
    lastName: '',
    displayName: '',
    email: '',
    phone: '',
    photoUrl: '',
    customerName: '',
    roleName: '',
    active: false,
    termsAccepted: false,
  };

  ngOnInit(): void {
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
        this.user = user;
        this.patchForm(user);
        this.isLoading = false;
        this.cdr.markForCheck();
      });
  }

  private patchForm(user: User | null): void {
    this.profileForm = {
      firstName: user?.firstName || '',
      lastName: user?.lastName || '',
      displayName: user?.displayName || '',
      email: user?.email || '',
      phone: user?.phone || '',
      photoUrl: user?.photoUrl || '',
      customerName: user?.customerName || '',
      roleName: user?.roleName || '',
      active: user?.active ?? false,
      termsAccepted: user?.termsAccepted ?? false,
    };
  }

  saveProfile(): void {
    if (!this.user?.idDoc) {
      this.toastService.error('No se encontró un usuario válido para actualizar.');
      return;
    }

    if (!this.profileForm.firstName.trim() || !this.profileForm.lastName.trim()) {
      this.toastService.warning('Nombre y apellidos son obligatorios.');
      return;
    }

    if (!this.profileForm.displayName.trim()) {
      this.toastService.warning('El nombre para mostrar es obligatorio.');
      return;
    }

    if (!this.profileForm.email.trim()) {
      this.toastService.warning('El correo electrónico es obligatorio.');
      return;
    }

    this.isSaving = true;
    this.cdr.markForCheck();

    this.userService
      .updateUser(this.user.idDoc, {
        firstName: this.profileForm.firstName.trim(),
        lastName: this.profileForm.lastName.trim(),
        displayName: this.profileForm.displayName.trim(),
        phone: this.normalizeOptional(this.profileForm.phone),
        photoUrl: this.normalizeOptional(this.profileForm.photoUrl),
      })
      .pipe(
        finalize(() => {
          this.isSaving = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: () => {
          this.user = {
            ...this.user!,
            firstName: this.profileForm.firstName.trim(),
            lastName: this.profileForm.lastName.trim(),
            displayName: this.profileForm.displayName.trim(),
            phone: this.normalizeOptional(this.profileForm.phone),
            photoUrl: this.normalizeOptional(this.profileForm.photoUrl),
          };
          this.toastService.success('El perfil fue actualizado correctamente.');
          this.cdr.markForCheck();
        },
        error: (error: unknown) => {
          console.error('Error updating profile', error);
          this.toastService.error('No fue posible actualizar el perfil.');
        },
      });
  }

  onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file || !this.user?.idDoc) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      this.toastService.warning('Selecciona un archivo de imagen válido.');
      input.value = '';
      return;
    }

    this.isUploadingPhoto = true;
    this.cdr.markForCheck();

    this.userService
      .uploadUserAvatar(this.user.idDoc, file)
      .pipe(
        switchMap((downloadUrl) =>
          this.userService
            .updateUser(this.user!.idDoc, { photoUrl: downloadUrl })
            .pipe(switchMap(() => of(downloadUrl)))
        ),
        finalize(() => {
          this.isUploadingPhoto = false;
          input.value = '';
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (downloadUrl) => {
          this.profileForm.photoUrl = downloadUrl;
          this.user = {
            ...this.user!,
            photoUrl: downloadUrl,
          };
          this.toastService.success('La imagen de perfil fue actualizada.');
          this.cdr.markForCheck();
        },
        error: (error: unknown) => {
          console.error('Error uploading profile avatar', error);
          this.toastService.error('No fue posible subir la imagen de perfil.');
        },
      });
  }

  private normalizeOptional(value: string): string | undefined {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
}
