import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
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

import { Customer } from '../interfaces/customer.interface';

@Injectable({ providedIn: 'root' })
export class CustomerService {
  private firestore = inject(Firestore);
  private storage = inject(Storage);

  updateCustomer(id: string, customerData: Partial<Customer>): Observable<void> {
    const customerRef = doc(this.firestore, 'customer', id);

    return from(
      setDoc(
        customerRef,
        {
          ...this.removeUndefinedFields(customerData),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
    );
  }

  getCustomerById(id: string): Observable<Customer | null> {
    const customerRef = doc(this.firestore, 'customer', id);

    return from(getDoc(customerRef)).pipe(
      map((snapshot) => {
        if (!snapshot.exists()) {
          return null;
        }

        return {
          idDoc: snapshot.id,
          ...snapshot.data(),
        } as Customer;
      })
    );
  }

  validateCustomerCode(code: string): Observable<Customer | null> {
    const normalizedCode = code.trim().toUpperCase();
    const customersRef = collection(this.firestore, 'customer');
    const customerQuery = query(customersRef, where('code', '==', normalizedCode), limit(1));

    return from(getDocs(customerQuery)).pipe(
      map((snapshot) => {
        if (snapshot.empty) {
          return null;
        }

        const doc = snapshot.docs[0];
        const customer = {
          idDoc: doc.id,
          ...doc.data(),
        } as Customer;

        if (!customer.active) {
          return null;
        }

        return customer;
      })
    );
  }

  uploadCustomerLogo(customerId: string, file: File): Observable<string> {
    const extension = file.name.split('.').pop() || 'png';
    const storageRef = ref(this.storage, `customer-logos/${customerId}/logo.${extension}`);

    return from(uploadBytes(storageRef, file)).pipe(
      map((result) => result.ref),
      switchMap((storageRefResult) => from(getDownloadURL(storageRefResult)))
    );
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
