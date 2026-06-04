import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize, of, switchMap, throwError } from 'rxjs';
import { FirebaseError } from 'firebase/app';

import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { UserService } from '../../services/user.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  constructor(
    private authService: AuthService,
    private userService: UserService,
    private toastService: ToastService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  loginForm = {
    email: '',
    password: '',
  };

  isSubmitting = false;

  submitLogin(): void {
    if (!this.loginForm.email.trim() || !this.loginForm.password) {
      this.toastService.warning('Captura tu correo electronico y contraseña.');
      return;
    }

    this.isSubmitting = true;
    this.cdr.detectChanges();

    this.authService
      .login(this.loginForm.email.trim(), this.loginForm.password)
      .pipe(
        switchMap((credential) =>
          this.userService.getUserById(credential.user.uid).pipe(
            switchMap((appUser) => {
              if (!appUser?.approved) {
                return this.authService.logout().pipe(
                  switchMap(() =>
                    throwError(
                      () =>
                        new Error(
                          'El Acceso al sistema esta restringido, favor de validar con Administrador. para que este apruebe'
                        )
                    )
                  )
                );
              }

              return of(appUser);
            })
          )
        ),
        finalize(() => {
          this.isSubmitting = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: () => {
          this.toastService.success('Acceso autorizado correctamente.');
          void this.router.navigate(['/app']);
        },
        error: (error: unknown) => {
          console.error('Error during login', error);
          this.toastService.error(this.getLoginErrorMessage(error));
        },
      });
  }

  private getLoginErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.includes('El Acceso al sistema esta restringido')) {
      return error.message;
    }

    if (error instanceof FirebaseError) {
      if (error.code === 'auth/invalid-credential') {
        return 'Correo o contraseña incorrectos.';
      }

      if (error.code === 'auth/too-many-requests') {
        return 'Demasiados intentos. Intenta nuevamente mas tarde.';
      }
    }

    return 'No fue posible iniciar sesion.';
  }
}
