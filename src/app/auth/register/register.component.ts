import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TimeoutError, finalize, switchMap, timeout } from 'rxjs';
import { FirebaseError } from 'firebase/app';

import { Customer } from '../../interfaces/customer.interface';
import { Role } from '../../interfaces/role.interface';
import { User } from '../../interfaces/user.interface';
import { AuthService } from '../../services/auth.service';
import { CustomerService } from '../../services/customer.service';
import { RoleService } from '../../services/role.service';
import { ToastService } from '../../services/toast.service';
import { UserService } from '../../services/user.service';

type RegisterFormDraft = {
  prefix: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  phone: string;
  roleId: string;
  password: string;
  confirmPassword: string;
  termsAccepted: boolean;
};

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss',
})
export class RegisterComponent implements OnInit {
  private readonly draftStorageKey = 'register-draft';
  private readonly defaultRegisterForm: RegisterFormDraft = {
    prefix: '',
    firstName: '',
    lastName: '',
    displayName: '',
    email: '',
    phone: '',
    roleId: '',
    password: '',
    confirmPassword: '',
    termsAccepted: false,
  };

  constructor(
    private authService: AuthService,
    private customerService: CustomerService,
    private roleService: RoleService,
    private toastService: ToastService,
    private userService: UserService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  customerCode = '';
  customerValidated = false;
  customerValidationMessage = '';
  customerFound: Customer | null = null;
  isValidatingCustomer = false;
  roles: Role[] = [];
  isLoadingRoles = false;
  isSubmittingRegister = false;
  showPassword = false;
  showConfirmPassword = false;

  registerForm = { ...this.defaultRegisterForm };

  ngOnInit(): void {
    this.restoreDraft();
  }

  validateCustomerCode(): void {
    const normalizedCode = this.customerCode.trim().toUpperCase();

    if (!normalizedCode) {
      this.customerValidated = false;
      this.customerFound = null;
      this.customerValidationMessage = 'Ingresa una clave de cliente para continuar.';
      this.toastService.warning(this.customerValidationMessage);
      this.cdr.markForCheck();
      return;
    }

    this.customerCode = normalizedCode;
    this.customerValidated = false;
    this.customerFound = null;
    this.customerValidationMessage = '';
    this.isValidatingCustomer = true;
    this.saveDraft();
    this.cdr.markForCheck();

    this.customerService
      .validateCustomerCode(normalizedCode)
      .pipe(
        timeout(8000),
        finalize(() => {
          this.isValidatingCustomer = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (customer) => {
          if (!customer) {
            this.customerValidated = false;
            this.customerFound = null;
            this.customerValidationMessage = 'La clave cliente no es valida o no esta activa.';
            this.toastService.warning(this.customerValidationMessage);
            return;
          }

          this.customerValidated = true;
          this.customerFound = customer;
          this.customerValidationMessage = 'Clave validada correctamente.';
          this.registerForm.roleId = '';
          this.saveDraft();
          this.loadRoles();
          this.toastService.success(this.customerValidationMessage);
        },
        error: (error: unknown) => {
          console.error('Error validating customer code', error);
          this.customerValidated = false;
          this.customerFound = null;
          this.customerValidationMessage = this.getCustomerValidationErrorMessage(error);
          this.saveDraft();
          this.toastService.error(this.customerValidationMessage);
        },
      });
  }

  saveDraft(): void {
    sessionStorage.setItem(
      this.draftStorageKey,
      JSON.stringify({
        customerCode: this.customerCode,
        customerValidated: this.customerValidated,
        customerValidationMessage: this.customerValidationMessage,
        customerFound: this.customerFound,
        registerForm: this.registerForm,
      })
    );
  }

  private getCustomerValidationErrorMessage(error: unknown): string {
    if (error instanceof TimeoutError) {
      return 'La consulta de clientes tardo demasiado. Firestore no esta respondiendo.';
    }

    if (error instanceof FirebaseError) {
      if (error.code === 'permission-denied') {
        return 'Firestore rechazo la consulta. Revisa las reglas de la coleccion customers.';
      }

      if (error.code === 'failed-precondition') {
        return 'Firestore requiere ajustar la consulta o crear un indice.';
      }

      if (error.code === 'unavailable') {
        return 'No hay conexion con Firestore en este momento.';
      }
    }

    return 'No fue posible validar la clave cliente. Revisa Firestore o la conexion.';
  }

  loadRoles(): void {
    this.isLoadingRoles = true;
    this.cdr.markForCheck();

    this.roleService
      .getActiveRoles()
      .pipe(
        timeout(8000),
        finalize(() => {
          this.isLoadingRoles = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (roles) => {
          this.roles = roles.filter((r) => r.idDoc !== 'NPsdyKHT4qpRnRULhC7R');

          if (this.roles.length === 1) {
            this.registerForm.roleId = this.roles[0].idDoc;
          }

          this.saveDraft();
        },
        error: (error: unknown) => {
          console.error('Error loading roles', error);
          this.roles = [];
          this.toastService.error('No fue posible cargar los roles para el registro.');
        },
      });
  }

  togglePasswordVisibility(field: 'password' | 'confirmPassword'): void {
    if (field === 'password') {
      this.showPassword = !this.showPassword;
      return;
    }

    this.showConfirmPassword = !this.showConfirmPassword;
  }

  submitRegister(): void {
    const validationMessage = this.validateRegisterForm();

    if (validationMessage) {
      this.toastService.warning(validationMessage);
      return;
    }

    this.isSubmittingRegister = true;
    this.cdr.markForCheck();

    this.authService
      .register(this.registerForm.email.trim(), this.registerForm.password)
      .pipe(
        switchMap((credential) =>
          this.userService.createUser(credential.user.uid, this.buildUserDocument())
        ),
        finalize(() => {
          this.isSubmittingRegister = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: () => {
          this.resetRegisterState();
          this.toastService.success(
            'Usuario creado con éxito en Sistema.'
          );
          void this.router.navigate(['/auth/login']);
        },
        error: (error: unknown) => {
          console.error('Error creating auth user or firestore user', error);
          this.toastService.error(this.getRegisterSaveErrorMessage(error));
        },
      });
  }

  private buildUserDocument(): Omit<User, 'idDoc' | 'createdAt'> {
    const selectedRole = this.roles.find((role) => role.idDoc === this.registerForm.roleId);
    const userDoc: Omit<User, 'idDoc' | 'createdAt'> = {
      prefix: this.registerForm.prefix || undefined,
      firstName: this.registerForm.firstName.trim(),
      lastName: this.registerForm.lastName.trim(),
      displayName: this.registerForm.displayName.trim(),
      email: this.registerForm.email.trim(),
      phone: this.registerForm.phone.trim() || '',
      roleId: this.registerForm.roleId,
      active: true,
      approved: false,
      termsAccepted: this.registerForm.termsAccepted,
      termsAcceptedAt: this.registerForm.termsAccepted ? new Date() : undefined,
    };

    if (this.customerFound?.idDoc) {
      userDoc.customerId = this.customerFound.idDoc;
    }

    if (this.customerFound?.businessName) {
      userDoc.customerName = this.customerFound.businessName;
    }

    if (selectedRole?.name) {
      userDoc.roleName = selectedRole.name;
    }

    if (!userDoc.phone) {
      delete userDoc.phone;
    }

    return userDoc;
  }

  private restoreDraft(): void {
    const draft = sessionStorage.getItem(this.draftStorageKey);

    if (!draft) {
      return;
    }

    try {
      const parsed = JSON.parse(draft) as {
        customerCode?: string;
        customerValidated?: boolean;
        customerValidationMessage?: string;
        customerFound?: Customer | null;
        registerForm?: Partial<RegisterFormDraft>;
      };

      this.customerCode = parsed.customerCode ?? '';
      this.customerValidated = parsed.customerValidated ?? false;
      this.customerValidationMessage = parsed.customerValidationMessage ?? '';
      this.customerFound = parsed.customerFound ?? null;
      this.registerForm = {
        ...this.defaultRegisterForm,
        ...(parsed.registerForm ?? {}),
      };

      if (this.customerValidated) {
        this.loadRoles();
      }
    } catch (error) {
      console.error('Error restoring register draft', error);
      sessionStorage.removeItem(this.draftStorageKey);
    }
  }

  private validateRegisterForm(): string | null {
    if (!this.customerValidated || !this.customerFound) {
      return 'Primero valida la clave cliente antes de continuar.';
    }

    if (!this.registerForm.prefix) {
      return 'Selecciona un prefijo.';
    }

    if (!this.registerForm.firstName.trim() || !this.registerForm.lastName.trim()) {
      return 'Captura nombre y apellidos del usuario.';
    }

    if (!this.registerForm.displayName.trim()) {
      return 'Captura el nombre para mostrar.';
    }

    if (!this.registerForm.email.trim()) {
      return 'Captura el correo electronico.';
    }

    if (!this.registerForm.roleId) {
      return 'Selecciona un rol para el usuario.';
    }

    if (!this.registerForm.password) {
      return 'Captura una contraseña.';
    }

    if (this.registerForm.password.length < 6) {
      return 'La contraseña debe tener al menos 6 caracteres.';
    }

    if (this.registerForm.password !== this.registerForm.confirmPassword) {
      return 'La contraseña y su confirmacion no coinciden.';
    }

    if (!this.registerForm.termsAccepted) {
      return 'Debes aceptar los terminos y condiciones de uso.';
    }

    return null;
  }

  private getAuthRegisterErrorMessage(error: unknown): string {
    if (error instanceof FirebaseError) {
      if (error.code === 'auth/email-already-in-use') {
        return 'El correo electronico ya esta registrado.';
      }

      if (error.code === 'auth/invalid-email') {
        return 'El correo electronico no es valido.';
      }

      if (error.code === 'auth/weak-password') {
        return 'La contraseña es demasiado debil.';
      }
    }

    return 'No fue posible crear el usuario en autenticacion.';
  }

  private getRegisterSaveErrorMessage(error: unknown): string {
    const authMessage = this.getAuthRegisterErrorMessage(error);

    if (authMessage !== 'No fue posible crear el usuario en autenticacion.') {
      return authMessage;
    }

    if (error instanceof FirebaseError && error.code === 'permission-denied') {
      return 'El usuario se creo en autenticacion, pero Firestore no permitio guardar en la coleccion user.';
    }

    return 'No fue posible completar el registro del usuario.';
  }

  private resetRegisterState(): void {
    this.customerCode = '';
    this.customerValidated = false;
    this.customerValidationMessage = '';
    this.customerFound = null;
    this.roles = [];
    this.isLoadingRoles = false;
    this.showPassword = false;
    this.showConfirmPassword = false;
    this.registerForm = { ...this.defaultRegisterForm };
    sessionStorage.removeItem(this.draftStorageKey);
  }
}
