import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { nomCategory, nomCategoryServices } from '../../interfaces/nomCategory.interface';
import { Noms } from '../../interfaces/noms.interface';
import { NomCategoryService } from '../../services/nom-category.service';
import { NomsService } from '../../services/noms.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-norm-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './norm-modal.component.html',
  styleUrl: './norm-modal.component.scss',
})
export class NormModalComponent implements OnInit {
  @Input() norm: Noms | null = null;
  @Output() closed = new EventEmitter<boolean>();

  private fb = inject(FormBuilder);
  private nomsService = inject(NomsService);
  private nomCategoryService = inject(NomCategoryService);
  private toastService = inject(ToastService);

  categories = signal<nomCategory[]>([]);
  services = signal<nomCategoryServices[]>([]);
  loadingCategories = signal(true);
  loadingServices = signal(false);
  saving = signal(false);

  get isEdit(): boolean { return !!this.norm; }

  form = this.fb.group({
    name:                   ['', [Validators.required, Validators.minLength(2)]],
    code:                   ['', [Validators.required]],
    prefix:                 ['', [Validators.required]],
    description:            [''],
    nomCategoryId:          ['', [Validators.required]],
    nomCategoryServiceId:   ['', [Validators.required]],
    active:                 [true],
  });

  ngOnInit(): void {
    if (this.norm) {
      this.form.patchValue({
        name:                 this.norm.name,
        code:                 this.norm.code,
        prefix:               this.norm.prefix,
        description:          this.norm.description ?? '',
        nomCategoryId:        this.norm.nomCategoryId,
        nomCategoryServiceId: this.norm.nomCategoryServiceId ?? '',
        active:               this.norm.active,
      });
    }

    this.nomCategoryService.getCategories().subscribe({
      next: (cats) => {
        this.categories.set(cats.filter((c) => c.active));
        this.loadingCategories.set(false);
        const catId = this.form.get('nomCategoryId')?.value;
        if (catId) this.loadServices(catId);
      },
      error: () => this.loadingCategories.set(false),
    });

    this.form.get('nomCategoryId')?.valueChanges.subscribe((catId) => {
      this.services.set([]);
      this.form.get('nomCategoryServiceId')?.setValue('');
      if (catId) this.loadServices(catId);
    });
  }

  private loadServices(categoryId: string): void {
    this.loadingServices.set(true);
    this.nomCategoryService.getCategoryServices(categoryId).subscribe({
      next: (svcs) => {
        this.services.set(svcs.filter((s) => s.active));
        this.loadingServices.set(false);
      },
      error: () => this.loadingServices.set(false),
    });
  }

  isFieldInvalid(field: string): boolean {
    const c = this.form.get(field);
    return !!(c?.invalid && (c.dirty || c.touched));
  }

  submit(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }

    this.saving.set(true);
    const v = this.form.getRawValue();
    const category = this.categories().find((c) => c.idDoc === v.nomCategoryId);
    const service  = this.services().find((s) => s.idDoc === v.nomCategoryServiceId);

    const data = {
      name:                   v.name!.trim(),
      code:                   v.code!.trim(),
      prefix:                 v.prefix!.trim(),
      description:            v.description?.trim() || undefined,
      nomCategoryId:          v.nomCategoryId!,
      nomCategoryName:        category?.name,
      nomCategoryServiceId:   v.nomCategoryServiceId!,
      nomCategoryServiceName: service?.name,
      active:                 v.active!,
    };

    const op$ = this.isEdit
      ? this.nomsService.updateNorm(this.norm!.idDoc, { ...data, updatedAt: undefined })
      : this.nomsService.createNorm(data);

    op$.subscribe({
      next: () => {
        this.toastService.success(this.isEdit ? 'Norma actualizada.' : 'Norma creada correctamente.');
        this.closed.emit(true);
      },
      error: () => {
        this.toastService.error('Error al guardar la norma.');
        this.saving.set(false);
      },
    });
  }

  cancel(): void { this.closed.emit(false); }
}
