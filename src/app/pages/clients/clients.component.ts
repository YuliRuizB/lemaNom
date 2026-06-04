import { CommonModule, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';

import { PlantModalComponent } from '../../components/plant-modal/plant-modal.component';
import { Client } from '../../interfaces/client.interface';
import { ClientService } from '../../services/client.service';
import { ToastService } from '../../services/toast.service';

type DetailTab = 'info' | 'plants';

@Component({
  selector: 'app-clients',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule, ReactiveFormsModule, PlantModalComponent],
  templateUrl: './clients.component.html',
  styleUrl: './clients.component.scss',
})
export class ClientsComponent {
  private clientService = inject(ClientService);
  private toastService = inject(ToastService);
  private fb = inject(FormBuilder);

  allClients = signal<Client[]>([]);
  search = signal('');
  loading = signal(true);
  saving = signal(false);
  showAddForm = signal(false);
  showPlantModal = signal(false);
  selectedClient = signal<Client | null>(null);
  activeTab = signal<DetailTab>('info');
  expandedPlantId = signal<string | null>(null);

  readonly pageSize = 10;
  currentPage = signal(1);

  addForm = this.fb.group({
    name:      ['', [Validators.required, Validators.minLength(2)]],
    legalName: ['', [Validators.required, Validators.minLength(2)]],
    rfc:       [''],
    email:     ['', [Validators.email]],
    phone:     [''],
    active:    [true],
  });

  filteredClients = computed(() => {
    const term = this.search().toLowerCase().trim();
    if (!term) return this.allClients();
    return this.allClients().filter(
      (c) =>
        c.name?.toLowerCase().includes(term) ||
        c.legalName?.toLowerCase().includes(term) ||
        c.rfc?.toLowerCase().includes(term) ||
        c.email?.toLowerCase().includes(term)
    );
  });

  totalPages = computed(() => Math.max(1, Math.ceil(this.filteredClients().length / this.pageSize)));

  pagedClients = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.filteredClients().slice(start, start + this.pageSize);
  });

  constructor() {
    this.loadClients();
  }

  onSearch(value: string): void {
    this.search.set(value);
    this.currentPage.set(1);
  }

  prevPage(): void { this.currentPage.update((p) => Math.max(1, p - 1)); }
  nextPage(): void { this.currentPage.update((p) => Math.min(this.totalPages(), p + 1)); }

  openAddForm(): void {
    this.addForm.reset({ active: true });
    this.selectedClient.set(null);
    this.showAddForm.set(true);
  }

  cancelAdd(): void {
    this.showAddForm.set(false);
  }

  submitAdd(): void {
    if (this.addForm.invalid) { this.addForm.markAllAsTouched(); return; }

    this.saving.set(true);
    const v = this.addForm.getRawValue();

    this.clientService.createClient({
      name:      v.name!.trim(),
      legalName: v.legalName!.trim(),
      rfc:       v.rfc?.trim()   || undefined,
      email:     v.email?.trim() || undefined,
      phone:     v.phone?.trim() || undefined,
      active:    v.active!,
    }).subscribe({
      next: () => {
        this.toastService.success('Cliente creado correctamente.');
        this.showAddForm.set(false);
        this.saving.set(false);
        this.loadClients();
      },
      error: () => {
        this.toastService.error('Error al crear el cliente.');
        this.saving.set(false);
      },
    });
  }

  isFieldInvalid(field: string): boolean {
    const c = this.addForm.get(field);
    return !!(c?.invalid && (c.dirty || c.touched));
  }

  selectClient(client: Client): void {
    const isSame = this.selectedClient()?.idDoc === client.idDoc;
    this.selectedClient.set(isSame ? null : client);
    this.showAddForm.set(false);
    this.activeTab.set('info');
    this.expandedPlantId.set(null);
  }

  setTab(tab: DetailTab): void {
    this.activeTab.set(tab);
    this.expandedPlantId.set(null);
  }

  openPlantModal(): void { this.showPlantModal.set(true); }

  onPlantModalClosed(saved: boolean): void {
    this.showPlantModal.set(false);
    if (saved) this.loadClients();
  }

  togglePlant(plantId: string): void {
    this.expandedPlantId.set(
      this.expandedPlantId() === plantId ? null : plantId
    );
  }

  private loadClients(): void {
    this.loading.set(true);
    this.clientService.getClients().subscribe({
      next: (clients) => {
        this.allClients.set(clients);
        this.loading.set(false);
        const current = this.selectedClient();
        if (current) {
          const refreshed = clients.find((c) => c.idDoc === current.idDoc);
          if (refreshed) this.selectedClient.set(refreshed);
        }
      },
      error: () => this.loading.set(false),
    });
  }
}
