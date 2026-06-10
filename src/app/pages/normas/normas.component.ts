import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';

import { NormModalComponent } from '../../components/norm-modal/norm-modal.component';
import { nomCategory, nomCategoryServices } from '../../interfaces/nomCategory.interface';
import { NormWorkflowStep } from '../../interfaces/norm-workflow-step.interface';
import { Noms } from '../../interfaces/noms.interface';
import { WorkflowStepCatalog } from '../../interfaces/workflow.interface';
import { NomCategoryService } from '../../services/nom-category.service';
import { NormWorkflowService } from '../../services/norm-workflow.service';
import { NomsService } from '../../services/noms.service';
import { ToastService } from '../../services/toast.service';
import { WorkflowService } from '../../services/workflow.service';

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
  private normWorkflowService = inject(NormWorkflowService);
  private workflowService = inject(WorkflowService);
  private toastService = inject(ToastService);
  private fb = inject(FormBuilder);

  private allNorms = signal<Noms[]>([]);
  search = signal('');
  loading = signal(true);
  showModal = signal(false);
  selectedNorm = signal<Noms | null>(null);
  deletingId = signal<string | null>(null);
  editTab = signal<'general' | 'flujo'>('general');
  saving = signal(false);
  categories = signal<nomCategory[]>([]);
  editServices = signal<nomCategoryServices[]>([]);
  loadingEditServices = signal(false);

  // Flujo
  workflowSteps = signal<NormWorkflowStep[]>([]);
  workflowCatalog = signal<WorkflowStepCatalog[]>([]);
  loadingSteps = signal(false);
  selectedStepUid = signal('');

  readonly pageSize = 10;
  currentPage = signal(1);

  editForm = this.fb.group({
    name:                   ['', [Validators.required, Validators.minLength(2)]],
    code:                   ['', [Validators.required]],
    prefix:                 ['', [Validators.required]],
    description:            [''],
    nomCategoryId:          ['', [Validators.required]],
    nomCategoryServiceId:   [''],
    active:                 [true],
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

  availableCatalog = computed(() => {
    const usedUids = new Set(this.workflowSteps().map((s) => s.stepUid));
    return this.workflowCatalog().filter((c) => !usedUids.has(c.uid) && c.active);
  });

  ngOnInit(): void {
    this.loadNorms();
    this.nomCategoryService.getCategories().subscribe({
      next: (cats) => this.categories.set(cats.filter((c) => c.active)),
    });
    this.workflowService.getWorkflows().subscribe({
      next: (wf) => this.workflowCatalog.set(wf),
    });

    this.editForm.get('nomCategoryId')?.valueChanges.subscribe((catId) => {
      this.editServices.set([]);
      this.editForm.get('nomCategoryServiceId')?.setValue('');
      if (catId) this.loadEditServices(catId);
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
    this.editTab.set('general');
    this.workflowSteps.set([]);
    this.selectedStepUid.set('');
    this.editServices.set([]);

    this.editForm.patchValue({
      name:                 norm.name,
      code:                 norm.code,
      prefix:               norm.prefix,
      description:          norm.description ?? '',
      nomCategoryId:        norm.nomCategoryId,
      nomCategoryServiceId: norm.nomCategoryServiceId ?? '',
      active:               norm.active,
    }, { emitEvent: false });

    if (norm.nomCategoryId) this.loadEditServices(norm.nomCategoryId);
  }

  private loadEditServices(categoryId: string): void {
    this.loadingEditServices.set(true);
    this.nomCategoryService.getCategoryServices(categoryId).subscribe({
      next: (svcs) => {
        this.editServices.set(svcs.filter((s) => s.active));
        this.loadingEditServices.set(false);
      },
      error: () => this.loadingEditServices.set(false),
    });
  }

  setTab(tab: 'general' | 'flujo'): void {
    this.editTab.set(tab);
    if (tab === 'flujo') this.loadSteps();
  }

  cancelEdit(): void {
    this.selectedNorm.set(null);
    this.workflowSteps.set([]);
  }

  saveEdit(): void {
    if (this.editForm.invalid) { this.editForm.markAllAsTouched(); return; }
    const norm = this.selectedNorm();
    if (!norm) return;

    this.saving.set(true);
    const v = this.editForm.getRawValue();
    const category = this.categories().find((c) => c.idDoc === v.nomCategoryId);
    const service  = this.editServices().find((s) => s.idDoc === v.nomCategoryServiceId);

    this.nomsService.updateNorm(norm.idDoc, {
      name:                   v.name!.trim(),
      code:                   v.code!.trim(),
      prefix:                 v.prefix!.trim(),
      description:            v.description?.trim() || undefined,
      nomCategoryId:          v.nomCategoryId!,
      nomCategoryName:        category?.name,
      nomCategoryServiceId:   v.nomCategoryServiceId || undefined,
      nomCategoryServiceName: service?.name,
      active:                 v.active!,
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

  addStep(): void {
    const norm = this.selectedNorm();
    const uid = this.selectedStepUid();
    if (!norm || !uid) return;

    const catalog = this.workflowCatalog().find((c) => c.uid === uid);
    if (!catalog) return;

    const nextOrder = this.workflowSteps().length + 1;

    this.normWorkflowService.addStep(norm.idDoc, {
      order:       nextOrder,
      stepUid:     catalog.uid,
      code:        catalog.code,
      name:        catalog.name,
      description: catalog.description,
      optional:    false,
    }).subscribe({
      next: () => {
        this.selectedStepUid.set('');
        this.loadSteps();
      },
      error: () => this.toastService.error('Error al agregar el paso.'),
    });
  }

  removeStep(step: NormWorkflowStep): void {
    const norm = this.selectedNorm();
    if (!norm) return;

    this.normWorkflowService.removeStep(norm.idDoc, step.idDoc).subscribe({
      next: () => {
        const remaining = this.workflowSteps()
          .filter((s) => s.idDoc !== step.idDoc)
          .map((s, i) => ({ ...s, order: i + 1 }));

        if (remaining.length > 0) {
          this.normWorkflowService.updateOrder(norm.idDoc, remaining).subscribe({
            next: () => this.loadSteps(),
          });
        } else {
          this.workflowSteps.set([]);
        }
      },
      error: () => this.toastService.error('Error al eliminar el paso.'),
    });
  }

  moveUp(index: number): void {
    if (index === 0) return;
    const steps = [...this.workflowSteps()];
    [steps[index - 1], steps[index]] = [steps[index], steps[index - 1]];
    this.saveOrder(steps);
  }

  moveDown(index: number): void {
    const steps = [...this.workflowSteps()];
    if (index === steps.length - 1) return;
    [steps[index], steps[index + 1]] = [steps[index + 1], steps[index]];
    this.saveOrder(steps);
  }

  toggleOptional(step: NormWorkflowStep): void {
    const norm = this.selectedNorm();
    if (!norm) return;
    const newValue = !step.optional;
    this.workflowSteps.update((steps) =>
      steps.map((s) => s.idDoc === step.idDoc ? { ...s, optional: newValue } : s)
    );
    this.normWorkflowService.toggleOptional(norm.idDoc, step.idDoc, newValue).subscribe({
      error: () => {
        this.toastService.error('Error al actualizar el paso.');
        this.workflowSteps.update((steps) =>
          steps.map((s) => s.idDoc === step.idDoc ? { ...s, optional: !newValue } : s)
        );
      },
    });
  }

  private saveOrder(steps: NormWorkflowStep[]): void {
    const norm = this.selectedNorm();
    if (!norm) return;
    const reordered = steps.map((s, i) => ({ ...s, order: i + 1 }));
    this.workflowSteps.set(reordered);
    this.normWorkflowService.updateOrder(norm.idDoc, reordered).subscribe({
      error: () => this.toastService.error('Error al reordenar los pasos.'),
    });
  }

  private loadSteps(): void {
    const norm = this.selectedNorm();
    if (!norm) return;
    this.loadingSteps.set(true);
    this.normWorkflowService.getSteps(norm.idDoc).subscribe({
      next: (steps) => { this.workflowSteps.set(steps); this.loadingSteps.set(false); },
      error: () => this.loadingSteps.set(false),
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
