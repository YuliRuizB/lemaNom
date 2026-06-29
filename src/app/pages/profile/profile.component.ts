import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize, of, switchMap, take } from 'rxjs';

import { User, UserAccreditation, UserQualification } from '../../interfaces/user.interface';
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
  isSavingAccreditation = false;
  isSavingQualification = false;
  deletingAccreditationId: string | null = null;
  deletingQualificationId: string | null = null;
  activeExtraTab: 'datos' | 'acreditaciones' | 'cedula' = 'datos';
  accreditations: UserAccreditation[] = [];
  qualifications: UserQualification[] = [];
  selectedAccreditationFile: File | null = null;
  selectedAccreditationFileName = '';
  selectedQualificationFile: File | null = null;
  selectedQualificationFileName = '';
  editingAccreditationId: string | null = null;
  editingQualificationId: string | null = null;

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
  accreditationForm = {
    name: '',
    description: '',
  };
  qualificationForm = {
    name: '',
    description: '',
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
        if (user?.idDoc) {
          this.loadAccreditations(user.idDoc);
          this.loadQualifications(user.idDoc);
        }
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

  onAccreditationFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    if (!file) {
      this.selectedAccreditationFile = null;
      this.selectedAccreditationFileName = '';
      return;
    }

    this.selectedAccreditationFile = file;
    this.selectedAccreditationFileName = file.name;
  }

  onQualificationFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    if (!file) {
      this.selectedQualificationFile = null;
      this.selectedQualificationFileName = '';
      return;
    }

    this.selectedQualificationFile = file;
    this.selectedQualificationFileName = file.name;
  }

  saveAccreditation(): void {
    if (!this.user?.idDoc) {
      this.toastService.error('No se encontró un usuario válido para guardar la acreditación.');
      return;
    }

    if (!this.accreditationForm.name.trim()) {
      this.toastService.warning('El nombre de la acreditación es obligatorio.');
      return;
    }

    if (!this.editingAccreditationId && !this.selectedAccreditationFile) {
      this.toastService.warning('Selecciona un archivo para la acreditación.');
      return;
    }

    this.isSavingAccreditation = true;
    this.cdr.markForCheck();

    const isEditing = !!this.editingAccreditationId;
    const existingAccreditation = this.editingAccreditationId
      ? this.accreditations.find((item) => item.idDoc === this.editingAccreditationId) ?? null
      : null;

    const uploadOrReuse$ = this.selectedAccreditationFile
      ? this.userService.uploadUserAccreditationFile(this.user.idDoc, this.selectedAccreditationFile)
      : of({
          fileUrl: existingAccreditation?.fileUrl ?? '',
          fileName: existingAccreditation?.fileName ?? '',
        });

    uploadOrReuse$
      .pipe(
        switchMap(({ fileUrl, fileName }) => {
          const payload = {
            name: this.accreditationForm.name.trim(),
            description: this.normalizeOptional(this.accreditationForm.description),
            fileUrl,
            fileName,
            active: true,
          };

          if (this.editingAccreditationId) {
            return this.userService.updateUserAccreditation(
              this.user!.idDoc,
              this.editingAccreditationId,
              payload
            );
          }

          return this.userService.createUserAccreditation(this.user!.idDoc, payload);
        }),
        switchMap(() => {
          if (
            this.editingAccreditationId &&
            this.selectedAccreditationFile &&
            existingAccreditation?.fileUrl &&
            existingAccreditation.fileUrl !== ''
          ) {
            return this.userService.deleteStorageFile(existingAccreditation.fileUrl);
          }

          return of(null);
        }),
        finalize(() => {
          this.isSavingAccreditation = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: () => {
          this.resetAccreditationForm();
          this.loadAccreditations(this.user!.idDoc);
          this.toastService.success(
            isEditing
              ? 'La acreditación se actualizó correctamente.'
              : 'La acreditación se guardó correctamente.'
          );
        },
        error: (error: unknown) => {
          console.error('Error saving accreditation', error);
          this.toastService.error('No fue posible guardar la acreditación.');
        },
      });
  }

  editAccreditation(accreditation: UserAccreditation): void {
    this.editingAccreditationId = accreditation.idDoc;
    this.accreditationForm = {
      name: accreditation.name,
      description: accreditation.description || '',
    };
    this.selectedAccreditationFile = null;
    this.selectedAccreditationFileName = accreditation.fileName || '';
    this.cdr.markForCheck();
  }

  cancelAccreditationEdit(): void {
    this.resetAccreditationForm();
    this.cdr.markForCheck();
  }

  deleteAccreditation(accreditation: UserAccreditation): void {
    if (!this.user?.idDoc) {
      this.toastService.error('No se encontró un usuario válido para borrar la acreditación.');
      return;
    }

    const confirmed = window.confirm(`¿Deseas borrar la acreditación "${accreditation.name}"?`);
    if (!confirmed) {
      return;
    }

    this.deletingAccreditationId = accreditation.idDoc;
    this.cdr.markForCheck();

    this.userService
      .deleteUserAccreditation(this.user.idDoc, accreditation.idDoc)
      .pipe(
        switchMap(() => {
          if (!accreditation.fileUrl) {
            return of(null);
          }

          return this.userService.deleteStorageFile(accreditation.fileUrl);
        }),
        finalize(() => {
          this.deletingAccreditationId = null;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: () => {
          if (this.editingAccreditationId === accreditation.idDoc) {
            this.resetAccreditationForm();
          }
          this.accreditations = this.accreditations.filter((item) => item.idDoc !== accreditation.idDoc);
          this.toastService.success('La acreditación se borró correctamente.');
          this.cdr.markForCheck();
        },
        error: (error: unknown) => {
          console.error('Error deleting accreditation', error);
          this.toastService.error('No fue posible borrar la acreditación.');
        },
      });
  }

  isEditingAccreditation(accreditationId: string): boolean {
    return this.editingAccreditationId === accreditationId;
  }

  saveQualification(): void {
    if (!this.user?.idDoc) {
      this.toastService.error('No se encontró un usuario válido para guardar la cédula profesional.');
      return;
    }

    if (!this.qualificationForm.name.trim()) {
      this.toastService.warning('El nombre de la cédula profesional es obligatorio.');
      return;
    }

    if (!this.editingQualificationId && !this.selectedQualificationFile) {
      this.toastService.warning('Selecciona un archivo para la cédula profesional.');
      return;
    }

    this.isSavingQualification = true;
    this.cdr.markForCheck();

    const isEditing = !!this.editingQualificationId;
    const existingQualification = this.editingQualificationId
      ? this.qualifications.find((item) => item.idDoc === this.editingQualificationId) ?? null
      : null;

    const uploadOrReuse$ = this.selectedQualificationFile
      ? this.userService.uploadUserQualificationFile(this.user.idDoc, this.selectedQualificationFile)
      : of({
          fileUrl: existingQualification?.fileUrl ?? '',
          fileName: existingQualification?.fileName ?? '',
        });

    uploadOrReuse$
      .pipe(
        switchMap(({ fileUrl, fileName }) => {
          const payload = {
            name: this.qualificationForm.name.trim(),
            description: this.normalizeOptional(this.qualificationForm.description),
            fileUrl,
            fileName,
            active: true,
          };

          if (this.editingQualificationId) {
            return this.userService.updateUserQualification(
              this.user!.idDoc,
              this.editingQualificationId,
              payload
            );
          }

          return this.userService.createUserQualification(this.user!.idDoc, payload);
        }),
        switchMap(() => {
          if (
            this.editingQualificationId &&
            this.selectedQualificationFile &&
            existingQualification?.fileUrl &&
            existingQualification.fileUrl !== ''
          ) {
            return this.userService.deleteStorageFile(existingQualification.fileUrl);
          }

          return of(null);
        }),
        finalize(() => {
          this.isSavingQualification = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: () => {
          this.resetQualificationForm();
          this.loadQualifications(this.user!.idDoc);
          this.toastService.success(
            isEditing
              ? 'La cédula profesional se actualizó correctamente.'
              : 'La cédula profesional se guardó correctamente.'
          );
        },
        error: (error: unknown) => {
          console.error('Error saving qualification', error);
          this.toastService.error('No fue posible guardar la cédula profesional.');
        },
      });
  }

  editQualification(qualification: UserQualification): void {
    this.editingQualificationId = qualification.idDoc;
    this.qualificationForm = {
      name: qualification.name,
      description: qualification.description || '',
    };
    this.selectedQualificationFile = null;
    this.selectedQualificationFileName = qualification.fileName || '';
    this.cdr.markForCheck();
  }

  cancelQualificationEdit(): void {
    this.resetQualificationForm();
    this.cdr.markForCheck();
  }

  deleteQualification(qualification: UserQualification): void {
    if (!this.user?.idDoc) {
      this.toastService.error('No se encontró un usuario válido para borrar la cédula profesional.');
      return;
    }

    const confirmed = window.confirm(`¿Deseas borrar la cédula profesional "${qualification.name}"?`);
    if (!confirmed) {
      return;
    }

    this.deletingQualificationId = qualification.idDoc;
    this.cdr.markForCheck();

    this.userService
      .deleteUserQualification(this.user.idDoc, qualification.idDoc)
      .pipe(
        switchMap(() => {
          if (!qualification.fileUrl) {
            return of(null);
          }

          return this.userService.deleteStorageFile(qualification.fileUrl);
        }),
        finalize(() => {
          this.deletingQualificationId = null;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: () => {
          if (this.editingQualificationId === qualification.idDoc) {
            this.resetQualificationForm();
          }
          this.qualifications = this.qualifications.filter((item) => item.idDoc !== qualification.idDoc);
          this.toastService.success('La cédula profesional se borró correctamente.');
          this.cdr.markForCheck();
        },
        error: (error: unknown) => {
          console.error('Error deleting qualification', error);
          this.toastService.error('No fue posible borrar la cédula profesional.');
        },
      });
  }

  isEditingQualification(qualificationId: string): boolean {
    return this.editingQualificationId === qualificationId;
  }

  private resetAccreditationForm(): void {
    this.editingAccreditationId = null;
    this.accreditationForm = {
      name: '',
      description: '',
    };
    this.selectedAccreditationFile = null;
    this.selectedAccreditationFileName = '';
  }

  private resetQualificationForm(): void {
    this.editingQualificationId = null;
    this.qualificationForm = {
      name: '',
      description: '',
    };
    this.selectedQualificationFile = null;
    this.selectedQualificationFileName = '';
  }

  private loadAccreditations(uid: string): void {
    this.userService
      .getUserAccreditations(uid)
      .pipe(take(1))
      .subscribe({
        next: (items) => {
          this.accreditations = items;
          this.cdr.markForCheck();
        },
        error: () => {
          this.accreditations = [];
          this.cdr.markForCheck();
        },
      });
  }

  private loadQualifications(uid: string): void {
    this.userService
      .getUserQualifications(uid)
      .pipe(take(1))
      .subscribe({
        next: (items) => {
          this.qualifications = items;
          this.cdr.markForCheck();
        },
        error: () => {
          this.qualifications = [];
          this.cdr.markForCheck();
        },
      });
  }

  private normalizeOptional(value: string): string | undefined {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
}
