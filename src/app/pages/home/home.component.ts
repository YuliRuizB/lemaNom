import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { of, switchMap, take } from 'rxjs';

import { User } from '../../interfaces/user.interface';
import { workOrder } from '../../interfaces/workOrder.interface';
import { AuthService } from '../../services/auth.service';
import { CustomerService } from '../../services/customer.service';
import { UserService } from '../../services/user.service';
import { WorkOrderService } from '../../services/work-order.service';

const MONTH_LABELS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

interface ChartEntry { label: string; count: number; }

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent {
  private authService    = inject(AuthService);
  private userService    = inject(UserService);
  private customerService = inject(CustomerService);
  private workOrderService = inject(WorkOrderService);

  logoUrl        = signal('assets/5.png');
  summaryLoading = signal(true);
  currentYear    = new Date().getFullYear();

  workOrderSummary = signal<WorkOrderSummary>({
    total: 0, pending: 0, inProgress: 0, completed: 0, cancelled: 0,
  });

  monthlyOrders  = signal<number[]>(Array(12).fill(0));
  byNorm         = signal<ChartEntry[]>([]);
  bySignatory    = signal<ChartEntry[]>([]);

  readonly monthLabels = MONTH_LABELS;

  readonly chartSegments = computed(() => {
    const s = this.workOrderSummary();
    if (!s.total) return [];
    const r = 45;
    const circ = 2 * Math.PI * r;
    const items = [
      { label: 'Por iniciar',  value: s.pending,    color: '#94a3b8' },
      { label: 'En progreso',  value: s.inProgress, color: '#0052cc' },
      { label: 'Concluidas',   value: s.completed,  color: '#16a34a' },
      { label: 'Canceladas',   value: s.cancelled,  color: '#dc2626' },
    ];
    let cumulative = 0;
    return items
      .filter(i => i.value > 0)
      .map(item => {
        const dash   = (item.value / s.total) * circ;
        const offset = circ - cumulative;
        cumulative  += dash;
        return { ...item, dash, gap: circ - dash, offset };
      });
  });

  readonly maxMonthly    = computed(() => Math.max(...this.monthlyOrders(), 1));
  readonly maxNorm       = computed(() => Math.max(...this.byNorm().map(e => e.count), 1));
  readonly maxSignatory  = computed(() => Math.max(...this.bySignatory().map(e => e.count), 1));

  constructor() { this.loadHomeContext(); }

  barHeight(value: number, max: number = this.maxMonthly()): number {
    return Math.round((value / max) * 100);
  }

  barWidth(value: number, max: number): number {
    return Math.round((value / max) * 100);
  }

  private loadHomeContext(): void {
    this.authService.currentUser$
      .pipe(
        take(1),
        switchMap((fu) => {
          if (!fu) return of({ appUser: null, customer: null });
          return this.userService.getUserById(fu.uid).pipe(
            switchMap((appUser) => {
              if (!appUser?.customerId) return of({ appUser, customer: null });
              return this.customerService.getCustomerById(appUser.customerId).pipe(
                switchMap((customer) => of({ appUser, customer }))
              );
            })
          );
        }),
      )
      .subscribe(({ appUser, customer }) => {
        const urlLogo = customer?.urlLogo?.trim();
        if (urlLogo) this.logoUrl.set(urlLogo);
        this.loadWorkOrderSummary(appUser);
      });
  }

  private loadWorkOrderSummary(_appUser: User | null): void {
    this.summaryLoading.set(true);
    this.workOrderService.getWorkOrders().pipe(take(1)).subscribe((orders) => {
      const yearOrders = orders.filter(
        (o) => o.createdAt instanceof Date && o.createdAt.getFullYear() === this.currentYear
      );
      this.workOrderSummary.set(this.buildSummary(yearOrders));
      this.monthlyOrders.set(this.buildMonthly(yearOrders));
      this.byNorm.set(this.buildGrouped(yearOrders, (o) => o.nomCategoryName || 'Sin categoría'));
      this.bySignatory.set(this.buildGrouped(yearOrders, (o) => o.signatoryName || 'Sin asignar'));
      this.summaryLoading.set(false);
    });
  }

  private buildSummary(orders: workOrder[]): WorkOrderSummary {
    return orders.reduce<WorkOrderSummary>(
      (acc, o) => {
        acc.total += 1;
        if (o.status === 'pending')     acc.pending    += 1;
        if (o.status === 'in-progress') acc.inProgress += 1;
        if (o.status === 'completed')   acc.completed  += 1;
        if (o.status === 'cancelled')   acc.cancelled  += 1;
        return acc;
      },
      { total: 0, pending: 0, inProgress: 0, completed: 0, cancelled: 0 }
    );
  }

  private buildMonthly(orders: workOrder[]): number[] {
    const months = Array(12).fill(0);
    orders.forEach((o) => {
      if (o.createdAt instanceof Date) months[o.createdAt.getMonth()] += 1;
    });
    return months;
  }

  private buildGrouped(orders: workOrder[], key: (o: workOrder) => string): ChartEntry[] {
    const map = new Map<string, number>();
    orders.forEach((o) => {
      const k = key(o);
      map.set(k, (map.get(k) ?? 0) + 1);
    });
    return [...map.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  }
}

interface WorkOrderSummary {
  total: number; pending: number; inProgress: number; completed: number; cancelled: number;
}
