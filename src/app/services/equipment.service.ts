import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  Timestamp,
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from '@angular/fire/firestore';
import { Storage, getDownloadURL, ref, uploadBytes } from '@angular/fire/storage';
import { Observable, from, map, switchMap } from 'rxjs';

import { CalibrationRecord, CalibrationRow, EquipmentCertificate, RepeatabilityRecord, UserReading, equipment } from '../interfaces/meditionType.interface';

@Injectable({ providedIn: 'root' })
export class EquipmentService {
  private firestore = inject(Firestore);
  private storage = inject(Storage);

  getEquipments(): Observable<equipment[]> {
    const ref = collection(this.firestore, 'equipment');
    const q = query(ref, limit(200));

    return from(getDocs(q)).pipe(
      map((snapshot) =>
        snapshot.docs
          .map((d) => this.toEquipment(d.id, d.data()))
          .sort((a, b) => a.name.localeCompare(b.name))
      )
    );
  }

  getEquipmentById(idDoc: string): Observable<equipment | null> {
    const docRef = doc(this.firestore, 'equipment', idDoc);

    return from(getDoc(docRef)).pipe(
      map((snapshot) => {
        if (!snapshot.exists()) return null;
        return this.toEquipment(snapshot.id, snapshot.data());
      })
    );
  }

  createEquipment(data: Omit<equipment, 'idDoc' | 'createdAt' | 'updatedAt' | 'lastLoginAt'>): Observable<void> {
    const colRef = collection(this.firestore, 'equipment');
    const payload: Record<string, any> = {
      name: data.name,
      identifier: data.identifier,
      ns: data.ns,
      active: data.active,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (data.brand)        payload['brand']        = data.brand;
    if (data.model)        payload['model']        = data.model;
    if (data.range)        payload['range']        = data.range;
    if (data.frecuency)    payload['frecuency']    = data.frecuency;
    if (data.precition)    payload['precition']    = data.precition;
    if (data.especify_equipment) payload['especify_equipment'] = data.especify_equipment;
    if (data.voltage)      payload['voltage']      = data.voltage;
    if (data.customerId)   payload['customerId']   = data.customerId;
    if (data.customerName) payload['customerName'] = data.customerName;

    return from(addDoc(colRef, payload)).pipe(map(() => void 0));
  }

  updateEquipment(
    idDoc: string,
    data: Pick<
      equipment,
      'name' | 'identifier' | 'ns' | 'brand' | 'model' | 'range' | 'frecuency' | 'precition' | 'especify_equipment' | 'voltage' | 'active'
    >
  ): Observable<void> {
    const docRef = doc(this.firestore, 'equipment', idDoc);
    const payload: Record<string, any> = {
      name: data.name,
      identifier: data.identifier,
      ns: data.ns,
      active: data.active,
      updatedAt: serverTimestamp(),
    };
    if (data.brand !== undefined)     payload['brand']     = data.brand || null;
    if (data.model !== undefined)     payload['model']     = data.model || null;
    if (data.range !== undefined)     payload['range']     = data.range || null;
    if (data.frecuency !== undefined) payload['frecuency'] = data.frecuency || null;
    if (data.precition !== undefined) payload['precition'] = data.precition || null;
    if (data.especify_equipment !== undefined) payload['especify_equipment'] = data.especify_equipment || null;
    if (data.voltage !== undefined)   payload['voltage']   = data.voltage || null;

    return from(setDoc(docRef, payload, { merge: true }));
  }

  // ── Certificates (archivos) ──────────────────────────────────────────────

  uploadCertificate(equipmentId: string, file: File): Observable<string> {
    const timestamp = Date.now();
    const storageRef = ref(this.storage, `equipment/${equipmentId}/${timestamp}-${file.name}`);
    return from(uploadBytes(storageRef, file)).pipe(
      switchMap((result) => from(getDownloadURL(result.ref)))
    );
  }

  addCertificateRecord(
    equipmentId: string,
    data: { certificateUrl: string; fileName: string; uploadedBy?: string }
  ): Observable<string> {
    const colRef = collection(this.firestore, 'equipment', equipmentId, 'certificates');
    const payload: Record<string, any> = {
      certificateUrl: data.certificateUrl,
      fileName: data.fileName,
      uploadedAt: serverTimestamp(),
    };
    if (data.uploadedBy) payload['uploadedBy'] = data.uploadedBy;
    return from(addDoc(colRef, payload)).pipe(map((d) => d.id));
  }

  getCertificates(equipmentId: string): Observable<EquipmentCertificate[]> {
    const colRef = collection(this.firestore, 'equipment', equipmentId, 'certificates');
    const q = query(colRef, orderBy('uploadedAt', 'desc'));
    return from(getDocs(q)).pipe(
      map((snapshot) => snapshot.docs.map((d) => this.toCertificate(d.id, d.data())))
    );
  }

  // ── Calibrations (historial) ─────────────────────────────────────────────

  addCalibrationRecord(
    equipmentId: string,
    data: Omit<CalibrationRecord, 'idDoc' | 'createdAt'>
  ): Observable<string> {
    const colRef = collection(this.firestore, 'equipment', equipmentId, 'calibrations');
    const payload: Record<string, any> = {
      certNumber:         data.certNumber,
      calibrationDate:    data.calibrationDate,
      expirationDate:     data.expirationDate ?? null,
      voltage:            data.voltage,
      calibrationRows25v: data.calibrationRows25v,
      calibrationRows50v: data.calibrationRows50v,
      createdAt:          serverTimestamp(),
    };
    if (data.createdBy) payload['createdBy'] = data.createdBy;
    return from(addDoc(colRef, payload)).pipe(map((d) => d.id));
  }

  updateCalibrationRecord(
    equipmentId: string,
    recordId: string,
    data: Omit<CalibrationRecord, 'idDoc' | 'createdAt' | 'createdBy'>
  ): Observable<void> {
    const docRef = doc(this.firestore, 'equipment', equipmentId, 'calibrations', recordId);
    return from(setDoc(docRef, {
      certNumber:         data.certNumber,
      calibrationDate:    data.calibrationDate,
      expirationDate:     data.expirationDate ?? null,
      voltage:            data.voltage,
      calibrationRows25v: data.calibrationRows25v,
      calibrationRows50v: data.calibrationRows50v,
    }, { merge: true }));
  }

  getCalibrationRecords(equipmentId: string): Observable<CalibrationRecord[]> {
    const colRef = collection(this.firestore, 'equipment', equipmentId, 'calibrations');
    const q = query(colRef, orderBy('createdAt', 'desc'));
    return from(getDocs(q)).pipe(
      map((snapshot) => snapshot.docs.map((d) => this.toCalibrationRecord(d.id, d.data())))
    );
  }

  // ── Repeatability & Reproducibility ─────────────────────────────────────

  addRepeatabilityRecord(
    equipmentId: string,
    data: { userReadings: UserReading[]; createdBy?: string }
  ): Observable<string> {
    const colRef = collection(this.firestore, 'equipment', equipmentId, 'repeatability');
    const payload: Record<string, any> = {
      userReadings: data.userReadings,
      createdAt: serverTimestamp(),
    };
    if (data.createdBy) payload['createdBy'] = data.createdBy;
    return from(addDoc(colRef, payload)).pipe(map((d) => d.id));
  }

  updateRepeatabilityRecord(
    equipmentId: string,
    recordId: string,
    userReadings: UserReading[]
  ): Observable<void> {
    const docRef = doc(this.firestore, 'equipment', equipmentId, 'repeatability', recordId);
    return from(setDoc(docRef, { userReadings }, { merge: true }));
  }

  getRepeatabilityRecords(equipmentId: string): Observable<RepeatabilityRecord[]> {
    const colRef = collection(this.firestore, 'equipment', equipmentId, 'repeatability');
    const q = query(colRef, orderBy('createdAt', 'desc'));
    return from(getDocs(q)).pipe(
      map((snapshot) => snapshot.docs.map((d) => this.toRepeatabilityRecord(d.id, d.data())))
    );
  }

  // ── Private mappers ──────────────────────────────────────────────────────

  private toEquipment(id: string, data: Record<string, any>): equipment {
    return {
      idDoc: id,
      name: data['name'],
      identifier: data['identifier'],
      brand: data['brand'],
      model: data['model'],
      ns: data['ns'],
      range: data['range'],
      frecuency: data['frecuency'],
      precition: data['precition'],
      especify_equipment: data['especify_equipment'],
      voltage: data['voltage'],
      customerId: data['customerId'],
      customerName: data['customerName'],
      active: data['active'],
      certificateUrl: data['certificateUrl'],
      createdAt: data['createdAt'] instanceof Timestamp ? data['createdAt'].toDate() : data['createdAt'],
      updatedAt: data['updatedAt'] instanceof Timestamp ? data['updatedAt'].toDate() : data['updatedAt'],
    };
  }

  private toCertificate(id: string, data: Record<string, any>): EquipmentCertificate {
    return {
      idDoc: id,
      certificateUrl: data['certificateUrl'],
      fileName: data['fileName'],
      uploadedBy: data['uploadedBy'],
      uploadedAt: data['uploadedAt'] instanceof Timestamp ? data['uploadedAt'].toDate() : data['uploadedAt'],
    };
  }

  private toRepeatabilityRecord(id: string, data: Record<string, any>): RepeatabilityRecord {
    return {
      idDoc: id,
      userReadings: (data['userReadings'] as UserReading[]) || [],
      createdBy: data['createdBy'],
      createdAt: data['createdAt'] instanceof Timestamp ? data['createdAt'].toDate() : data['createdAt'],
    };
  }

  private toCalibrationRecord(id: string, data: Record<string, any>): CalibrationRecord {
    return {
      idDoc: id,
      certNumber:         data['certNumber'] ?? '',
      calibrationDate:    data['calibrationDate'] ?? '',
      expirationDate:     data['expirationDate'] ?? undefined,
      voltage:            data['voltage'] ?? 'Ambos',
      calibrationRows25v: (data['calibrationRows25v'] as CalibrationRow[]) || [],
      calibrationRows50v: (data['calibrationRows50v'] as CalibrationRow[]) || [],
      createdBy:          data['createdBy'],
      createdAt: data['createdAt'] instanceof Timestamp ? data['createdAt'].toDate() : data['createdAt'],
    };
  }
}
