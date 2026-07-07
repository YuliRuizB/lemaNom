import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';

import { WorkflowStepCatalog } from '../../interfaces/workflow.interface';
import { WorkflowService } from '../../services/workflow.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-workflows',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './workflows.component.html',
  styleUrl: './workflows.component.scss',
})
export class WorkflowsComponent {
  private workflowService = inject(WorkflowService);
  private toastService = inject(ToastService);
  private fb = inject(FormBuilder);

  private allWorkflows = signal<WorkflowStepCatalog[]>([]);
  search = signal('');
  loading = signal(true);
  showModal = signal(false);
  saving = signal(false);
  editingWorkflowUid = signal<string | null>(null);

  readonly pageSize = 10;
  currentPage = signal(1);

  form = this.fb.group({
    code:        ['', [Validators.required]],
    name:        ['', [Validators.required, Validators.minLength(2)]],
    description: [''],
    active:      [true],
  });

  filteredWorkflows = computed(() => {
    const term = this.search().toLowerCase().trim();
    if (!term) return this.allWorkflows();
    return this.allWorkflows().filter(
      (w) =>
        w.code?.toLowerCase().includes(term) ||
        w.name?.toLowerCase().includes(term) ||
        w.description?.toLowerCase().includes(term)
    );
  });

  totalPages = computed(() => Math.max(1, Math.ceil(this.filteredWorkflows().length / this.pageSize)));

  pagedWorkflows = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.filteredWorkflows().slice(start, start + this.pageSize);
  });

  constructor() { this.load(); }

  onSearch(value: string): void { this.search.set(value); this.currentPage.set(1); }
  prevPage(): void { this.currentPage.update((p) => Math.max(1, p - 1)); }
  nextPage(): void { this.currentPage.update((p) => Math.min(this.totalPages(), p + 1)); }

  openModal(): void {
    this.form.reset({ active: true });
    this.editingWorkflowUid.set(null);
    this.showModal.set(true);
  }

  openEditModal(workflow: WorkflowStepCatalog): void {
    this.form.reset({
      code: workflow.code,
      name: workflow.name,
      description: workflow.description || '',
      active: workflow.active,
    });
    this.editingWorkflowUid.set(workflow.uid);
    this.showModal.set(true);
  }

  cancelModal(): void {
    this.showModal.set(false);
    this.editingWorkflowUid.set(null);
  }

  isFieldInvalid(field: string): boolean {
    const c = this.form.get(field);
    return !!(c?.invalid && (c.dirty || c.touched));
  }

  submit(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    const v = this.form.getRawValue();
    const editingUid = this.editingWorkflowUid();
    const payload = {
      code:        v.code!.trim(),
      name:        v.name!.trim(),
      description: v.description?.trim() || undefined,
      active:      v.active!,
    } as Omit<WorkflowStepCatalog, 'uid'>;

    const request$ = editingUid
      ? this.workflowService.updateWorkflow(editingUid, payload)
      : this.workflowService.createWorkflow(payload);

    request$.subscribe({
      next: () => {
        this.toastService.success(editingUid ? 'Flujo actualizado correctamente.' : 'Flujo creado correctamente.');
        this.showModal.set(false);
        this.editingWorkflowUid.set(null);
        this.saving.set(false);
        this.load();
      },
      error: () => {
        this.toastService.error(editingUid ? 'Error al actualizar el flujo.' : 'Error al crear el flujo.');
        this.saving.set(false);
      },
    });
  }

  private load(): void {
    this.loading.set(true);
    this.workflowService.getWorkflows().subscribe({
      next: (items) => { this.allWorkflows.set(items); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }
}
