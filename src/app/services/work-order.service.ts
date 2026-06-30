import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  Timestamp,
  addDoc,
  collection,
  deleteField,
  deleteDoc,
  doc,
  getDoc,
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
import { Point, PointConnectedEquipment, PointMeasurementData } from '../interfaces/measurements.interface';
import { equipment } from '../interfaces/meditionType.interface';
import {
  workOrder,
  workOrderEquipment,
  workOrderStep,
  WorkOrderClientVisitSignature,
} from '../interfaces/workOrder.interface';
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
          .sort((a, b) => {
            const aOrder = Number.parseInt(a.workOrderNumber || '0', 10);
            const bOrder = Number.parseInt(b.workOrderNumber || '0', 10);

            if (!Number.isNaN(aOrder) && !Number.isNaN(bOrder) && aOrder !== bOrder) {
              return bOrder - aOrder;
            }

            return b.createdAt.getTime() - a.createdAt.getTime();
          })
      )
    );
  }

  getWorkOrderById(workOrderId: string): Observable<workOrder | null> {
    const workOrderRef = doc(this.firestore, 'workOrder', workOrderId);

    return from(getDoc(workOrderRef)).pipe(
      map((snapshot) => (snapshot.exists() ? this.toWorkOrder(snapshot.id, snapshot.data()) : null))
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
    sessionUser: User,
    assignments?: Record<string, { userId: string; userName: string }>
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
      } else if (assignments?.[step.stepUid]) {
        stepPayload['assignedUserId']   = assignments[step.stepUid].userId;
        stepPayload['assignedUserName'] = assignments[step.stepUid].userName;
      }

      batch.set(stepRef, stepPayload);
    });

    return from(batch.commit()).pipe(map(() => void 0));
  }

  createEquipments(
    workOrderId: string,
    equipments: equipment[],
    defaultEquipmentId?: string
  ): Observable<void> {
    console.log('WorkOrderService createEquipments payload', {
      workOrderId,
      equipments: equipments.map((equipmentItem) => ({
        idDoc: equipmentItem.idDoc,
        name: equipmentItem.name,
        identifier: equipmentItem.identifier,
        ns: equipmentItem.ns,
      })),
    });

    const batch = writeBatch(this.firestore);

    equipments.forEach((equipmentItem) => {
      console.log('WorkOrderService createEquipments doc path', {
        collection: 'workOrder',
        workOrderId,
        subcollection: 'equipments',
        equipmentDocId: equipmentItem.idDoc,
      });

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
        equipmentBrand: equipmentItem.brand || undefined,
        equipmentModel: equipmentItem.model || undefined,
        equipmentNs: equipmentItem.ns || undefined,
        equipmentSerialNumber: equipmentItem.ns || undefined,
        equipmentFrecuency: equipmentItem.frecuency || undefined,
        equipmentMeditionInterval: equipmentItem.range || undefined,
        equipmentPrecition: equipmentItem.precition || undefined,
        equipmentSpecifyEquipment: equipmentItem.especify_equipment || undefined,
        isDefault: defaultEquipmentId ? equipmentItem.idDoc === defaultEquipmentId : undefined,
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

  getWorkflowStepEquipments(
    workOrderId: string,
    workflowStepId: string
  ): Observable<workOrderEquipment[]> {
    const equipmentsRef = collection(
      this.firestore,
      'workOrder',
      workOrderId,
      'workflowSteps',
      workflowStepId,
      'equipments'
    );

    return from(getDocs(equipmentsRef)).pipe(
      map((snapshot) =>
        snapshot.docs.map((docSnapshot) => this.toWorkOrderEquipment(docSnapshot.id, docSnapshot.data()))
      )
    );
  }

  getWorkflowStep(workOrderId: string, workflowStepId: string): Observable<workOrderStep | null> {
    const stepRef = doc(this.firestore, 'workOrder', workOrderId, 'workflowSteps', workflowStepId);

    return from(getDoc(stepRef)).pipe(
      map((snapshot) => (snapshot.exists() ? this.toWorkflowStep(snapshot.id, snapshot.data()) : null))
    );
  }

  updateWorkflowStepEquipmentVoltage(
    workOrderId: string,
    workflowStepId: string,
    equipment: workOrderEquipment,
    voltage: string,
    promedioFC?: number | null
  ): Observable<void> {
    const equipmentRef = doc(
      this.firestore,
      'workOrder',
      workOrderId,
      'workflowSteps',
      workflowStepId,
      'equipments',
      equipment.idDoc
    );

    return from(
      setDoc(
        equipmentRef,
        {
          workOrderId,
          equipmentId: equipment.equipmentId,
          equipmentName: equipment.equipmentName || null,
          equipmentType: equipment.equipmentType || null,
          equipmentBrand: equipment.equipmentBrand || null,
          equipmentModel: equipment.equipmentModel || null,
          equipmentNs: equipment.equipmentNs || null,
          equipmentSerialNumber: equipment.equipmentSerialNumber || null,
          equipmentFrecuency: equipment.equipmentFrecuency || null,
          equipmentMeditionInterval: equipment.equipmentMeditionInterval || null,
          equipmentPrecition: equipment.equipmentPrecition || null,
          equipmentSpecifyEquipment: equipment.equipmentSpecifyEquipment || null,
          equipmentVoltage: voltage || null,
          promedioFC: promedioFC ?? null,
          frecuency: deleteField(),
          medition_interval: deleteField(),
          precition: deleteField(),
          especify_equipment: deleteField(),
          active: equipment.active,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
    );
  }

  getMeasurementPoints(workOrderId: string, workflowStepId: string): Observable<Point[]> {
    const pointsRef = collection(
      this.firestore,
      'workOrder',
      workOrderId,
      'workflowSteps',
      workflowStepId,
      'points'
    );
    const pointsQuery = query(pointsRef, orderBy('pointNumber'));

    return from(getDocs(pointsQuery)).pipe(
      map((snapshot) => snapshot.docs.map((docSnapshot) => this.toPoint(docSnapshot.id, docSnapshot.data())))
    );
  }

  createMeasurementPoint(workOrderId: string, workflowStepId: string, point: Point): Observable<void> {
    const pointRef = doc(
      this.firestore,
      'workOrder',
      workOrderId,
      'workflowSteps',
      workflowStepId,
      'points',
      point.idDoc
    );

    return from(
      setDoc(pointRef, {
        ...this.removeUndefinedFields({
          pointNumber: point.pointNumber,
          location: point.location,
          electrodeType: point.electrodeType,
          hasLightningRod: point.hasLightningRod,
          lightningRodHeight: point.lightningRodHeight,
          protectionRadius: point.protectionRadius,
          systemType: point.systemType,
          temperature: point.temperature,
          humidity: point.humidity,
          measurementCondition: point.measurementCondition,
          soilType: point.soilType,
          startTime: point.startTime,
          endTime: point.endTime,
          measurementData: point.measurementData,
          voltageStatus: point.voltageStatus,
          hasContinuity: point.hasContinuity,
          generatorSources: point.generatorSources,
          connectedEquipment: point.connectedEquipment,
          observations: point.observations,
          createdBy: point.createdBy,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
      })
    ).pipe(map(() => void 0));
  }

  updateMeasurementPoint(
    workOrderId: string,
    workflowStepId: string,
    pointId: string,
    data: Partial<Point>
  ): Observable<void> {
    const pointRef = doc(
      this.firestore,
      'workOrder',
      workOrderId,
      'workflowSteps',
      workflowStepId,
      'points',
      pointId
    );

    return from(
      setDoc(
        pointRef,
        {
          ...this.removeUndefinedFields(data),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
    );
  }

  deleteMeasurementPoint(
    workOrderId: string,
    workflowStepId: string,
    pointId: string
  ): Observable<void> {
    const pointRef = doc(
      this.firestore,
      'workOrder',
      workOrderId,
      'workflowSteps',
      workflowStepId,
      'points',
      pointId
    );
    return from(deleteDoc(pointRef));
  }

  finalizeWorkflowStep(
    workOrderId: string,
    currentStepId: string,
    nextStep?: Pick<workOrderStep, 'idDoc' | 'stepName'> | null,
    assignedUser?: { id?: string; name?: string },
    completedByUser?: { id?: string; name?: string },
    completeWorkOrder?: boolean
  ): Observable<void> {
    const batch = writeBatch(this.firestore);
    const currentStepRef = doc(this.firestore, 'workOrder', workOrderId, 'workflowSteps', currentStepId);

    batch.set(
      currentStepRef,
      {
        status: 'completed',
        completedAt: serverTimestamp(),
        completedByUserId: completedByUser?.id || null,
        completedByUserName: completedByUser?.name || null,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    if (nextStep?.idDoc) {
      const nextStepRef = doc(this.firestore, 'workOrder', workOrderId, 'workflowSteps', nextStep.idDoc);
      const nextStepPayload: Record<string, unknown> = {
        status: 'in-progress',
        startedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if (assignedUser?.id) {
        nextStepPayload['assignedUserId'] = assignedUser.id;
      }

      if (assignedUser?.name) {
        nextStepPayload['assignedUserName'] = assignedUser.name;
      }

      batch.set(nextStepRef, nextStepPayload, { merge: true });
    }

    const workOrderRef = doc(this.firestore, 'workOrder', workOrderId);
    const workOrderPayload: Record<string, unknown> = {
      status: completeWorkOrder ? 'completed' : 'in-progress',
      updatedAt: serverTimestamp(),
    };

    if (nextStep?.idDoc) {
      workOrderPayload['currentStepId'] = nextStep.idDoc;
      workOrderPayload['currentStepName'] = nextStep.stepName ?? null;
    } else {
      workOrderPayload['currentStepId'] = null;
      workOrderPayload['currentStepName'] = null;
    }

    batch.set(workOrderRef, workOrderPayload, { merge: true });

    return from(batch.commit()).pipe(map(() => void 0));
  }

  updateWorkflowStepAssignment(
    workOrderId: string,
    stepId: string,
    assignedUser?: { id?: string; name?: string }
  ): Observable<void> {
    const stepRef = doc(this.firestore, 'workOrder', workOrderId, 'workflowSteps', stepId);

    return from(
      setDoc(
        stepRef,
        {
          assignedUserId: assignedUser?.id || null,
          assignedUserName: assignedUser?.name || null,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
    ).pipe(map(() => void 0));
  }

  updateWorkflowStepSignature(
    workOrderId: string,
    stepId: string,
    signature: WorkOrderClientVisitSignature | null
  ): Observable<void> {
    const stepRef = doc(this.firestore, 'workOrder', workOrderId, 'workflowSteps', stepId);

    return from(
      setDoc(
        stepRef,
        {
          clientVisitSignature: signature ? this.removeUndefinedFields(signature) : null,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
    ).pipe(map(() => void 0));
  }

  deleteWorkOrder(workOrderId: string): Observable<void> {
    return from(this.deleteWorkOrderInternal(workOrderId));
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
      observerName: data['observerName'] ? String(data['observerName']) : undefined,
      observationDate: this.toDate(data['observationDate']),
      cableResistance: data['cableResistance'] != null ? Number(data['cableResistance']) : undefined,
      impartiality: (data['impartiality'] as workOrder['impartiality']) ?? undefined,
      createdUser: String(data['createdUser'] ?? ''),
      createdUserName: data['createdUserName'] ? String(data['createdUserName']) : undefined,
      active: Boolean(data['active']),
      status: (data['status'] as workOrder['status']) ?? 'pending',
      currentStepId: data['currentStepId'] != null ? String(data['currentStepId']) : null,
      currentStepName: data['currentStepName'] != null ? String(data['currentStepName']) : null,
      updatedAt: this.toDate(data['updatedAt']),
    };
  }

  private async deleteWorkOrderInternal(workOrderId: string): Promise<void> {
    await this.deleteSubcollectionDocs(workOrderId, 'workflowSteps');
    await this.deleteSubcollectionDocs(workOrderId, 'equipments');
    await deleteDoc(doc(this.firestore, 'workOrder', workOrderId));
  }

  private async deleteSubcollectionDocs(
    workOrderId: string,
    subcollectionName: 'workflowSteps' | 'equipments'
  ): Promise<void> {
    const subcollectionRef = collection(this.firestore, 'workOrder', workOrderId, subcollectionName);
    const snapshot = await getDocs(subcollectionRef);

    if (snapshot.empty) {
      return;
    }

    const batch = writeBatch(this.firestore);
    snapshot.docs.forEach((docSnapshot) => batch.delete(docSnapshot.ref));
    await batch.commit();
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
      completedByUserId: data['completedByUserId']
        ? String(data['completedByUserId'])
        : undefined,
      completedByUserName: data['completedByUserName']
        ? String(data['completedByUserName'])
        : undefined,
      observations: data['observations'] ? String(data['observations']) : undefined,
      clientVisitSignature: this.toClientVisitSignature(
        data['clientVisitSignature'] as Record<string, unknown> | undefined
      ),
      startedAt: this.toDate(data['startedAt']),
      completedAt: this.toDate(data['completedAt']),
      active: Boolean(data['active']),
      createdAt: this.toDate(data['createdAt']) ?? new Date(),
      updatedAt: this.toDate(data['updatedAt']),
    };
  }

  private toClientVisitSignature(
    data: Record<string, unknown> | undefined
  ): WorkOrderClientVisitSignature | undefined {
    if (!data) {
      return undefined;
    }

    return {
      signedByName: String(data['signedByName'] ?? ''),
      signedByRole: data['signedByRole'] ? String(data['signedByRole']) : undefined,
      signedAt: this.toDate(data['signedAt']),
      observations: data['observations'] ? String(data['observations']) : undefined,
      confirmedVisit: Boolean(data['confirmedVisit']),
      signatureDataUrl: String(data['signatureDataUrl'] ?? ''),
      updatedByUserId: data['updatedByUserId'] ? String(data['updatedByUserId']) : undefined,
      updatedByUserName: data['updatedByUserName'] ? String(data['updatedByUserName']) : undefined,
      updatedAt: this.toDate(data['updatedAt']),
    };
  }

  setDefaultEquipment(workOrderId: string, newDefaultId: string, allEquipmentIds: string[]): Observable<void> {
    const batch = writeBatch(this.firestore);
    allEquipmentIds.forEach((id) => {
      const ref = doc(this.firestore, 'workOrder', workOrderId, 'equipments', id);
      batch.update(ref, { isDefault: id === newDefaultId, updatedAt: serverTimestamp() });
    });
    return from(batch.commit()).pipe(map(() => void 0));
  }

  updateEquipmentVoltage(workOrderId: string, equipmentId: string, voltage: string): Observable<void> {
    const equipmentRef = doc(this.firestore, 'workOrder', workOrderId, 'equipments', equipmentId);
    return from(
      setDoc(
        equipmentRef,
        {
          equipmentVoltage: voltage,
          frecuency: deleteField(),
          medition_interval: deleteField(),
          precition: deleteField(),
          especify_equipment: deleteField(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
    );
  }

  private toWorkOrderEquipment(id: string, data: Record<string, unknown>): workOrderEquipment {
    return {
      idDoc: id,
      workOrderId: String(data['workOrderId'] ?? ''),
      equipmentId: String(data['equipmentId'] ?? ''),
      equipmentName: data['equipmentName'] ? String(data['equipmentName']) : undefined,
      equipmentType: data['equipmentType'] ? String(data['equipmentType']) : undefined,
      equipmentBrand: data['equipmentBrand'] ? String(data['equipmentBrand']) : undefined,
      equipmentModel: data['equipmentModel'] ? String(data['equipmentModel']) : undefined,
      equipmentNs: data['equipmentNs'] ? String(data['equipmentNs']) : undefined,
      equipmentSerialNumber: data['equipmentSerialNumber']
        ? String(data['equipmentSerialNumber'])
        : undefined,
      equipmentFrecuency: data['equipmentFrecuency']
        ? String(data['equipmentFrecuency'])
        : data['frecuency']
          ? String(data['frecuency'])
          : undefined,
      equipmentMeditionInterval: data['equipmentMeditionInterval']
        ? String(data['equipmentMeditionInterval'])
        : data['medition_interval']
          ? String(data['medition_interval'])
          : undefined,
      equipmentPrecition: data['equipmentPrecition']
        ? String(data['equipmentPrecition'])
        : data['precition']
          ? String(data['precition'])
          : undefined,
      equipmentSpecifyEquipment: data['equipmentSpecifyEquipment']
        ? String(data['equipmentSpecifyEquipment'])
        : data['especify_equipment']
          ? String(data['especify_equipment'])
          : undefined,
      equipmentVoltage: data['equipmentVoltage'] ? String(data['equipmentVoltage']) : undefined,
      promedioFC: data['promedioFC'] != null ? Number(data['promedioFC']) : undefined,
      isDefault: data['isDefault'] === true,
      active: Boolean(data['active']),
      createdAt: this.toDate(data['createdAt']) ?? new Date(),
      updatedAt: this.toDate(data['updatedAt']),
    };
  }

  private toPoint(id: string, data: Record<string, unknown>): Point {
    return {
      idDoc: id,
      pointNumber: Number(data['pointNumber'] ?? 0),
      location: String(data['location'] ?? ''),
      electrodeType: (data['electrodeType'] as Point['electrodeType']) ?? 'unique',
      hasLightningRod: Boolean(data['hasLightningRod']),
      lightningRodHeight:
        typeof data['lightningRodHeight'] === 'number' ? data['lightningRodHeight'] : undefined,
      protectionRadius:
        typeof data['protectionRadius'] === 'number' ? data['protectionRadius'] : undefined,
      systemType: data['systemType'] ? String(data['systemType']) : undefined,
      temperature: typeof data['temperature'] === 'number' ? data['temperature'] : undefined,
      humidity: typeof data['humidity'] === 'number' ? data['humidity'] : undefined,
      measurementCondition:
        (data['measurementCondition'] as Point['measurementCondition']) ?? 'dry',
      soilType: (data['soilType'] as Point['soilType']) ?? 'soil',
      startTime: data['startTime'] ? String(data['startTime']) : undefined,
      endTime: data['endTime'] ? String(data['endTime']) : undefined,
      measurementData: (data['measurementData'] as PointMeasurementData) ?? {},
      voltageStatus: data['voltageStatus']
        ? (data['voltageStatus'] as Point['voltageStatus'])
        : undefined,
      hasContinuity:
        typeof data['hasContinuity'] === 'boolean' ? data['hasContinuity'] : undefined,
      generatorSources: (data['generatorSources'] as Point['generatorSources']) ?? undefined,
      connectedEquipment:
        (data['connectedEquipment'] as PointConnectedEquipment[]) ?? [],
      observations: data['observations'] ? String(data['observations']) : undefined,
      createdBy: String(data['createdBy'] ?? ''),
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

    if (value instanceof Date || value instanceof Timestamp) {
      return value;
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
