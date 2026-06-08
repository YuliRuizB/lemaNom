import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from '@angular/fire/firestore';
import { Observable, from, map } from 'rxjs';

import { NormWorkflowStep } from '../interfaces/norm-workflow-step.interface';

@Injectable({ providedIn: 'root' })
export class NormWorkflowService {
  private firestore = inject(Firestore);

  getSteps(normId: string): Observable<NormWorkflowStep[]> {
    const ref = collection(this.firestore, 'norms', normId, 'workflow');
    const q = query(ref, orderBy('order'));
    return from(getDocs(q)).pipe(
      map((snapshot) => snapshot.docs.map((d) => this.toStep(d.id, d.data())))
    );
  }

  addStep(normId: string, data: Omit<NormWorkflowStep, 'idDoc' | 'createdAt' | 'updatedAt'>): Observable<void> {
    const ref = collection(this.firestore, 'norms', normId, 'workflow');
    return from(addDoc(ref, { ...data, createdAt: serverTimestamp() })).pipe(map(() => void 0));
  }

  toggleOptional(normId: string, stepId: string, optional: boolean): Observable<void> {
    const ref = doc(this.firestore, 'norms', normId, 'workflow', stepId);
    return from(updateDoc(ref, { optional, updatedAt: serverTimestamp() }));
  }

  removeStep(normId: string, stepId: string): Observable<void> {
    return from(deleteDoc(doc(this.firestore, 'norms', normId, 'workflow', stepId)));
  }

  updateOrder(normId: string, steps: NormWorkflowStep[]): Observable<void> {
    const batch = writeBatch(this.firestore);
    steps.forEach((step, index) => {
      const ref = doc(this.firestore, 'norms', normId, 'workflow', step.idDoc);
      batch.update(ref, { order: index + 1, updatedAt: serverTimestamp() });
    });
    return from(batch.commit());
  }

  private toStep(id: string, data: Record<string, any>): NormWorkflowStep {
    return {
      idDoc: id,
      order: data['order'],
      stepUid: data['stepUid'],
      code: data['code'],
      name: data['name'],
      description: data['description'],
      optional: data['optional'] ?? false,
      createdAt: data['createdAt'] instanceof Timestamp ? data['createdAt'].toDate() : data['createdAt'],
      updatedAt: data['updatedAt'] instanceof Timestamp ? data['updatedAt'].toDate() : data['updatedAt'],
    };
  }
}
