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
  updateDoc,
} from '@angular/fire/firestore';
import { Observable, from, map } from 'rxjs';

import { nomCategory, nomCategoryServices } from '../interfaces/nomCategory.interface';

@Injectable({ providedIn: 'root' })
export class NomCategoryService {
  private firestore = inject(Firestore);

  getCategories(): Observable<nomCategory[]> {
    const categoriesRef = collection(this.firestore, 'nomCategory');
    const categoriesQuery = query(categoriesRef, limit(500));

    return from(getDocs(categoriesQuery)).pipe(
      map((snapshot) =>
        snapshot.docs
          .map((categoryDoc) => this.toCategory(categoryDoc.id, categoryDoc.data()))
          .sort((a, b) => a.name.localeCompare(b.name))
      )
    );
  }

  createCategory(data: Pick<nomCategory, 'name' | 'prefix' | 'active'>): Observable<string> {
    const categoriesRef = collection(this.firestore, 'nomCategory');

    return from(
      addDoc(categoriesRef, {
        name: data.name,
        prefix: data.prefix,
        active: data.active,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    ).pipe(map((docRef) => docRef.id));
  }

  updateCategory(categoryId: string, data: Partial<nomCategory>): Observable<void> {
    const categoryRef = doc(this.firestore, 'nomCategory', categoryId);

    return from(
      updateDoc(categoryRef, {
        ...this.removeUndefinedFields(data),
        updatedAt: serverTimestamp(),
      })
    );
  }

  deleteCategory(categoryId: string): Observable<void> {
    const categoryRef = doc(this.firestore, 'nomCategory', categoryId);
    return from(deleteDoc(categoryRef));
  }

  getCategoryServicesCount(categoryId: string): Observable<number> {
    const servicesRef = collection(this.firestore, 'nomCategory', categoryId, 'nomCategoryServices');
    return from(getDocs(servicesRef)).pipe(map((snapshot) => snapshot.size));
  }

  getCategoryServices(categoryId: string): Observable<nomCategoryServices[]> {
    const servicesRef = collection(this.firestore, 'nomCategory', categoryId, 'nomCategoryServices');

    return from(getDocs(servicesRef)).pipe(
      map((snapshot) =>
        snapshot.docs
          .map((serviceDoc) => this.toCategoryService(serviceDoc.id, serviceDoc.data()))
          .sort((a, b) => {
            if (a.codeService !== b.codeService) {
              return a.codeService - b.codeService;
            }

            return a.name.localeCompare(b.name);
          })
      )
    );
  }

  createCategoryService(
    categoryId: string,
    data: Pick<nomCategoryServices, 'name' | 'prefix' | 'codeService' | 'codeCustomer' | 'year' | 'active'>
  ): Observable<string> {
    const servicesRef = collection(this.firestore, 'nomCategory', categoryId, 'nomCategoryServices');

    return from(
      addDoc(servicesRef, {
        name: data.name,
        prefix: data.prefix,
        codeService: data.codeService,
        codeCustomer: data.codeCustomer,
        year: data.year,
        active: data.active,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    ).pipe(map((docRef) => docRef.id));
  }

  private toCategory(id: string, data: Record<string, unknown>): nomCategory {
    return {
      idDoc: id,
      name: String(data['name'] ?? ''),
      prefix: String(data['prefix'] ?? ''),
      active: Boolean(data['active']),
      createdAt:
        data['createdAt'] instanceof Timestamp ? data['createdAt'].toDate() : (data['createdAt'] as Date),
      updatedAt:
        data['updatedAt'] instanceof Timestamp
          ? data['updatedAt'].toDate()
          : (data['updatedAt'] as Date | undefined),
    };
  }

  private toCategoryService(id: string, data: Record<string, unknown>): nomCategoryServices {
    return {
      idDoc: id,
      name: String(data['name'] ?? ''),
      prefix: String(data['prefix'] ?? ''),
      codeService: Number(data['codeService'] ?? 0),
      codeCustomer: String(data['codeCustomer'] ?? ''),
      year: Number(data['year'] ?? 0),
      active: Boolean(data['active']),
      createdAt:
        data['createdAt'] instanceof Timestamp ? data['createdAt'].toDate() : (data['createdAt'] as Date),
      updatedAt:
        data['updatedAt'] instanceof Timestamp
          ? data['updatedAt'].toDate()
          : (data['updatedAt'] as Date | undefined),
    };
  }

  private removeUndefinedFields<T>(value: T): T {
    if (Array.isArray(value)) {
      return value.map((item) => this.removeUndefinedFields(item)) as T;
    }

    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value)
          .filter(([, entryValue]) => entryValue !== undefined)
          .map(([key, entryValue]) => [key, this.removeUndefinedFields(entryValue)])
      ) as T;
    }

    return value;
  }
}
