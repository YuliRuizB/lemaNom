import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, of, switchMap, take } from 'rxjs';

import { AuthService } from '../services/auth.service';
import { UserService } from '../services/user.service';

export const authPageGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const userService = inject(UserService);
  const router = inject(Router);

  return authService.currentUser$.pipe(
    take(1),
    switchMap((firebaseUser) => {
      if (!firebaseUser) {
        return of(true);
      }

      return userService.getUserById(firebaseUser.uid).pipe(
        switchMap((appUser) => {
          if (appUser?.approved) {
            return of(router.createUrlTree(['/app/home']));
          }

          return authService.logout().pipe(
            switchMap(() => of(true)),
            catchError(() => of(true))
          );
        })
      );
    }),
    catchError(() => of(true))
  );
};
