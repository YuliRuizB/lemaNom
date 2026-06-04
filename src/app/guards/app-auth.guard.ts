import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of, switchMap, take } from 'rxjs';

import { AuthService } from '../services/auth.service';
import { UserService } from '../services/user.service';

export const appAuthGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const userService = inject(UserService);
  const router = inject(Router);

  return authService.currentUser$.pipe(
    take(1),
    switchMap((firebaseUser) => {
      if (!firebaseUser) {
        return of(router.createUrlTree(['/auth/login']));
      }

      return userService.getUserById(firebaseUser.uid).pipe(
        switchMap((appUser) => {
          if (appUser?.approved) {
            return of(true);
          }

          return authService.logout().pipe(
            map(() => router.createUrlTree(['/auth/login'])),
            catchError(() => of(router.createUrlTree(['/auth/login'])))
          );
        })
      );
    }),
    catchError(() => of(router.createUrlTree(['/auth/login'])))
  );
};
