import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  Timestamp,
  addDoc,
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
import { Storage, deleteObject, getDownloadURL, ref, uploadBytes } from '@angular/fire/storage';
import { Observable, from, map, switchMap } from 'rxjs';

import { User, UserAccreditation, UserQualification } from '../interfaces/user.interface';

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
      map((snapshot) => (snapshot.exists() ? this.toUser(snapshot.id, snapshot.data()) : null))
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

  getUserAccreditations(uid: string): Observable<UserAccreditation[]> {
    const accreditationsRef = collection(this.firestore, 'user', uid, 'accreditations');
    const accreditationsQuery = query(accreditationsRef, limit(200));

    return from(getDocs(accreditationsQuery)).pipe(
      map((snapshot) =>
        snapshot.docs
          .map((d) => this.toUserAccreditation(d.id, d.data()))
          .sort((a, b) => (b.createdAt?.getTime?.() ?? 0) - (a.createdAt?.getTime?.() ?? 0))
      )
    );
  }

  uploadUserAccreditationFile(uid: string, file: File): Observable<{ fileUrl: string; fileName: string }> {
    const extension = file.name.split('.').pop() || 'bin';
    const safeBaseName = (file.name.replace(/\.[^/.]+$/, '') || 'archivo')
      .replace(/[^\w.-]+/g, '_');
    const storageRef = ref(
      this.storage,
      `user-avatars/${uid}/accreditations/${Date.now()}-${safeBaseName}.${extension}`
    );

    return from(uploadBytes(storageRef, file)).pipe(
      map((result) => result.ref),
      switchMap((storageRefResult) =>
        from(getDownloadURL(storageRefResult)).pipe(
          map((fileUrl) => ({ fileUrl, fileName: file.name }))
        )
      )
    );
  }

  createUserAccreditation(
    uid: string,
    data: Pick<UserAccreditation, 'name' | 'description' | 'fileUrl' | 'fileName' | 'active'>
  ): Observable<string> {
    const accreditationsRef = collection(this.firestore, 'user', uid, 'accreditations');

    return from(
      addDoc(accreditationsRef, {
        ...this.removeUndefinedFields(data),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    ).pipe(map((docRef) => docRef.id));
  }

  updateUserAccreditation(
    uid: string,
    accreditationId: string,
    data: Partial<Pick<UserAccreditation, 'name' | 'description' | 'fileUrl' | 'fileName' | 'active'>>
  ) {
    const accreditationRef = doc(this.firestore, 'user', uid, 'accreditations', accreditationId);

    return from(
      setDoc(
        accreditationRef,
        {
          ...this.removeUndefinedFields(data),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
    );
  }

  deleteUserAccreditation(uid: string, accreditationId: string) {
    const accreditationRef = doc(this.firestore, 'user', uid, 'accreditations', accreditationId);
    return from(deleteDoc(accreditationRef));
  }

  deleteStorageFile(fileUrl: string) {
    const fileRef = ref(this.storage, fileUrl);
    return from(deleteObject(fileRef));
  }

  getUserQualifications(uid: string): Observable<UserQualification[]> {
    const qualificationsRef = collection(this.firestore, 'user', uid, 'qualifications');
    const qualificationsQuery = query(qualificationsRef, limit(200));

    return from(getDocs(qualificationsQuery)).pipe(
      map((snapshot) =>
        snapshot.docs
          .map((d) => this.toUserQualification(d.id, d.data()))
          .sort((a, b) => (b.createdAt?.getTime?.() ?? 0) - (a.createdAt?.getTime?.() ?? 0))
      )
    );
  }

  uploadUserQualificationFile(uid: string, file: File): Observable<{ fileUrl: string; fileName: string }> {
    const extension = file.name.split('.').pop() || 'bin';
    const safeBaseName = (file.name.replace(/\.[^/.]+$/, '') || 'archivo').replace(/[^\w.-]+/g, '_');
    const storageRef = ref(
      this.storage,
      `user-avatars/${uid}/qualifications/${Date.now()}-${safeBaseName}.${extension}`
    );

    return from(uploadBytes(storageRef, file)).pipe(
      map((result) => result.ref),
      switchMap((storageRefResult) =>
        from(getDownloadURL(storageRefResult)).pipe(map((fileUrl) => ({ fileUrl, fileName: file.name })))
      )
    );
  }

  createUserQualification(
    uid: string,
    data: Pick<UserQualification, 'name' | 'description' | 'fileUrl' | 'fileName' | 'active'>
  ): Observable<string> {
    const qualificationsRef = collection(this.firestore, 'user', uid, 'qualifications');

    return from(
      addDoc(qualificationsRef, {
        ...this.removeUndefinedFields(data),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    ).pipe(map((docRef) => docRef.id));
  }

  updateUserQualification(
    uid: string,
    qualificationId: string,
    data: Partial<Pick<UserQualification, 'name' | 'description' | 'fileUrl' | 'fileName' | 'active'>>
  ) {
    const qualificationRef = doc(this.firestore, 'user', uid, 'qualifications', qualificationId);

    return from(
      setDoc(
        qualificationRef,
        {
          ...this.removeUndefinedFields(data),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
    );
  }

  deleteUserQualification(uid: string, qualificationId: string) {
    const qualificationRef = doc(this.firestore, 'user', uid, 'qualifications', qualificationId);
    return from(deleteDoc(qualificationRef));
  }

  private toUser(id: string, data: Record<string, any>): User {
    return {
      idDoc: id,
      prefix: data['prefix'],
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

  private toUserAccreditation(id: string, data: Record<string, any>): UserAccreditation {
    return {
      idDoc: id,
      name: data['name'],
      description: data['description'],
      fileUrl: data['fileUrl'],
      fileName: data['fileName'],
      active: data['active'] ?? true,
      createdAt:
        data['createdAt'] instanceof Timestamp
          ? data['createdAt'].toDate()
          : (data['createdAt'] ?? new Date()),
      updatedAt: data['updatedAt'] instanceof Timestamp ? data['updatedAt'].toDate() : data['updatedAt'],
    };
  }

  private toUserQualification(id: string, data: Record<string, any>): UserQualification {
    return {
      idDoc: id,
      name: data['name'],
      description: data['description'],
      fileUrl: data['fileUrl'],
      fileName: data['fileName'],
      active: data['active'] ?? true,
      createdAt:
        data['createdAt'] instanceof Timestamp
          ? data['createdAt'].toDate()
          : (data['createdAt'] ?? new Date()),
      updatedAt: data['updatedAt'] instanceof Timestamp ? data['updatedAt'].toDate() : data['updatedAt'],
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
