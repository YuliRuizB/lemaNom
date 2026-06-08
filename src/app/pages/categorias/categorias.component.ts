import { CommonModule, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize, forkJoin, map, of, switchMap, take } from 'rxjs';

import { Customer } from '../../interfaces/customer.interface';
import { nomCategory, nomCategoryServices } from '../../interfaces/nomCategory.interface';
import { AuthService } from '../../services/auth.service';
import { CustomerService } from '../../services/customer.service';
import { NomCategoryService } from '../../services/nom-category.service';
import { ToastService } from '../../services/toast.service';
import { UserService } from '../../services/user.service';

type CategoryTab = 'info' | 'services';
type CategoryView = nomCategory & { servicesCount: number };

@Component({
  selector: 'app-categorias',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DatePipe],
  templateUrl: './categorias.component.html',
  styleUrl: './categorias.component.scss',
})
export class CategoriasComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private userService = inject(UserService);
  private customerService = inject(CustomerService);
  private categoryService = inject(NomCategoryService);
  private toastService = inject(ToastService);

  categories = signal<CategoryView[]>([]);
  categoryServices = signal<nomCategoryServices[]>([]);
  loading = signal(true);
  servicesLoading = signal(false);
  showAddForm = signal(false);
  showAddServiceForm = signal(false);
  saving = signal(false);
  serviceSaving = signal(false);
  editingCategoryId = signal<string | null>(null);
  selectedCategory = signal<CategoryView | null>(null);
  activeTab = signal<CategoryTab>('info');
  customerContext = signal<Customer | null>(null);

  form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    prefix: ['', [Validators.required, Validators.minLength(1)]],
    active: [true],
  });

  serviceForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    prefix: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9]{2,3}$/)]],
    codeService: ['', [Validators.required, Validators.pattern(/^\d{2}$/)]],
    codeCustomer: [{ value: '', disabled: true }, [Validators.required, Validators.pattern(/^[A-Za-z]{3}$/)]],
    year: [{ value: '', disabled: true }, [Validators.required, Validators.pattern(/^\d{2}$/)]],
    active: [true],
  });

  orderedCategories = computed(() =>
    [...this.categories()].sort((a, b) => a.name.localeCompare(b.name))
  );
  currentYearCode = computed(() => String(new Date().getFullYear()).slice(-2));

  constructor() {
    this.loadCustomerContext();
    this.loadCategories();
  }

  openAddForm(): void {
    this.form.reset({ active: true });
    this.editingCategoryId.set(null);
    this.selectedCategory.set(null);
    this.showAddForm.set(true);
  }

  openEditForm(category: nomCategory): void {
    this.editingCategoryId.set(category.idDoc);
    this.form.reset({
      name: category.name,
      prefix: category.prefix,
      active: category.active,
    });
    this.showAddForm.set(true);
  }

  selectCategory(category: CategoryView): void {
    const isSame = this.selectedCategory()?.idDoc === category.idDoc;
    this.selectedCategory.set(isSame ? null : category);
    this.activeTab.set('info');
    this.showAddForm.set(false);
    this.showAddServiceForm.set(false);

    if (isSame) {
      this.categoryServices.set([]);
      return;
    }

    this.loadCategoryServices(category.idDoc);
  }

  setTab(tab: CategoryTab): void {
    this.activeTab.set(tab);

    if (tab === 'services' && this.selectedCategory()) {
      this.loadCategoryServices(this.selectedCategory()!.idDoc);
    }
  }

  cancelAdd(): void {
    this.editingCategoryId.set(null);
    this.showAddForm.set(false);
  }

  openAddServiceForm(): void {
    if (!this.selectedCategory()) {
      this.toastService.warning('Selecciona primero una categoria.');
      return;
    }

    const codeCustomer = this.getSessionCodeCustomer();
    if (!codeCustomer) {
      this.toastService.warning('No fue posible obtener el codeCustomer de la empresa en sesión.');
      return;
    }

    this.serviceForm.reset({
      name: '',
      prefix: '',
      codeService: '',
      codeCustomer,
      year: this.currentYearCode(),
      active: true,
    });
    this.showAddServiceForm.set(true);
  }

  cancelAddService(): void {
    this.showAddServiceForm.set(false);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    const value = this.form.getRawValue();
    const editingId = this.editingCategoryId();

    if (editingId) {
      this.categoryService
        .updateCategory(editingId, {
          name: value.name!.trim(),
          prefix: value.prefix!.trim(),
          active: value.active!,
        })
        .pipe(finalize(() => this.saving.set(false)))
        .subscribe({
          next: () => {
            this.toastService.success('Categoria actualizada correctamente.');
            this.showAddForm.set(false);
            this.editingCategoryId.set(null);
            this.loadCategories();
          },
          error: () => {
            this.toastService.error('No fue posible actualizar la categoria.');
          },
        });
      return;
    }

    this.categoryService
      .createCategory({
        name: value.name!.trim(),
        prefix: value.prefix!.trim(),
        active: value.active!,
      })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.toastService.success('Categoria creada correctamente.');
          this.showAddForm.set(false);
          this.loadCategories();
        },
        error: () => {
          this.toastService.error('No fue posible guardar la categoria.');
        },
      });
  }

  submitService(): void {
    const selectedCategory = this.selectedCategory();
    if (!selectedCategory) {
      this.toastService.warning('Selecciona una categoria válida.');
      return;
    }

    const codeCustomer = this.getSessionCodeCustomer();
    if (!codeCustomer) {
      this.toastService.warning('No fue posible obtener el codeCustomer de la empresa en sesión.');
      return;
    }

    if (this.serviceForm.invalid) {
      this.serviceForm.markAllAsTouched();
      return;
    }

    const value = this.serviceForm.getRawValue();
    const normalizedPrefix = value.prefix!.trim().toUpperCase();
    const normalizedCodeService = value.codeService!.trim();
    const normalizedName = value.name!.trim();
    const expectedYear = this.currentYearCode();

    if (!/^[A-Z0-9]{2,3}$/.test(normalizedPrefix)) {
      this.toastService.warning('El prefix del servicio debe tener 2 o 3 caracteres alfanuméricos.');
      return;
    }

    if (!/^\d{2}$/.test(normalizedCodeService)) {
      this.toastService.warning('El código de servicio debe tener exactamente 2 dígitos.');
      return;
    }

    if ((value.year || '').trim() !== expectedYear) {
      this.toastService.warning('El año del servicio debe coincidir con el año actual.');
      return;
    }

    this.serviceSaving.set(true);

    this.categoryService
      .createCategoryService(selectedCategory.idDoc, {
        name: normalizedName,
        prefix: normalizedPrefix,
        codeService: Number(normalizedCodeService),
        codeCustomer,
        year: Number(expectedYear),
        active: value.active ?? true,
      })
      .pipe(
        finalize(() => {
          this.serviceSaving.set(false);
        })
      )
      .subscribe({
        next: () => {
          this.toastService.success('Servicio agregado correctamente.');
          this.showAddServiceForm.set(false);
          this.loadCategoryServices(selectedCategory.idDoc);
          this.loadCategories();
        },
        error: (error: unknown) => {
          console.error('Error creating category service', error);
          this.toastService.error('No fue posible guardar el servicio.');
        },
      });
  }

  deleteCategory(category: nomCategory): void {
    const confirmed = window.confirm(
      `¿Deseas eliminar la categoria "${category.name}"? Esta acción no se puede deshacer.`
    );

    if (!confirmed) {
      return;
    }

    this.categoryService.deleteCategory(category.idDoc).subscribe({
      next: () => {
        this.toastService.success('Categoria eliminada correctamente.');
        if (this.editingCategoryId() === category.idDoc) {
          this.editingCategoryId.set(null);
          this.showAddForm.set(false);
        }
        if (this.selectedCategory()?.idDoc === category.idDoc) {
          this.selectedCategory.set(null);
        }
        this.loadCategories();
      },
      error: () => {
        this.toastService.error('No fue posible eliminar la categoria.');
      },
    });
  }

  isFieldInvalid(field: 'name' | 'prefix'): boolean {
    const control = this.form.get(field);
    return !!(control?.invalid && (control.dirty || control.touched));
  }

  isServiceFieldInvalid(field: 'name' | 'prefix' | 'codeService'): boolean {
    const control = this.serviceForm.get(field);
    return !!(control?.invalid && (control.dirty || control.touched));
  }

  private loadCategories(): void {
    this.loading.set(true);

    this.categoryService
      .getCategories()
      .pipe(
        switchMap((categories) => {
          if (!categories.length) {
            return of([] as CategoryView[]);
          }

          return forkJoin(
            categories.map((category) =>
              this.categoryService
                .getCategoryServicesCount(category.idDoc)
                .pipe(map((servicesCount) => ({ ...category, servicesCount })))
            )
          );
        }),
        finalize(() => this.loading.set(false))
      )
      .subscribe({
        next: (categories) => {
          this.categories.set(categories);
          const current = this.selectedCategory();
          if (current) {
            const refreshed = categories.find((item) => item.idDoc === current.idDoc) || null;
            this.selectedCategory.set(refreshed);
          }
        },
        error: () => {
          this.toastService.error('No fue posible cargar las categorias.');
        },
      });
  }

  private loadCategoryServices(categoryId: string): void {
    this.servicesLoading.set(true);

    this.categoryService
      .getCategoryServices(categoryId)
      .pipe(finalize(() => this.servicesLoading.set(false)))
      .subscribe({
        next: (services) => {
          this.categoryServices.set(services);
        },
        error: (error: unknown) => {
          console.error('Error loading category services', error);
          this.categoryServices.set([]);
          this.toastService.error('No fue posible cargar los servicios de la categoria.');
        },
      });
  }

  private loadCustomerContext(): void {
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
        })
      )
      .subscribe({
        next: (customer) => {
          this.customerContext.set(customer);
          const codeCustomer = this.getSessionCodeCustomer(customer);

          this.serviceForm.patchValue({
            codeCustomer,
            year: this.currentYearCode(),
          });
        },
        error: (error: unknown) => {
          console.error('Error loading customer context for categories', error);
          this.customerContext.set(null);
        },
      });
  }

  private getSessionCodeCustomer(customer = this.customerContext()): string {
    const rawCode = customer?.codeCustomer || customer?.code || '';
    const normalized = rawCode.trim().toUpperCase().replace(/[^A-Z]/g, '');
    return normalized.slice(0, 3);
  }
}
