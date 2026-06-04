import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { FirebaseError } from 'firebase/app';

import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.scss',
})
export class ForgotPasswordComponent {
  constructor(
    private authService: AuthService,
    private toastService: ToastService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  email = '';
  isSubmitting = false;

  submitForgotPassword(): void {
    if (!this.email.trim()) {
      this.toastService.warning('Captura el correo electronico de tu cuenta.');
      return;
    }

    this.isSubmitting = true;
    this.cdr.markForCheck();

    this.authService
      .forgotPassword(this.email.trim())
      .pipe(
        finalize(() => {
          this.isSubmitting = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: () => {
          this.toastService.success(
            'Te enviamos un enlace para restablecer tu contraseña al correo capturado.'
          );
          this.email = '';
          void this.router.navigate(['/auth/login']);
        },
        error: (error: unknown) => {
          console.error('Error sending forgot password email', error);
          this.toastService.error(this.getForgotPasswordErrorMessage(error));
        },
      });
  }

  private getForgotPasswordErrorMessage(error: unknown): string {
    if (error instanceof FirebaseError) {
      if (error.code === 'auth/invalid-email') {
        return 'El correo electronico no es valido.';
      }

      if (error.code === 'auth/user-not-found') {
        return 'No existe una cuenta asociada a ese correo electronico.';
      }
    }

    return 'No fue posible enviar el correo de recuperacion.';
  }
}
