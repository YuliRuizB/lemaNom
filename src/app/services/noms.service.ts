import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
} from '@angular/fire/firestore';
import { Observable, from, map } from 'rxjs';

import { Noms } from '../interfaces/noms.interface';

@Injectable({ providedIn: 'root' })
export class NomsService {
  private firestore = inject(Firestore);

  createNorm(data: Omit<Noms, 'idDoc' | 'createdAt' | 'updatedAt'>): Observable<void> {
    const ref = collection(this.firestore, 'norms');
    const payload: Record<string, any> = {
      name: data.name,
      code: data.code,
      prefix: data.prefix,
      nomCategoryId: data.nomCategoryId,
      active: data.active,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (data.description)             payload['description']             = data.description;
    if (data.nomCategoryName)         payload['nomCategoryName']         = data.nomCategoryName;
    if (data.nomCategoryServiceId)    payload['nomCategoryServiceId']    = data.nomCategoryServiceId;
    if (data.nomCategoryServiceName)  payload['nomCategoryServiceName']  = data.nomCategoryServiceName;

    return from(addDoc(ref, payload)).pipe(map(() => void 0));
  }

  updateNorm(idDoc: string, data: Omit<Noms, 'idDoc' | 'createdAt'>): Observable<void> {
    const normRef = doc(this.firestore, 'norms', idDoc);
    const payload: Record<string, any> = {
      name: data.name,
      code: data.code,
      prefix: data.prefix,
      nomCategoryId: data.nomCategoryId,
      active: data.active,
      updatedAt: serverTimestamp(),
    };
    if (data.description)             payload['description']             = data.description;
    if (data.nomCategoryName)         payload['nomCategoryName']         = data.nomCategoryName;
    if (data.nomCategoryServiceId)    payload['nomCategoryServiceId']    = data.nomCategoryServiceId;
    if (data.nomCategoryServiceName)  payload['nomCategoryServiceName']  = data.nomCategoryServiceName;
    return from(setDoc(normRef, payload, { merge: true }));
  }

  deleteNorm(idDoc: string): Observable<void> {
    const normRef = doc(this.firestore, 'norms', idDoc);
    return from(deleteDoc(normRef));
  }

  getNormByServiceId(serviceId: string): Observable<Noms | null> {
    const ref = collection(this.firestore, 'norms');
    const q = query(ref, where('nomCategoryServiceId', '==', serviceId), limit(1));

    return from(getDocs(q)).pipe(
      map((snapshot) => {
        if (snapshot.empty) return null;
        const d = snapshot.docs[0];
        return this.toNorm(d.id, d.data());
      })
    );
  }

  getNorms(): Observable<Noms[]> {
    const ref = collection(this.firestore, 'norms');
    const q = query(ref, limit(500));

    return from(getDocs(q)).pipe(
      map((snapshot) =>
        snapshot.docs
          .map((d) => this.toNorm(d.id, d.data()))
          .sort((a, b) => a.code.localeCompare(b.code))
      )
    );
  }

  private toNorm(id: string, data: Record<string, any>): Noms {
    return {
      idDoc: id,
      name: data['name'],
      code: data['code'],
      prefix: data['prefix'] ?? '',
      description: data['description'],
      nomCategoryId: data['nomCategoryId'],
      nomCategoryName: data['nomCategoryName'],
      nomCategoryServiceId:   data['nomCategoryServiceId'],
      nomCategoryServiceName: data['nomCategoryServiceName'],
      active: data['active'],
      createdAt: data['createdAt'] instanceof Timestamp ? data['createdAt'].toDate() : data['createdAt'],
      updatedAt: data['updatedAt'] instanceof Timestamp ? data['updatedAt'].toDate() : data['updatedAt'],
    };
  }
}
