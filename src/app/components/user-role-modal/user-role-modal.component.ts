import { CommonModule, DatePipe } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';

import { Role } from '../../interfaces/role.interface';
import { User, UserAccreditation, UserQualification } from '../../interfaces/user.interface';
import { RoleService } from '../../services/role.service';
import { ToastService } from '../../services/toast.service';
import { UserService } from '../../services/user.service';

@Component({
  selector: 'app-user-role-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './user-role-modal.component.html',
  styleUrl: './user-role-modal.component.scss',
})
export class UserRoleModalComponent implements OnInit {
  @Input({ required: true }) user!: User;
  @Input() canManage = false;
  @Output() closed = new EventEmitter<boolean>();

  private roleService = inject(RoleService);
  private userService = inject(UserService);
  private toastService = inject(ToastService);

  private readonly superAdminRoleId = 'NPsdyKHT4qpRnRULhC7R';

  roles = signal<Role[]>([]);
  selectedRoleId = signal('');
  selectedApproved = signal(false);
  saving = signal(false);
  loadingRoles = signal(true);
  accreditations = signal<UserAccreditation[]>([]);
  qualifications = signal<UserQualification[]>([]);
  loadingExtras = signal(true);

  get isSuperAdmin(): boolean {
    return this.user.roleId === this.superAdminRoleId;
  }

  get hasChanged(): boolean {
    return (
      this.selectedRoleId() !== (this.user.roleId ?? '') ||
      this.selectedApproved() !== this.user.approved
    );
  }

  ngOnInit(): void {
    this.selectedRoleId.set(this.user.roleId ?? '');
    this.selectedApproved.set(this.user.approved);

    this.roleService.getActiveRoles().subscribe({
      next: (roles) => {
        this.roles.set(roles.filter((r) => r.idDoc !== this.superAdminRoleId));
        this.loadingRoles.set(false);
      },
      error: () => this.loadingRoles.set(false),
    });

    forkJoin({
      accreditations: this.userService.getUserAccreditations(this.user.idDoc),
      qualifications: this.userService.getUserQualifications(this.user.idDoc),
    }).subscribe({
      next: ({ accreditations, qualifications }) => {
        this.accreditations.set(accreditations);
        this.qualifications.set(qualifications);
        this.loadingExtras.set(false);
      },
      error: () => this.loadingExtras.set(false),
    });
  }

  save(): void {
    if (!this.hasChanged || this.saving()) return;

    const role = this.roles().find((r) => r.idDoc === this.selectedRoleId());
    if (!role) return;

    this.saving.set(true);

    this.userService
      .updateUser(this.user.idDoc, {
        roleId: role.idDoc,
        roleName: role.name,
        approved: this.selectedApproved(),
      })
      .subscribe({
        next: () => {
          this.toastService.success('Usuario actualizado correctamente.');
          this.closed.emit(true);
        },
        error: () => {
          this.toastService.error('Error al actualizar el usuario.');
          this.saving.set(false);
        },
      });
  }

  cancel(): void {
    this.closed.emit(false);
  }
}
