import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

@Component({
  selector: 'app-measurements',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './measurements.component.html',
  styleUrl: './measurements.component.scss',
})
export class MeasurementsComponent {}
