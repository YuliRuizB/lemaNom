import { CommonModule, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize, of, switchMap, take } from 'rxjs';

import { PlantModalComponent } from '../../components/plant-modal/plant-modal.component';
import { Client, ClientPlant, Witness } from '../../interfaces/client.interface';
import { User } from '../../interfaces/user.interface';
import { AuthService } from '../../services/auth.service';
import { ClientService } from '../../services/client.service';
import { ToastService } from '../../services/toast.service';
import { UserService } from '../../services/user.service';

type DetailTab = 'info' | 'plants' | 'witnesses';
type ClientView = Client & { plants?: ClientPlant[]; witnesses?: Witness[] };

@Component({
  selector: 'app-clients',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule, ReactiveFormsModule, PlantModalComponent],
  templateUrl: './clients.component.html',
  styleUrl: './clients.component.scss',
})
export class ClientsComponent {
  private authService = inject(AuthService);
  private clientService = inject(ClientService);
  private toastService = inject(ToastService);
  private userService = inject(UserService);
  private fb = inject(FormBuilder);

  allClients = signal<ClientView[]>([]);
  currentAppUser = signal<User | null>(null);
  search = signal('');
  loading = signal(true);
  saving = signal(false);
  deleting = signal(false);
  showAddForm = signal(false);
  showPlantModal = signal(false);
  showWitnessForm = signal(false);
  selectedClient = signal<ClientView | null>(null);
  editingClientId = signal<string | null>(null);
  activeTab = signal<DetailTab>('info');
  expandedPlantId = signal<string | null>(null);
  selectedWitnessId = signal<string | null>(null);
  selectedImageFile = signal<File | null>(null);
  selectedImageName = signal('');
  previewImageUrl = signal('');
  previewImageTitle = signal('');

  readonly pageSize = 10;
  currentPage = signal(1);

  addForm = this.fb.group({
    clientNumber: ['', [Validators.required, Validators.minLength(1)]],
    name:      ['', [Validators.required, Validators.minLength(2)]],
    legalName: ['', [Validators.required, Validators.minLength(2)]],
    rfc:       [''],
    email:     ['', [Validators.email]],
    phone:     [''],
    active:    [true],
  });

  witnessForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    lastName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    phone: [''],
    active: [true],
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
    this.loadCurrentUser();
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
    this.editingClientId.set(null);
    this.selectedImageFile.set(null);
    this.selectedImageName.set('');
    this.showAddForm.set(true);
  }

  openEditForm(client: Client): void {
    this.editingClientId.set(client.idDoc);
    this.selectedImageFile.set(null);
    this.selectedImageName.set('');
    this.addForm.reset({
      clientNumber: client.clientNumber || '',
      name: client.name || '',
      legalName: client.legalName || '',
      rfc: client.rfc || '',
      email: client.email || '',
      phone: client.phone || '',
      active: client.active,
    });
    this.showAddForm.set(true);
  }

  cancelAdd(): void {
    this.editingClientId.set(null);
    this.selectedImageFile.set(null);
    this.selectedImageName.set('');
    this.showAddForm.set(false);
  }

  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    if (!file) {
      this.selectedImageFile.set(null);
      this.selectedImageName.set('');
      return;
    }

    if (!file.type.startsWith('image/')) {
      this.toastService.warning('Selecciona un archivo de imagen válido.');
      input.value = '';
      this.selectedImageFile.set(null);
      this.selectedImageName.set('');
      return;
    }

    this.selectedImageFile.set(file);
    this.selectedImageName.set(file.name);
  }

  submitAdd(): void {
    if (this.addForm.invalid) { this.addForm.markAllAsTouched(); return; }

    this.saving.set(true);
    const v = this.addForm.getRawValue();
    const selectedImage = this.selectedImageFile();
    const editingId = this.editingClientId();

    if (editingId) {
      const updatePayload: Partial<Client> = {
        clientNumber: v.clientNumber!.trim(),
        name: v.name!.trim(),
        legalName: v.legalName!.trim(),
        rfc: v.rfc?.trim() || undefined,
        email: v.email?.trim() || undefined,
        phone: v.phone?.trim() || undefined,
        active: v.active!,
      };

      this.clientService
        .updateClient(editingId, updatePayload)
        .pipe(
          switchMap(() => {
            if (!selectedImage) {
              return of(null);
            }

            return this.clientService.uploadClientImage(editingId, selectedImage).pipe(
              switchMap((downloadUrl) =>
                this.clientService
                  .updateClient(editingId, { imageurl: downloadUrl })
                  .pipe(switchMap(() => of(downloadUrl)))
              )
            );
          }),
          finalize(() => this.saving.set(false))
        )
        .subscribe({
          next: (downloadUrl) => {
            this.toastService.success('Cliente actualizado correctamente.');
            this.selectedImageFile.set(null);
            this.selectedImageName.set('');
            this.showAddForm.set(false);
            this.editingClientId.set(null);
            const current = this.selectedClient();
            if (current?.idDoc === editingId) {
              this.selectedClient.set({
                ...current,
                ...updatePayload,
                imageurl: downloadUrl || current.imageurl,
              } as Client);
            }
            this.loadClients();
          },
          error: () => {
            this.toastService.error('Error al actualizar el cliente.');
          },
        });
      return;
    }

    this.clientService.createClient({
      customerId: this.currentAppUser()?.customerId,
      customerName: this.currentAppUser()?.customerName,
      clientNumber: v.clientNumber!.trim(),
      name:      v.name!.trim(),
      legalName: v.legalName!.trim(),
      rfc:       v.rfc?.trim()   || undefined,
      email:     v.email?.trim() || undefined,
      phone:     v.phone?.trim() || undefined,
      active:    v.active!,
    }).pipe(
      switchMap((clientId) => {
        if (!selectedImage) {
          return of(clientId);
        }

        return this.clientService.uploadClientImage(clientId, selectedImage).pipe(
          switchMap((downloadUrl) =>
            this.clientService
              .updateClient(clientId, { imageurl: downloadUrl })
              .pipe(switchMap(() => of(clientId)))
          )
        );
      }),
      finalize(() => this.saving.set(false))
    ).subscribe({
      next: () => {
        this.toastService.success('Cliente creado correctamente.');
        this.selectedImageFile.set(null);
        this.selectedImageName.set('');
        this.showAddForm.set(false);
        this.loadClients();
      },
      error: () => {
        this.toastService.error('Error al crear el cliente.');
      },
    });
  }

  isFieldInvalid(field: string): boolean {
    const c = this.addForm.get(field);
    return !!(c?.invalid && (c.dirty || c.touched));
  }

  isWitnessFieldInvalid(field: string): boolean {
    const c = this.witnessForm.get(field);
    return !!(c?.invalid && (c.dirty || c.touched));
  }

  selectClient(client: ClientView): void {
    const isSame = this.selectedClient()?.idDoc === client.idDoc;
    this.selectedClient.set(isSame ? null : client);
    this.showAddForm.set(false);
    this.activeTab.set('info');
    this.expandedPlantId.set(null);
    this.selectedWitnessId.set(null);
  }

  setTab(tab: DetailTab): void {
    this.activeTab.set(tab);
    this.expandedPlantId.set(null);
    this.selectedWitnessId.set(null);
  }

  openPlantModal(): void { this.showPlantModal.set(true); }

  openWitnessForm(): void {
    this.witnessForm.reset({ active: true });
    this.showWitnessForm.set(true);
  }

  cancelWitnessForm(): void {
    this.showWitnessForm.set(false);
  }

  selectWitness(witnessId: string): void {
    this.selectedWitnessId.set(this.selectedWitnessId() === witnessId ? null : witnessId);
  }

  onPlantModalClosed(saved: boolean): void {
    this.showPlantModal.set(false);
    if (saved) this.loadClients();
  }

  togglePlant(plantId: string): void {
    this.expandedPlantId.set(
      this.expandedPlantId() === plantId ? null : plantId
    );
  }

  openImagePreview(client: Client): void {
    if (!client.imageurl) {
      return;
    }

    this.previewImageUrl.set(client.imageurl);
    this.previewImageTitle.set(client.name);
  }

  closeImagePreview(): void {
    this.previewImageUrl.set('');
    this.previewImageTitle.set('');
  }

  deleteClient(client: Client): void {
    const confirmed = window.confirm(
      `¿Deseas eliminar el cliente "${client.name}"? Esta acción no se puede deshacer.`
    );

    if (!confirmed) {
      return;
    }

    this.deleting.set(true);

    this.clientService
      .deleteClient(client.idDoc)
      .pipe(finalize(() => this.deleting.set(false)))
      .subscribe({
        next: () => {
          this.toastService.success('Cliente eliminado correctamente.');
          this.selectedClient.set(null);
          this.showAddForm.set(false);
          this.editingClientId.set(null);
          this.loadClients();
        },
        error: () => {
          this.toastService.error('No fue posible eliminar el cliente.');
        },
      });
  }

  submitWitness(client: ClientView): void {
    if (this.witnessForm.invalid) {
      this.witnessForm.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    const v = this.witnessForm.getRawValue();

    this.clientService
      .addWitness(client.idDoc, {
        name: v.name!.trim(),
        lastName: v.lastName!.trim(),
        email: v.email!.trim(),
        phone: v.phone?.trim() || undefined,
        active: v.active!,
      })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.toastService.success('Testigo agregado correctamente.');
          this.showWitnessForm.set(false);
          this.loadClients();
        },
        error: () => {
          this.toastService.error('No fue posible agregar el testigo.');
        },
      });
  }

  removePlant(client: ClientView, plant: ClientPlant): void {
    const confirmed = window.confirm(
      `¿Deseas eliminar la planta "${plant.name}"? Esta acción no se puede deshacer.`
    );

    if (!confirmed) {
      return;
    }

    this.deleting.set(true);

    this.clientService
      .deletePlant(client.idDoc, plant.idDoc)
      .pipe(finalize(() => this.deleting.set(false)))
      .subscribe({
        next: () => {
          this.toastService.success('Planta eliminada correctamente.');
          this.expandedPlantId.set(null);
          this.loadClients();
        },
        error: () => {
          this.toastService.error('No fue posible eliminar la planta.');
        },
      });
  }

  removeWitness(client: ClientView, witness: Witness): void {
    const confirmed = window.confirm(
      `¿Deseas eliminar al testigo "${witness.name} ${witness.lastName}"? Esta acción no se puede deshacer.`
    );

    if (!confirmed) {
      return;
    }

    this.deleting.set(true);

    this.clientService
      .deleteWitness(client.idDoc, witness.idDoc)
      .pipe(finalize(() => this.deleting.set(false)))
      .subscribe({
        next: () => {
          this.toastService.success('Testigo eliminado correctamente.');
          this.loadClients();
        },
        error: () => {
          this.toastService.error('No fue posible eliminar el testigo.');
        },
      });
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

  private loadCurrentUser(): void {
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
        this.currentAppUser.set(user);
      });
  }
}
