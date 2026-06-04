import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize, of, switchMap, take } from 'rxjs';

import { Customer } from '../../interfaces/customer.interface';
import { AuthService } from '../../services/auth.service';
import { CustomerService } from '../../services/customer.service';
import { ToastService } from '../../services/toast.service';
import { UserService } from '../../services/user.service';

@Component({
  selector: 'app-customer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './customer.component.html',
  styleUrl: './customer.component.scss',
})
export class CustomerComponent implements OnInit {
  constructor(
    private authService: AuthService,
    private userService: UserService,
    private customerService: CustomerService,
    private toastService: ToastService,
    private cdr: ChangeDetectorRef
  ) {}

  customer: Customer | null = null;
  isLoading = true;
  isSaving = false;
  isUploadingLogo = false;
  customerForm = {
    businessName: '',
    commercialName: '',
    rfc: '',
    code: '',
    street: '',
    exteriorNumber: '',
    colony: '',
    municipality: '',
    state: '',
    country: '',
    postalCode: '',
  };

  ngOnInit(): void {
    this.authService.currentUser$
      .pipe(
        take(1),
        switchMap((firebaseUser) => {
          if (!firebaseUser) {
            return of(null);
          }

          return this.userService.getUserById(firebaseUser.uid).pipe(
            switchMap((appUser) => {
              if (!appUser?.customerId) {
                return of(null);
              }

              return this.customerService.getCustomerById(appUser.customerId);
            })
          );
        }),
        finalize(() => {
          this.isLoading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe((customer) => {
        this.customer = customer;
        this.patchForm(customer);
        this.cdr.markForCheck();
      });
  }

  get fullAddress(): string {
    if (!this.customer) {
      return 'Sin dirección registrada';
    }

    return [
      this.customer.street,
      this.customer.exteriorNumber,
      this.customer.colony,
      this.customer.municipality,
      this.customer.state,
      this.customer.country,
      this.customer.postalCode,
    ]
      .filter(Boolean)
      .join(', ') || 'Sin dirección registrada';
  }

  saveCustomer(): void {
    if (!this.customer?.idDoc) {
      this.toastService.error('No se encontró un customer asociado para actualizar.');
      return;
    }

    if (!this.customerForm.businessName.trim()) {
      this.toastService.warning('La razón social es obligatoria.');
      return;
    }

    if (!this.customerForm.code.trim()) {
      this.toastService.warning('La clave del cliente es obligatoria.');
      return;
    }

    this.isSaving = true;
    this.cdr.markForCheck();

    this.customerService
      .updateCustomer(this.customer.idDoc, {
        businessName: this.customerForm.businessName.trim(),
        commercialName: this.normalizeOptional(this.customerForm.commercialName),
        rfc: this.normalizeOptional(this.customerForm.rfc),
        code: this.customerForm.code.trim(),
        street: this.normalizeOptional(this.customerForm.street),
        exteriorNumber: this.normalizeOptional(this.customerForm.exteriorNumber),
        colony: this.normalizeOptional(this.customerForm.colony),
        municipality: this.normalizeOptional(this.customerForm.municipality),
        state: this.normalizeOptional(this.customerForm.state),
        country: this.normalizeOptional(this.customerForm.country),
        postalCode: this.normalizeOptional(this.customerForm.postalCode),
      })
      .pipe(
        finalize(() => {
          this.isSaving = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: () => {
          this.customer = {
            ...this.customer!,
            ...this.customerForm,
            businessName: this.customerForm.businessName.trim(),
            code: this.customerForm.code.trim(),
            commercialName: this.normalizeOptional(this.customerForm.commercialName),
            rfc: this.normalizeOptional(this.customerForm.rfc),
            street: this.normalizeOptional(this.customerForm.street),
            exteriorNumber: this.normalizeOptional(this.customerForm.exteriorNumber),
            colony: this.normalizeOptional(this.customerForm.colony),
            municipality: this.normalizeOptional(this.customerForm.municipality),
            state: this.normalizeOptional(this.customerForm.state),
            country: this.normalizeOptional(this.customerForm.country),
            postalCode: this.normalizeOptional(this.customerForm.postalCode),
          };
          this.toastService.success('La información de la empresa fue actualizada.');
          this.cdr.markForCheck();
        },
        error: (error: unknown) => {
          console.error('Error updating customer', error);
          this.toastService.error('No fue posible actualizar la empresa.');
        },
      });
  }

  onLogoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file || !this.customer?.idDoc) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      this.toastService.warning('Selecciona un archivo de imagen válido.');
      input.value = '';
      return;
    }

    this.isUploadingLogo = true;
    this.cdr.markForCheck();

    this.customerService
      .uploadCustomerLogo(this.customer.idDoc, file)
      .pipe(
        switchMap((downloadUrl) =>
          this.customerService
            .updateCustomer(this.customer!.idDoc, { urlLogo: downloadUrl })
            .pipe(switchMap(() => of(downloadUrl)))
        ),
        finalize(() => {
          this.isUploadingLogo = false;
          input.value = '';
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (downloadUrl) => {
          this.customer = {
            ...this.customer!,
            urlLogo: downloadUrl,
          };
          this.toastService.success('Logo de empresa actualizado correctamente.');
          this.cdr.markForCheck();
        },
        error: (error: unknown) => {
          console.error('Error uploading customer logo', error);
          this.toastService.error('No fue posible subir el logo de la empresa.');
        },
      });
  }

  private patchForm(customer: Customer | null): void {
    this.customerForm = {
      businessName: customer?.businessName || '',
      commercialName: customer?.commercialName || '',
      rfc: customer?.rfc || '',
      code: customer?.code || '',
      street: customer?.street || '',
      exteriorNumber: customer?.exteriorNumber || '',
      colony: customer?.colony || '',
      municipality: customer?.municipality || '',
      state: customer?.state || '',
      country: customer?.country || '',
      postalCode: customer?.postalCode || '',
    };
  }

  private normalizeOptional(value: string): string | undefined {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
}
