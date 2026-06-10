import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  Timestamp,
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from '@angular/fire/firestore';
import { Observable, from, map } from 'rxjs';

import { NormWorkflowStep } from '../interfaces/norm-workflow-step.interface';
import { equipment } from '../interfaces/meditionType.interface';
import { workOrder, workOrderEquipment, workOrderStep } from '../interfaces/workOrder.interface';
import { User } from '../interfaces/user.interface';

@Injectable({ providedIn: 'root' })
export class WorkOrderService {
  private firestore = inject(Firestore);

  getWorkOrders(): Observable<workOrder[]> {
    const workOrdersRef = collection(this.firestore, 'workOrder');
    const workOrdersQuery = query(workOrdersRef, limit(500));

    return from(getDocs(workOrdersQuery)).pipe(
      map((snapshot) =>
        snapshot.docs
          .map((docSnapshot) => this.toWorkOrder(docSnapshot.id, docSnapshot.data()))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      )
    );
  }

  createWorkOrder(data: Omit<workOrder, 'idDoc' | 'updatedAt'>): Observable<string> {
    const workOrdersRef = collection(this.firestore, 'workOrder');

    return from(
      addDoc(workOrdersRef, {
        ...this.removeUndefinedFields(data),
        updatedAt: serverTimestamp(),
      })
    ).pipe(map((docRef) => docRef.id));
  }

  updateWorkOrder(workOrderId: string, data: Partial<workOrder>): Observable<void> {
    const workOrderRef = doc(this.firestore, 'workOrder', workOrderId);

    return from(
      setDoc(
        workOrderRef,
        {
          ...this.removeUndefinedFields(data),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
    );
  }

  createWorkflowSteps(
    workOrderId: string,
    nomId: string,
    steps: NormWorkflowStep[],
    sessionUser: User
  ): Observable<void> {
    const batch = writeBatch(this.firestore);

    steps.forEach((step, index) => {
      const stepId = this.buildWorkflowStepId(step.order || index + 1, step.name);
      const stepRef = doc(this.firestore, 'workOrder', workOrderId, 'workflowSteps', stepId);
      const isInitialOtStep = step.code === 'OT';

      const stepPayload: Record<string, any> = {
        workOrderId,
        nomId,
        workflowId: step.stepUid,
        stepCode: step.code,
        stepName: step.name,
        order: step.order || index + 1,
        optional: step.optional ?? false,
        status: isInitialOtStep ? 'in-progress' : 'pending',
        observations: '',
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if (isInitialOtStep) {
        stepPayload['assignedUserId']   = sessionUser.idDoc;
        stepPayload['assignedUserName'] = sessionUser.displayName;
        stepPayload['startedAt']        = serverTimestamp();
      }

      batch.set(stepRef, stepPayload);
    });

    return from(batch.commit()).pipe(map(() => void 0));
  }

  createEquipments(
    workOrderId: string,
    equipments: equipment[]
  ): Observable<void> {
    const batch = writeBatch(this.firestore);

    equipments.forEach((equipmentItem) => {
      const equipmentRef = doc(
        this.firestore,
        'workOrder',
        workOrderId,
        'equipments',
        equipmentItem.idDoc
      );

      const payload: Omit<workOrderEquipment, 'idDoc' | 'updatedAt'> = {
        workOrderId,
        equipmentId: equipmentItem.idDoc,
        equipmentName: equipmentItem.name || undefined,
        equipmentType: equipmentItem.identifier || undefined,
        equipmentSerialNumber: equipmentItem.ns || undefined,
        active: true,
        createdAt: new Date(),
      };

      batch.set(equipmentRef, {
        ...this.removeUndefinedFields(payload),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });

    return from(batch.commit()).pipe(map(() => void 0));
  }

  getWorkflowSteps(workOrderId: string): Observable<workOrderStep[]> {
    const stepsRef = collection(this.firestore, 'workOrder', workOrderId, 'workflowSteps');
    const stepsQuery = query(stepsRef, orderBy('order'));

    return from(getDocs(stepsQuery)).pipe(
      map((snapshot) => snapshot.docs.map((docSnapshot) => this.toWorkflowStep(docSnapshot.id, docSnapshot.data())))
    );
  }

  getEquipments(workOrderId: string): Observable<workOrderEquipment[]> {
    const equipmentsRef = collection(this.firestore, 'workOrder', workOrderId, 'equipments');

    return from(getDocs(equipmentsRef)).pipe(
      map((snapshot) =>
        snapshot.docs.map((docSnapshot) => this.toWorkOrderEquipment(docSnapshot.id, docSnapshot.data()))
      )
    );
  }

  private toWorkOrder(id: string, data: Record<string, unknown>): workOrder {
    return {
      idDoc: id,
      code: String(data['code'] ?? ''),
      createdAt: this.toDate(data['createdAt']) ?? new Date(),
      evaluationDate: this.toDate(data['evaluationDate']) ?? new Date(),
      evaluationNumber: String(data['evaluationNumber'] ?? ''),
      workOrderNumber: String(data['workOrderNumber'] ?? ''),
      informNumber: String(data['informNumber'] ?? ''),
      purchaseOrderNumber: String(data['purchaseOrderNumber'] ?? ''),
      quotationNumber: data['quotationNumber'] ? String(data['quotationNumber']) : undefined,
      clientId: String(data['clientId'] ?? ''),
      clientName: data['clientName'] ? String(data['clientName']) : undefined,
      plantId: String(data['plantId'] ?? ''),
      plantName: data['plantName'] ? String(data['plantName']) : undefined,
      nomCategoryId: String(data['nomCategoryId'] ?? ''),
      nomCategoryName: data['nomCategoryName'] ? String(data['nomCategoryName']) : undefined,
      nomCategoryServiceId: String(data['nomCategoryServiceId'] ?? ''),
      nomCategoryServiceName: data['nomCategoryServiceName']
        ? String(data['nomCategoryServiceName'])
        : undefined,
      nomId: String(data['nomId'] ?? ''),
      nomName: data['nomName'] ? String(data['nomName']) : undefined,
      userAssignedId: String(data['userAssignedId'] ?? ''),
      userAssignedName: data['userAssignedName'] ? String(data['userAssignedName']) : undefined,
      assingDate: this.toDate(data['assingDate']) ?? new Date(),
      signatoryId: String(data['signatoryId'] ?? ''),
      signatoryName: data['signatoryName'] ? String(data['signatoryName']) : undefined,
      impartiality: (data['impartiality'] as workOrder['impartiality']) ?? undefined,
      createdUser: String(data['createdUser'] ?? ''),
      createdUserName: data['createdUserName'] ? String(data['createdUserName']) : undefined,
      active: Boolean(data['active']),
      status: (data['status'] as workOrder['status']) ?? 'pending',
      updatedAt: this.toDate(data['updatedAt']),
    };
  }

  private toDate(value: unknown): Date | undefined {
    if (value instanceof Timestamp) {
      return value.toDate();
    }

    return value instanceof Date ? value : undefined;
  }

  private toWorkflowStep(id: string, data: Record<string, unknown>): workOrderStep {
    return {
      idDoc: id,
      workOrderId: String(data['workOrderId'] ?? ''),
      nomId: String(data['nomId'] ?? ''),
      workflowId: data['workflowId'] ? String(data['workflowId']) : undefined,
      stepCode: data['stepCode'] ? String(data['stepCode']) : undefined,
      stepName: String(data['stepName'] ?? ''),
      order: Number(data['order'] ?? 0),
      optional: Boolean(data['optional']),
      status: (data['status'] as workOrderStep['status']) ?? 'pending',
      assignedUserId: data['assignedUserId'] ? String(data['assignedUserId']) : undefined,
      assignedUserName: data['assignedUserName'] ? String(data['assignedUserName']) : undefined,
      observations: data['observations'] ? String(data['observations']) : undefined,
      startedAt: this.toDate(data['startedAt']),
      completedAt: this.toDate(data['completedAt']),
      active: Boolean(data['active']),
      createdAt: this.toDate(data['createdAt']) ?? new Date(),
      updatedAt: this.toDate(data['updatedAt']),
    };
  }

  private toWorkOrderEquipment(id: string, data: Record<string, unknown>): workOrderEquipment {
    return {
      idDoc: id,
      workOrderId: String(data['workOrderId'] ?? ''),
      equipmentId: String(data['equipmentId'] ?? ''),
      equipmentName: data['equipmentName'] ? String(data['equipmentName']) : undefined,
      equipmentType: data['equipmentType'] ? String(data['equipmentType']) : undefined,
      equipmentSerialNumber: data['equipmentSerialNumber']
        ? String(data['equipmentSerialNumber'])
        : undefined,
      active: Boolean(data['active']),
      createdAt: this.toDate(data['createdAt']) ?? new Date(),
      updatedAt: this.toDate(data['updatedAt']),
    };
  }

  private buildWorkflowStepId(order: number, stepName: string): string {
    const slug = stepName
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return `${String(order).padStart(2, '0')}-${slug || 'step'}`;
  }

  private removeUndefinedFields<T>(value: T): T {
    if (Array.isArray(value)) {
      return value.map((item) => this.removeUndefinedFields(item)) as T;
    }

    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value)
          .filter(([, entryValue]) => entryValue !== undefined)
          .map(([key, entryValue]) => [key, this.removeUndefinedFields(entryValue)])
      ) as T;
    }

    return value;
  }
}
