import { CommonModule, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { switchMap } from 'rxjs';

import { EquipmentModalComponent } from '../../components/equipment-modal/equipment-modal.component';
import { ToastService } from '../../services/toast.service';
import { equipment } from '../../interfaces/meditionType.interface';
import { EquipmentService } from '../../services/equipment.service';

@Component({
  selector: 'app-equipo-medicion',
  standalone: true,
  imports: [CommonModule, DatePipe, ReactiveFormsModule, FormsModule, EquipmentModalComponent],
  templateUrl: './equipo-medicion.component.html',
  styleUrl: './equipo-medicion.component.scss',
})
export class EquipoMedicionComponent {
  private equipmentService = inject(EquipmentService);
  private toastService = inject(ToastService);
  private fb = inject(FormBuilder);

  private allEquipments = signal<equipment[]>([]);
  search = signal('');
  loading = signal(true);
  showModal = signal(false);
  selectedEquipment = signal<equipment | null>(null);
  uploading = signal(false);
  editMode = signal(false);
  saving = signal(false);

  editForm = this.fb.group({
    name:       ['', [Validators.required, Validators.minLength(2)]],
    identifier: ['', [Validators.required]],
    ns:         ['', [Validators.required]],
    brand:      [''],
    model:      [''],
    range:      [''],
    active:     [true],
  });

  readonly pageSize = 5;
  currentPage = signal(1);

  filteredEquipments = computed(() => {
    const term = this.search().toLowerCase().trim();
    if (!term) return this.allEquipments();
    return this.allEquipments().filter(
      (e) =>
        e.name?.toLowerCase().includes(term) ||
        e.identifier?.toLowerCase().includes(term) ||
        e.brand?.toLowerCase().includes(term) ||
        e.model?.toLowerCase().includes(term) ||
        e.ns?.toLowerCase().includes(term)
    );
  });

  totalPages = computed(() => Math.max(1, Math.ceil(this.filteredEquipments().length / this.pageSize)));

  pagedEquipments = computed(() => {
    const page = this.currentPage();
    const start = (page - 1) * this.pageSize;
    return this.filteredEquipments().slice(start, start + this.pageSize);
  });

  constructor() {
    this.loadEquipments();
  }

  onSearch(value: string): void {
    this.search.set(value);
    this.currentPage.set(1);
  }

  selectEquipment(item: equipment): void {
    const isSame = this.selectedEquipment()?.idDoc === item.idDoc;
    this.selectedEquipment.set(isSame ? null : item);
    this.editMode.set(false);
  }

  startEdit(): void {
    const eq = this.selectedEquipment();
    if (!eq) return;
    this.editForm.patchValue({
      name:       eq.name,
      identifier: eq.identifier,
      ns:         eq.ns,
      brand:      eq.brand ?? '',
      model:      eq.model ?? '',
      range:      eq.range ?? '',
      active:     eq.active,
    });
    this.editMode.set(true);
  }

  cancelEdit(): void {
    this.editMode.set(false);
  }

  saveEdit(): void {
    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }
    const eq = this.selectedEquipment();
    if (!eq) return;

    this.saving.set(true);
    const v = this.editForm.getRawValue();

    this.equipmentService.updateEquipment(eq.idDoc, {
      name:       v.name!.trim(),
      identifier: v.identifier!.trim(),
      ns:         v.ns!.trim(),
      brand:      v.brand?.trim() ?? '',
      model:      v.model?.trim() ?? '',
      range:      v.range?.trim() ?? '',
      active:     v.active!,
    }).subscribe({
      next: () => {
        const updated: equipment = {
          ...eq,
          name:       v.name!.trim(),
          identifier: v.identifier!.trim(),
          ns:         v.ns!.trim(),
          brand:      v.brand?.trim() || undefined,
          model:      v.model?.trim() || undefined,
          range:      v.range?.trim() || undefined,
          active:     v.active!,
          updatedAt:  new Date(),
        };
        this.selectedEquipment.set(updated);
        this.allEquipments.update((items) =>
          items.map((i) => i.idDoc === eq.idDoc ? updated : i)
        );
        this.toastService.success('Equipo actualizado correctamente.');
        this.editMode.set(false);
        this.saving.set(false);
      },
      error: () => {
        this.toastService.error('Error al actualizar el equipo.');
        this.saving.set(false);
      },
    });
  }

  prevPage(): void {
    this.currentPage.update((p) => Math.max(1, p - 1));
  }

  nextPage(): void {
    this.currentPage.update((p) => Math.min(this.totalPages(), p + 1));
  }

  openModal(): void {
    this.showModal.set(true);
  }

  onModalClosed(saved: boolean): void {
    this.showModal.set(false);
    if (saved) this.loadEquipments();
  }

  onCertificateSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    const eq = this.selectedEquipment();
    if (!file || !eq) return;

    this.uploading.set(true);

    this.equipmentService.uploadCertificate(eq.idDoc, file).pipe(
      switchMap((url) => this.equipmentService.updateCertificateUrl(eq.idDoc, url).pipe(
        switchMap(() => {
          this.selectedEquipment.set({ ...eq, certificateUrl: url });
          this.allEquipments.update((items) =>
            items.map((i) => i.idDoc === eq.idDoc ? { ...i, certificateUrl: url } : i)
          );
          return [];
        })
      ))
    ).subscribe({
      next: () => {},
      error: () => {
        this.toastService.error('Error al subir el certificado.');
        this.uploading.set(false);
      },
      complete: () => {
        this.toastService.success('Certificado subido correctamente.');
        this.uploading.set(false);
        (event.target as HTMLInputElement).value = '';
      },
    });
  }

  private loadEquipments(): void {
    this.loading.set(true);
    this.equipmentService.getEquipments().subscribe({
      next: (items) => {
        this.allEquipments.set(items);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
