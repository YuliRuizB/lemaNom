import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, finalize, take } from 'rxjs';

import { User } from '../../interfaces/user.interface';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { UserService } from '../../services/user.service';

@Component({
  selector: 'app-main-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './main-shell.component.html',
  styleUrl: './main-shell.component.scss',
})
export class MainShellComponent {
  private readonly superAdminRoleId = 'NPsdyKHT4qpRnRULhC7R';

  displayName = 'Usuario';
  customerName = '';
  currentAppUser: User | null = null;

  constructor(
    private authService: AuthService,
    private toastService: ToastService,
    private userService: UserService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {
    this.updateHeaderContent(this.router.url);

    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.updateHeaderContent((event as NavigationEnd).urlAfterRedirects);
      });
  }

  isProfileMenuOpen = false;
  isClosingSession = false;
  isHomeOpen = true;
  isCatalogsOpen = true;
  isLogisticaOpen = true;
  isAdminOpen = true;
  isSettingsOpen = true;
  isSidebarCollapsed = false;
  headerTitle = 'Home';
  headerDescription = 'Panel principal de acceso rapido y navegacion general.';

  get canViewAdminMenu(): boolean {
    return this.currentAppUser?.roleId === this.superAdminRoleId;
  }

  ngOnInit(): void {
    this.authService.currentUser$.pipe(take(1)).subscribe((firebaseUser) => {
      if (!firebaseUser) {
        return;
      }

      this.userService.getUserById(firebaseUser.uid).pipe(take(1)).subscribe((appUser) => {
        this.currentAppUser = appUser;
        this.displayName =
          appUser?.displayName || firebaseUser.displayName || firebaseUser.email || 'Usuario';
        this.customerName = appUser?.customerName || '';
        this.cdr.markForCheck();
      });
    });
  }

  get currentSectionLabel(): string {
    if (this.isHomeOpen) {
      return 'Home';
    }

    if (this.isCatalogsOpen) {
      return 'Catalogos';
    }

    if (this.isSettingsOpen) {
      return 'Configuracion';
    }

    return 'Menu';
  }

  toggleProfileMenu(): void {
    this.isProfileMenuOpen = !this.isProfileMenuOpen;
  }

  toggleSidebar(): void {
    this.isSidebarCollapsed = !this.isSidebarCollapsed;
  }

  toggleSection(section: 'home' | 'catalogs' | 'logistica' | 'admin' | 'settings'): void {
    if (section === 'home') { this.isHomeOpen = !this.isHomeOpen; return; }
    if (section === 'catalogs') { this.isCatalogsOpen = !this.isCatalogsOpen; return; }
    if (section === 'logistica') { this.isLogisticaOpen = !this.isLogisticaOpen; return; }
    if (section === 'admin') { this.isAdminOpen = !this.isAdminOpen; return; }
    this.isSettingsOpen = !this.isSettingsOpen;
  }

  private updateHeaderContent(url: string): void {
    if (url.includes('/app/profile')) {
      this.headerTitle = 'Perfil';
      this.headerDescription = 'Espacio base para la informacion y configuracion del perfil.';
      return;
    }

    if (url.includes('/app/terms')) {
      this.headerTitle = 'Términos';
      this.headerDescription = 'Consulta de términos y condiciones de uso de la plataforma.';
      return;
    }

    if (url.includes('/app/customer')) {
      this.headerTitle = 'Empresa';
      this.headerDescription = 'Espacio base para el catalogo administrativo de empresas.';
      return;
    }

    if (url.includes('/app/role')) {
      this.headerTitle = 'Roles';
      this.headerDescription = 'Espacio base para la administracion de roles del sistema.';
      return;
    }

    if (url.includes('/app/clients')) {
      this.headerTitle = 'Clientes';
      this.headerDescription = 'Catálogo de clientes del sistema.';
      return;
    }

    if (url.includes('/app/equipo-medicion')) {
      this.headerTitle = 'Equipo de Medición';
      this.headerDescription = 'Catálogo de equipos de medición del sistema.';
      return;
    }

    if (url.includes('/app/users')) {
      this.headerTitle = 'Usuarios';
      this.headerDescription = 'Administración de usuarios del sistema.';
      return;
    }

    if (url.includes('/app/normas')) {
      this.headerTitle = 'Normas';
      this.headerDescription = 'Catálogo base de normas del sistema.';
      return;
    }

    if (url.includes('/app/workflows')) {
      this.headerTitle = 'WorkFlows';
      this.headerDescription = 'Administración de flujos de trabajo del sistema.';
      return;
    }

    if (url.includes('/app/work-order')) {
      this.headerTitle = 'Orden de Trabajo';
      this.headerDescription = 'Espacio base para la gestión de órdenes de trabajo.';
      return;
    }

    if (url.includes('/app/evaluation')) {
      this.headerTitle = 'Laboratorio';
      this.headerDescription = 'Espacio base para la gestión de evaluaciones.';
      return;
    }

    if (url.includes('/app/measurements')) {
      this.headerTitle = 'Laboratorio';
      this.headerDescription = 'Espacio base para la gestión de mediciones.';
      return;
    }

    if (url.includes('/app/revision')) {
      this.headerTitle = 'Laboratorio';
      this.headerDescription = 'Espacio base para la gestión de revisiones.';
      return;
    }

    if (url.includes('/app/inform')) {
      this.headerTitle = 'Laboratorio';
      this.headerDescription = 'Espacio base para la gestión de informes.';
      return;
    }

    if (url.includes('/app/categorias')) {
      this.headerTitle = 'Categorias';
      this.headerDescription = 'Catálogo base para la administración de categorías.';
      return;
    }

    if (url.includes('/app/catalogos')) {
      this.headerTitle = 'Catalogos';
      this.headerDescription = 'Base preparada para organizar modulos maestros del sistema.';
      return;
    }

    if (url.includes('/app/configuracion')) {
      this.headerTitle = 'Configuracion';
      this.headerDescription = 'Espacio preparado para ajustes generales, perfiles y preferencias.';
      return;
    }

    this.headerTitle = 'Home';
    this.headerDescription = 'Panel principal de acceso rapido y navegacion general.';
  }

  logout(): void {
    this.isClosingSession = true;
    this.cdr.markForCheck();

    this.authService
      .logout()
      .pipe(
        finalize(() => {
          this.isClosingSession = false;
          this.isProfileMenuOpen = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: () => {
          this.toastService.success('Sesión cerrada correctamente.');
          void this.router.navigate(['/auth/login']);
        },
        error: (error: unknown) => {
          console.error('Error closing session', error);
          this.toastService.error('No fue posible cerrar la sesión.');
        },
      });
  }
}
