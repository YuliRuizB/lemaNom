import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
} from '@angular/fire/firestore';
import { Storage, getDownloadURL, ref, uploadBytes } from '@angular/fire/storage';
import { Observable, from, map, switchMap } from 'rxjs';

import { User } from '../interfaces/user.interface';

@Injectable({ providedIn: 'root' })
export class UserService {
  private firestore = inject(Firestore);
  private storage = inject(Storage);

  updateUser(uid: string, userData: Partial<User>) {
    const userRef = doc(this.firestore, 'user', uid);

    return from(
      setDoc(
        userRef,
        {
          ...this.removeUndefinedFields(userData),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
    );
  }

  createUser(uid: string, userData: Omit<User, 'idDoc' | 'createdAt'>) {
    const userRef = doc(this.firestore, 'user', uid);

    return from(
      setDoc(userRef, {
        ...this.removeUndefinedFields(userData),
        createdAt: serverTimestamp(),
      })
    );
  }

  getUsers(): Observable<User[]> {
    const usersRef = collection(this.firestore, 'user');
    const usersQuery = query(usersRef, limit(200));

    return from(getDocs(usersQuery)).pipe(
      map((snapshot) =>
        snapshot.docs
          .map((d) => this.toUser(d.id, d.data()))
          .sort((a, b) => a.firstName.localeCompare(b.firstName))
      )
    );
  }

  getUsersByRole(roleId: string): Observable<User[]> {
    const usersRef = collection(this.firestore, 'user');
    const q = query(usersRef, where('roleId', '==', roleId), limit(200));
    return from(getDocs(q)).pipe(
      map((snapshot) =>
        snapshot.docs
          .map((d) => this.toUser(d.id, d.data()))
          .sort((a, b) => a.firstName.localeCompare(b.firstName))
      )
    );
  }

  getUserById(uid: string) {
    const userRef = doc(this.firestore, 'user', uid);

    return from(getDoc(userRef)).pipe(
      map((snapshot) => {
        if (!snapshot.exists()) {
          return null;
        }

        return {
          idDoc: snapshot.id,
          ...snapshot.data(),
        } as User;
      })
    );
  }

  deleteUserDocument(uid: string) {
    const userRef = doc(this.firestore, 'user', uid);
    return from(deleteDoc(userRef));
  }

  uploadUserAvatar(uid: string, file: File) {
    const extension = file.name.split('.').pop() || 'png';
    const storageRef = ref(this.storage, `user-avatars/${uid}/avatar.${extension}`);

    return from(uploadBytes(storageRef, file)).pipe(
      map((result) => result.ref),
      switchMap((storageRefResult) => from(getDownloadURL(storageRefResult)))
    );
  }

  private toUser(id: string, data: Record<string, any>): User {
    return {
      idDoc: id,
      firstName: data['firstName'],
      lastName: data['lastName'],
      displayName: data['displayName'],
      email: data['email'],
      phone: data['phone'],
      photoUrl: data['photoUrl'],
      customerId: data['customerId'],
      customerName: data['customerName'],
      roleId: data['roleId'],
      roleName: data['roleName'],
      active: data['active'],
      approved: data['approved'],
      termsAccepted: data['termsAccepted'],
      termsAcceptedAt: data['termsAcceptedAt'] instanceof Timestamp ? data['termsAcceptedAt'].toDate() : data['termsAcceptedAt'],
      createdAt: data['createdAt'] instanceof Timestamp ? data['createdAt'].toDate() : data['createdAt'],
      updatedAt: data['updatedAt'] instanceof Timestamp ? data['updatedAt'].toDate() : data['updatedAt'],
      lastLoginAt: data['lastLoginAt'] instanceof Timestamp ? data['lastLoginAt'].toDate() : data['lastLoginAt'],
    };
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
