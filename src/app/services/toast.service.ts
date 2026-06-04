import { Injectable, signal } from '@angular/core';

import { ToastMessage, ToastType } from '../interfaces/toast.interface';

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<ToastMessage[]>([]);

  success(message: string, duration = 3500): void {
    this.show(message, 'success', duration);
  }

  error(message: string, duration = 4500): void {
    this.show(message, 'error', duration);
  }

  warning(message: string, duration = 4000): void {
    this.show(message, 'warning', duration);
  }

  remove(id: number): void {
    this.toasts.update((items) => items.filter((item) => item.id !== id));
  }

  private show(message: string, type: ToastType, duration: number): void {
    const toast: ToastMessage = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      message,
      type,
      duration,
    };

    this.toasts.update((items) => [...items, toast]);
    setTimeout(() => this.remove(toast.id), duration);
  }
}
