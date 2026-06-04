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
  where,
} from '@angular/fire/firestore';
import { Observable, from, map } from 'rxjs';

import { Role } from '../interfaces/role.interface';

@Injectable({ providedIn: 'root' })
export class RoleService {
  private firestore = inject(Firestore);

  getRoles(): Observable<Role[]> {
    const rolesRef = collection(this.firestore, 'role');
    const rolesQuery = query(rolesRef, limit(100));

    return from(getDocs(rolesQuery)).pipe(
      map((snapshot) =>
        snapshot.docs
          .map((doc) => this.toRole(doc.id, doc.data()))
          .sort((a, b) => a.name.localeCompare(b.name))
      )
    );
  }

  private toRole(id: string, data: Record<string, any>): Role {
    return {
      idDoc: id,
      name: data['name'],
      active: data['active'],
      description: data['description'],
      createdAt: data['createdAt'] instanceof Timestamp ? data['createdAt'].toDate() : data['createdAt'],
      updatedAt: data['updatedAt'] instanceof Timestamp ? data['updatedAt'].toDate() : data['updatedAt'],
    };
  }

  updateRole(idDoc: string, data: Pick<Role, 'name' | 'description'>): Observable<void> {
    const roleRef = doc(this.firestore, 'role', idDoc);
    return from(setDoc(roleRef, { ...data, updatedAt: serverTimestamp() }, { merge: true }));
  }

  createRole(data: Pick<Role, 'name' | 'description' | 'active'>): Observable<Role> {
    const rolesRef = collection(this.firestore, 'role');

    return from(
      addDoc(rolesRef, {
        ...data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    ).pipe(
      map((docRef) => ({ idDoc: docRef.id, ...data, createdAt: new Date(), updatedAt: new Date() }))
    );
  }

  getActiveRoles(): Observable<Role[]> {
    const rolesRef = collection(this.firestore, 'role');
    const rolesQuery = query(rolesRef, where('active', '==', true), limit(25));

    return from(getDocs(rolesQuery)).pipe(
      map((snapshot) =>
        snapshot.docs
          .map((doc) => this.toRole(doc.id, doc.data()))
          .sort((a, b) => a.name.localeCompare(b.name))
      )
    );
  }
}
