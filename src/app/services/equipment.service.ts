import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  Timestamp,
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
} from '@angular/fire/firestore';
import { Storage, getDownloadURL, ref, uploadBytes } from '@angular/fire/storage';
import { Observable, from, map, switchMap } from 'rxjs';

import { equipment } from '../interfaces/meditionType.interface';

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
    if (data.customerId)   payload['customerId']   = data.customerId;
    if (data.customerName) payload['customerName'] = data.customerName;

    return from(addDoc(colRef, payload)).pipe(map(() => void 0));
  }

  updateEquipment(idDoc: string, data: Pick<equipment, 'name' | 'identifier' | 'ns' | 'brand' | 'model' | 'range' | 'active'>): Observable<void> {
    const docRef = doc(this.firestore, 'equipment', idDoc);
    const payload: Record<string, any> = {
      name: data.name,
      identifier: data.identifier,
      ns: data.ns,
      active: data.active,
      updatedAt: serverTimestamp(),
    };
    if (data.brand !== undefined) payload['brand'] = data.brand || null;
    if (data.model !== undefined) payload['model'] = data.model || null;
    if (data.range !== undefined) payload['range'] = data.range || null;

    return from(setDoc(docRef, payload, { merge: true }));
  }

  uploadCertificate(equipmentId: string, file: File): Observable<string> {
    const ext = file.name.split('.').pop() || 'pdf';
    const storageRef = ref(this.storage, `equipment-certificates/${equipmentId}/certificate.${ext}`);

    return from(uploadBytes(storageRef, file)).pipe(
      switchMap((result) => from(getDownloadURL(result.ref)))
    );
  }

  updateCertificateUrl(equipmentId: string, url: string): Observable<void> {
    const docRef = doc(this.firestore, 'equipment', equipmentId);
    return from(setDoc(docRef, { certificateUrl: url, updatedAt: serverTimestamp() }, { merge: true }));
  }

  private toEquipment(id: string, data: Record<string, any>): equipment {
    return {
      idDoc: id,
      name: data['name'],
      identifier: data['identifier'],
      brand: data['brand'],
      model: data['model'],
      ns: data['ns'],
      range: data['range'],
      customerId: data['customerId'],
      customerName: data['customerName'],
      active: data['active'],
      certificateUrl: data['certificateUrl'],
      createdAt: data['createdAt'] instanceof Timestamp ? data['createdAt'].toDate() : data['createdAt'],
      updatedAt: data['updatedAt'] instanceof Timestamp ? data['updatedAt'].toDate() : data['updatedAt'],
    };
  }
}
