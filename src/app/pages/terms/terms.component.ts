import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

@Component({
  selector: 'app-terms',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './terms.component.html',
  styleUrl: './terms.component.scss',
})
export class TermsComponent {
  private readonly route = inject(ActivatedRoute);

  readonly returnTo = this.route.snapshot.queryParamMap.get('returnTo');
  readonly showReturnSection = this.returnTo === '/auth/register';

  get backLabel(): string {
    return 'Volver al registro';
  }
}
