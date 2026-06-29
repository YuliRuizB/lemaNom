import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { take } from 'rxjs';

import { UserRoleModalComponent } from '../../components/user-role-modal/user-role-modal.component';
import { User } from '../../interfaces/user.interface';
import { AuthService } from '../../services/auth.service';
import { UserService } from '../../services/user.service';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, FormsModule, UserRoleModalComponent],
  templateUrl: './users.component.html',
  styleUrl: './users.component.scss',
})
export class UsersComponent {
  private readonly superAdminRoleId = 'NPsdyKHT4qpRnRULhC7R';
  private readonly adminRoleId = 'eu2exXbWiN5RuD2XcXuU';
  private authService = inject(AuthService);
  private userService = inject(UserService);

  private allUsers = signal<User[]>([]);
  search = signal('');
  loading = signal(true);
  deletingUserId = signal<string | null>(null);
  selectedUser = signal<User | null>(null);
  currentAppUser = signal<User | null>(null);

  readonly pageSize = 10;
  currentPage = signal(1);

  filteredUsers = computed(() => {
    const term = this.search().toLowerCase().trim();
    if (!term) return this.allUsers();
    return this.allUsers().filter(
      (u) =>
        u.firstName?.toLowerCase().includes(term) ||
        u.lastName?.toLowerCase().includes(term) ||
        u.displayName?.toLowerCase().includes(term) ||
        u.email?.toLowerCase().includes(term)
    );
  });

  totalPages = computed(() => Math.max(1, Math.ceil(this.filteredUsers().length / this.pageSize)));

  pagedUsers = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.filteredUsers().slice(start, start + this.pageSize);
  });

  canDeleteUsers = computed(() => this.currentAppUser()?.roleId === this.superAdminRoleId);
  canManageUsers = computed(() => {
    const roleId = this.currentAppUser()?.roleId ?? '';
    return roleId === this.superAdminRoleId || roleId === this.adminRoleId;
  });

  constructor() {
    this.loadCurrentUser();
    this.loadUsers();
  }

  onSearch(value: string): void {
    this.search.set(value);
    this.currentPage.set(1);
  }

  prevPage(): void { this.currentPage.update((p) => Math.max(1, p - 1)); }
  nextPage(): void { this.currentPage.update((p) => Math.min(this.totalPages(), p + 1)); }

  selectUser(user: User): void {
    this.selectedUser.set(user);
  }

  onModalClosed(changed: boolean): void {
    this.selectedUser.set(null);
    if (changed) this.loadUsers();
  }

  deleteUser(user: User, event: Event): void {
    event.stopPropagation();

    if (!this.canDeleteUsers()) {
      return;
    }

    if (this.currentAppUser()?.idDoc === user.idDoc) {
      window.alert('No puedes eliminar tu propio usuario desde esta pantalla.');
      return;
    }

    const confirmed = window.confirm(
      `Se eliminará el usuario ${user.displayName || user.email} de la colección "user".`
    );

    if (!confirmed) {
      return;
    }

    this.deletingUserId.set(user.idDoc);
    this.userService
      .deleteUserDocument(user.idDoc)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.allUsers.update((items) => items.filter((item) => item.idDoc !== user.idDoc));
          if (this.selectedUser()?.idDoc === user.idDoc) {
            this.selectedUser.set(null);
          }
          this.deletingUserId.set(null);
          window.alert('Usuario eliminado de la colección "user". La baja en Firebase Auth requiere backend/Admin SDK.');
        },
        error: () => {
          this.deletingUserId.set(null);
          window.alert('No fue posible eliminar el usuario.');
        },
      });
  }

  private loadUsers(): void {
    this.loading.set(true);
    this.userService.getUsers().subscribe({
      next: (users) => {
        this.allUsers.set(users);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  private loadCurrentUser(): void {
    this.authService.currentUser$.pipe(take(1)).subscribe((firebaseUser) => {
      if (!firebaseUser) {
        return;
      }

      this.userService
        .getUserById(firebaseUser.uid)
        .pipe(take(1))
        .subscribe((appUser) => this.currentAppUser.set(appUser));
    });
  }
}
