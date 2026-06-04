import { CommonModule, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';

import { RoleEditModalComponent } from '../../components/role-edit-modal/role-edit-modal.component';
import { RoleModalComponent } from '../../components/role-modal/role-modal.component';
import { Role } from '../../interfaces/role.interface';
import { RoleService } from '../../services/role.service';

@Component({
  selector: 'app-role',
  standalone: true,
  imports: [CommonModule, DatePipe, RoleModalComponent, RoleEditModalComponent],
  templateUrl: './role.component.html',
  styleUrl: './role.component.scss',
})
export class RoleComponent {
  private roleService = inject(RoleService);

  allRoles = signal<Role[]>([]);
  loading = signal(true);
  showModal = signal(false);
  selectedRole = signal<Role | null>(null);

  readonly pageSize = 10;
  currentPage = signal(1);

  totalPages = computed(() => Math.max(1, Math.ceil(this.allRoles().length / this.pageSize)));

  pagedRoles = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.allRoles().slice(start, start + this.pageSize);
  });

  constructor() {
    this.loadRoles();
  }

  prevPage(): void { this.currentPage.update((p) => Math.max(1, p - 1)); }
  nextPage(): void { this.currentPage.update((p) => Math.min(this.totalPages(), p + 1)); }

  openModal(): void {
    this.showModal.set(true);
  }

  onModalClosed(role: Role | null): void {
    this.showModal.set(false);
    if (role) this.reload();
  }

  selectRole(role: Role): void {
    this.selectedRole.set(role);
  }

  onEditClosed(changed: boolean): void {
    this.selectedRole.set(null);
    if (changed) this.reload();
  }

  private reload(): void {
    this.currentPage.set(1);
    this.loadRoles();
  }

  private loadRoles(): void {
    this.loading.set(true);
    this.roleService.getRoles().subscribe({
      next: (roles) => {
        this.allRoles.set(roles);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
