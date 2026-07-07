import { CommonModule } from '@angular/common';
import { Component, Input, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { workOrder } from '../../interfaces/workOrder.interface';

type LightingRecognitionArea = {
  id: string;
  name: string;
  areaDescription: string;
  minimumLightingLevels: number[];
  wallsColor: string;
  wallsFinish: string;
  floorsColor: string;
  floorsFinish: string;
  ceilingsColor: string;
  ceilingsFinish: string;
};

@Component({
  selector: 'app-lighting-recognition',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './lighting-recognition.component.html',
  styleUrl: './lighting-recognition.component.scss',
})
export class LightingRecognitionComponent {
  @Input() workOrder: workOrder | null = null;
  readonly minimumLightingLevelOptions = [20, 50, 100, 200, 300, 500, 750, 1000, 2000];

  areas = signal<LightingRecognitionArea[]>([]);
  selectedAreaId = signal('');
  showEditor = signal(false);
  draftAreaName = signal('');
  draftAreaDescription = signal('');
  draftMinimumLightingLevels = signal<number[]>([]);
  draftWallsColor = signal('');
  draftWallsFinish = signal('');
  draftFloorsColor = signal('');
  draftFloorsFinish = signal('');
  draftCeilingsColor = signal('');
  draftCeilingsFinish = signal('');
  editingAreaId = signal('');
  readonly selectedArea = computed(
    () => this.areas().find((item) => item.id === this.selectedAreaId()) || null
  );

  saveArea(): void {
    const name = this.draftAreaName().trim();
    const areaDescription = this.draftAreaDescription().trim();
    const minimumLightingLevels = [...this.draftMinimumLightingLevels()].sort((a, b) => a - b);
    const wallsColor = this.draftWallsColor().trim();
    const wallsFinish = this.draftWallsFinish().trim();
    const floorsColor = this.draftFloorsColor().trim();
    const floorsFinish = this.draftFloorsFinish().trim();
    const ceilingsColor = this.draftCeilingsColor().trim();
    const ceilingsFinish = this.draftCeilingsFinish().trim();

    if (!name) {
      return;
    }

    const editingId = this.editingAreaId();
    if (editingId) {
      this.areas.update((items) =>
        items.map((item) =>
          item.id === editingId
            ? {
                ...item,
                name,
                areaDescription,
                minimumLightingLevels,
                wallsColor,
                wallsFinish,
                floorsColor,
                floorsFinish,
                ceilingsColor,
                ceilingsFinish,
              }
            : item
        )
      );
    } else {
      const newAreaId = this.buildAreaId();
      this.areas.update((items) => [
        ...items,
        {
          id: newAreaId,
          name,
          areaDescription,
          minimumLightingLevels,
          wallsColor,
          wallsFinish,
          floorsColor,
          floorsFinish,
          ceilingsColor,
          ceilingsFinish,
        },
      ]);
      this.selectedAreaId.set(newAreaId);
    }

    this.resetDraft();
    this.showEditor.set(false);
  }

  editArea(area: LightingRecognitionArea): void {
    this.editingAreaId.set(area.id);
    this.selectedAreaId.set(area.id);
    this.showEditor.set(true);
    this.draftAreaName.set(area.name);
    this.draftAreaDescription.set(area.areaDescription);
    this.draftMinimumLightingLevels.set([...(area.minimumLightingLevels || [])]);
    this.draftWallsColor.set(area.wallsColor);
    this.draftWallsFinish.set(area.wallsFinish);
    this.draftFloorsColor.set(area.floorsColor);
    this.draftFloorsFinish.set(area.floorsFinish);
    this.draftCeilingsColor.set(area.ceilingsColor);
    this.draftCeilingsFinish.set(area.ceilingsFinish);
  }

  deleteArea(areaId: string): void {
    this.areas.update((items) => items.filter((item) => item.id !== areaId));
    if (this.selectedAreaId() === areaId) {
      this.selectedAreaId.set('');
    }

    if (this.editingAreaId() === areaId) {
      this.resetDraft();
    }
  }

  openNewArea(): void {
    this.resetDraft();
    this.selectedAreaId.set('');
    this.showEditor.set(true);
  }

  selectArea(area: LightingRecognitionArea): void {
    this.editArea(area);
  }

  cancelEdit(): void {
    this.resetDraft();
    this.showEditor.set(false);
  }

  toggleMinimumLightingLevel(level: number): void {
    this.draftMinimumLightingLevels.update((levels) =>
      levels.includes(level) ? levels.filter((item) => item !== level) : [...levels, level]
    );
  }

  isMinimumLightingLevelSelected(level: number): boolean {
    return this.draftMinimumLightingLevels().includes(level);
  }

  private resetDraft(): void {
    this.editingAreaId.set('');
    this.draftAreaName.set('');
    this.draftAreaDescription.set('');
    this.draftMinimumLightingLevels.set([]);
    this.draftWallsColor.set('');
    this.draftWallsFinish.set('');
    this.draftFloorsColor.set('');
    this.draftFloorsFinish.set('');
    this.draftCeilingsColor.set('');
    this.draftCeilingsFinish.set('');
  }

  private buildAreaId(): string {
    return `area-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}
