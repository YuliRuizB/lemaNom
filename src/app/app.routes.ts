import { Routes } from '@angular/router';

import { appAuthGuard } from './guards/app-auth.guard';
import { authPageGuard } from './guards/auth-page.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'auth/login', pathMatch: 'full' },
  {
    path: 'app',
    canActivate: [appAuthGuard],
    loadComponent: () =>
      import('./pages/main-shell/main-shell.component').then((m) => m.MainShellComponent),
    children: [
      { path: '', redirectTo: 'home', pathMatch: 'full' },
      {
        path: 'home',
        loadComponent: () => import('./pages/home/home.component').then((m) => m.HomeComponent),
      },
      {
        path: 'catalogos',
        loadComponent: () =>
          import('./pages/catalogs/catalogs.component').then((m) => m.CatalogsComponent),
      },
      {
        path: 'configuracion',
        loadComponent: () =>
          import('./pages/settings/settings.component').then((m) => m.SettingsComponent),
      },
      {
        path: 'customer',
        loadComponent: () =>
          import('./pages/customer/customer.component').then((m) => m.CustomerComponent),
      },
      {
        path: 'role',
        loadComponent: () => import('./pages/role/role.component').then((m) => m.RoleComponent),
      },
      {
        path: 'clients',
        loadComponent: () =>
          import('./pages/clients/clients.component').then((m) => m.ClientsComponent),
      },
      {
        path: 'equipo-medicion',
        loadComponent: () =>
          import('./pages/equipo-medicion/equipo-medicion.component').then(
            (m) => m.EquipoMedicionComponent
          ),
      },
      {
        path: 'users',
        loadComponent: () =>
          import('./pages/users/users.component').then((m) => m.UsersComponent),
      },
      {
        path: 'normas',
        loadComponent: () =>
          import('./pages/normas/normas.component').then((m) => m.NormasComponent),
      },
      {
        path: 'categorias',
        loadComponent: () =>
          import('./pages/categorias/categorias.component').then((m) => m.CategoriasComponent),
      },
      {
        path: 'workflows',
        loadComponent: () =>
          import('./pages/workflows/workflows.component').then((m) => m.WorkflowsComponent),
      },
      {
        path: 'work-order',
        loadComponent: () =>
          import('./pages/work-order/work-order.component').then((m) => m.WorkOrderComponent),
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./pages/profile/profile.component').then((m) => m.ProfileComponent),
      },
      {
        path: 'terms',
        loadComponent: () =>
          import('./pages/terms/terms.component').then((m) => m.TermsComponent),
      },
    ],
  },
  {
    path: 'terms',
    loadComponent: () =>
      import('./pages/terms/terms.component').then((m) => m.TermsComponent),
  },
  {
    path: 'auth',
    children: [
      {
        path: 'login',
        canActivate: [authPageGuard],
        loadComponent: () =>
          import('./auth/login/login.component').then((m) => m.LoginComponent),
      },
      {
        path: 'register',
        loadComponent: () =>
          import('./auth/register/register.component').then((m) => m.RegisterComponent),
      },
      {
        path: 'forgot-password',
        loadComponent: () =>
          import('./auth/forgotPassword/forgot-password.component').then(
            (m) => m.ForgotPasswordComponent
          ),
      },
    ],
  },
];
