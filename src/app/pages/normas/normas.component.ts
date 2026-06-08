import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';

import { NormModalComponent } from '../../components/norm-modal/norm-modal.component';
import { nomCategory } from '../../interfaces/nomCategory.interface';
import { Noms } from '../../interfaces/noms.interface';
import { NomCategoryService } from '../../services/nom-category.service';
import { NomsService } from '../../services/noms.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-normas',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, NormModalComponent],
  templateUrl: './normas.component.html',
  styleUrl: './normas.component.scss',
})
export class NormasComponent implements OnInit {
  private nomsService = inject(NomsService);
  private nomCategoryService = inject(NomCategoryService);
  private toastService = inject(ToastService);
  private fb = inject(FormBuilder);

  private allNorms = signal<Noms[]>([]);
  search = signal('');
  loading = signal(true);
  showModal = signal(false);
  selectedNorm = signal<Noms | null>(null);
  deletingId = signal<string | null>(null);
  saving = signal(false);
  categories = signal<nomCategory[]>([]);

  readonly pageSize = 10;
  currentPage = signal(1);

  editForm = this.fb.group({
    name:          ['', [Validators.required, Validators.minLength(2)]],
    code:          ['', [Validators.required]],
    prefix:        ['', [Validators.required]],
    description:   [''],
    nomCategoryId: ['', [Validators.required]],
    active:        [true],
  });

  filteredNorms = computed(() => {
    const term = this.search().toLowerCase().trim();
    if (!term) return this.allNorms();
    return this.allNorms().filter(
      (n) =>
        n.name?.toLowerCase().includes(term) ||
        n.code?.toLowerCase().includes(term) ||
        n.nomCategoryName?.toLowerCase().includes(term)
    );
  });

  totalPages = computed(() => Math.max(1, Math.ceil(this.filteredNorms().length / this.pageSize)));

  pagedNorms = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.filteredNorms().slice(start, start + this.pageSize);
  });

  ngOnInit(): void {
    this.loadNorms();
    this.nomCategoryService.getCategories().subscribe({
      next: (cats) => this.categories.set(cats.filter((c) => c.active)),
    });
  }

  onSearch(value: string): void {
    this.search.set(value);
    this.currentPage.set(1);
  }

  prevPage(): void { this.currentPage.update((p) => Math.max(1, p - 1)); }
  nextPage(): void { this.currentPage.update((p) => Math.min(this.totalPages(), p + 1)); }

  openCreate(): void { this.showModal.set(true); }

  onModalClosed(saved: boolean): void {
    this.showModal.set(false);
    if (saved) this.loadNorms();
  }

  selectNorm(norm: Noms): void {
    const isSame = this.selectedNorm()?.idDoc === norm.idDoc;
    if (isSame) { this.selectedNorm.set(null); return; }
    this.selectedNorm.set(norm);
    this.editForm.patchValue({
      name:          norm.name,
      code:          norm.code,
      prefix:        norm.prefix,
      description:   norm.description ?? '',
      nomCategoryId: norm.nomCategoryId,
      active:        norm.active,
    });
  }

  cancelEdit(): void { this.selectedNorm.set(null); }

  saveEdit(): void {
    if (this.editForm.invalid) { this.editForm.markAllAsTouched(); return; }
    const norm = this.selectedNorm();
    if (!norm) return;

    this.saving.set(true);
    const v = this.editForm.getRawValue();
    const category = this.categories().find((c) => c.idDoc === v.nomCategoryId);

    this.nomsService.updateNorm(norm.idDoc, {
      name:            v.name!.trim(),
      code:            v.code!.trim(),
      prefix:          v.prefix!.trim(),
      description:     v.description?.trim() || undefined,
      nomCategoryId:   v.nomCategoryId!,
      nomCategoryName: category?.name,
      active:          v.active!,
    }).subscribe({
      next: () => {
        this.toastService.success('Norma actualizada.');
        this.saving.set(false);
        this.selectedNorm.set(null);
        this.loadNorms();
      },
      error: () => {
        this.toastService.error('Error al actualizar la norma.');
        this.saving.set(false);
      },
    });
  }

  isFieldInvalid(field: string): boolean {
    const c = this.editForm.get(field);
    return !!(c?.invalid && (c.dirty || c.touched));
  }

  delete(norm: Noms, event: Event): void {
    event.stopPropagation();
    if (this.deletingId()) return;
    this.deletingId.set(norm.idDoc);

    this.nomsService.deleteNorm(norm.idDoc).subscribe({
      next: () => {
        this.toastService.success('Norma eliminada.');
        this.deletingId.set(null);
        if (this.selectedNorm()?.idDoc === norm.idDoc) this.selectedNorm.set(null);
        this.loadNorms();
      },
      error: () => {
        this.toastService.error('Error al eliminar la norma.');
        this.deletingId.set(null);
      },
    });
  }

  private loadNorms(): void {
    this.loading.set(true);
    this.nomsService.getNorms().subscribe({
      next: (norms) => { this.allNorms.set(norms); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }
}
