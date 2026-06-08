import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
} from '@angular/fire/firestore';
import { Observable, from, map } from 'rxjs';

import { WorkflowStepCatalog } from '../interfaces/workflow.interface';

@Injectable({ providedIn: 'root' })
export class WorkflowService {
  private firestore = inject(Firestore);

  getWorkflows(): Observable<WorkflowStepCatalog[]> {
    const ref = collection(this.firestore, 'workflowStepCatalog');
    const q = query(ref, limit(500));

    return from(getDocs(q)).pipe(
      map((snapshot) =>
        snapshot.docs
          .map((d) => ({ uid: d.id, ...d.data() } as WorkflowStepCatalog))
          .sort((a, b) => a.code.localeCompare(b.code))
      )
    );
  }

  createWorkflow(data: Omit<WorkflowStepCatalog, 'uid'>): Observable<void> {
    const ref = collection(this.firestore, 'workflowStepCatalog');
    return from(addDoc(ref, { ...data, createdAt: serverTimestamp() })).pipe(map(() => void 0));
  }

  updateWorkflow(uid: string, data: Omit<WorkflowStepCatalog, 'uid'>): Observable<void> {
    const docRef = doc(this.firestore, 'workflowStepCatalog', uid);
    return from(setDoc(docRef, { ...data, updatedAt: serverTimestamp() }, { merge: true }));
  }

  deleteWorkflow(uid: string): Observable<void> {
    return from(deleteDoc(doc(this.firestore, 'workflowStepCatalog', uid)));
  }
}
