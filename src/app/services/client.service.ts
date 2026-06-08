import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  Timestamp,
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  updateDoc,
} from '@angular/fire/firestore';
import { Storage, getDownloadURL, ref, uploadBytes } from '@angular/fire/storage';
import { Observable, forkJoin, from, map, of, switchMap } from 'rxjs';

import { Client, ClientPlant, ClientShift, Witness } from '../interfaces/client.interface';

@Injectable({ providedIn: 'root' })
export class ClientService {
  private firestore = inject(Firestore);
  private storage = inject(Storage);

  addPlant(clientId: string, plant: Omit<ClientPlant, 'idDoc' | 'createdAt' | 'updatedAt'>): Observable<void> {
    const plantsRef = collection(this.firestore, 'client', clientId, 'plants');
    const newPlant: Record<string, any> = {
      name: plant.name,
      active: plant.active,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      shifts: (plant.shifts ?? []).map((s) => ({ ...s })),
    };
    if (plant.description)      newPlant['description']      = plant.description;
    if (plant.contactName)      newPlant['contactName']      = plant.contactName;
    if (plant.contactPosition)  newPlant['contactPosition']  = plant.contactPosition;
    if (plant.contactEmail)     newPlant['contactEmail']     = plant.contactEmail;
    if (plant.contactPhone)     newPlant['contactPhone']     = plant.contactPhone;
    if (plant.street)           newPlant['street']           = plant.street;
    if (plant.exteriorNumber)   newPlant['exteriorNumber']   = plant.exteriorNumber;
    if (plant.interiorNumber)   newPlant['interiorNumber']   = plant.interiorNumber;
    if (plant.colony)           newPlant['colony']           = plant.colony;
    if (plant.municipality)     newPlant['municipality']     = plant.municipality;
    if (plant.state)            newPlant['state']            = plant.state;
    if (plant.country)          newPlant['country']          = plant.country;
    if (plant.postalCode)       newPlant['postalCode']       = plant.postalCode;

    return from(addDoc(plantsRef, newPlant)).pipe(map(() => void 0));
  }

  addWitness(
    clientId: string,
    witness: Omit<Witness, 'idDoc' | 'createdAt' | 'updatedAt'>
  ): Observable<void> {
    const clientRef = doc(this.firestore, 'client', clientId);
    const newWitness: Record<string, any> = {
      idDoc: crypto.randomUUID(),
      name: witness.name,
      lastName: witness.lastName,
      email: witness.email,
      active: witness.active,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (witness.phone) {
      newWitness['phone'] = witness.phone;
    }

    return from(updateDoc(clientRef, { witnesses: arrayUnion(newWitness) }));
  }

  getClientPlants(clientId: string): Observable<ClientPlant[]> {
    const plantsRef = collection(this.firestore, 'client', clientId, 'plants');
    const plantsQuery = query(plantsRef, limit(500));

    return from(getDocs(plantsQuery)).pipe(
      map((snapshot) =>
        snapshot.docs
          .map((plantDoc) => this.toPlant(plantDoc.id, plantDoc.data()))
          .sort((a, b) => a.name.localeCompare(b.name))
      )
    );
  }

  deletePlant(clientId: string, plantId: string): Observable<void> {
    const plantRef = doc(this.firestore, 'client', clientId, 'plants', plantId);
    return from(deleteDoc(plantRef));
  }

  createClient(
    data: Pick<
      Client,
      'clientNumber' | 'name' | 'legalName' | 'rfc' | 'email' | 'phone' | 'active'
    > &
      Partial<Pick<Client, 'customerId' | 'customerName'>> &
      Partial<Pick<Client, 'imageurl'>>
  ): Observable<string> {
    const ref = collection(this.firestore, 'client');
    const payload: Record<string, any> = {
      clientNumber: data.clientNumber,
      name: data.name,
      legalName: data.legalName,
      active: data.active,
      plants: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (data.rfc)   payload['rfc']   = data.rfc;
    if (data.email) payload['email'] = data.email;
    if (data.phone) payload['phone'] = data.phone;
    if (data.customerId) payload['customerId'] = data.customerId;
    if (data.customerName) payload['customerName'] = data.customerName;
    if (data.imageurl) payload['imageurl'] = data.imageurl;

    return from(addDoc(ref, payload)).pipe(map((docRef) => docRef.id));
  }

  updateClient(clientId: string, data: Partial<Client>): Observable<void> {
    const clientRef = doc(this.firestore, 'client', clientId);

    return from(
      updateDoc(clientRef, {
        ...this.removeUndefinedFields(data),
        updatedAt: serverTimestamp(),
      })
    );
  }

  deleteClient(clientId: string): Observable<void> {
    const clientRef = doc(this.firestore, 'client', clientId);
    return from(deleteDoc(clientRef));
  }

  uploadClientImage(clientId: string, file: File): Observable<string> {
    const extension = file.name.split('.').pop() || 'png';
    const storageRef = ref(this.storage, `client-images/${clientId}/image.${extension}`);

    return from(uploadBytes(storageRef, file)).pipe(
      map((result) => result.ref),
      switchMap((storageRefResult) => from(getDownloadURL(storageRefResult)))
    );
  }

  getClients(): Observable<Client[]> {
    const ref = collection(this.firestore, 'client');
    const q = query(ref, limit(500));

    return from(getDocs(q)).pipe(
      switchMap((snapshot) => {
        const baseClients = snapshot.docs
          .map((d) => this.toClient(d.id, d.data()))
          .sort((a, b) => (a.clientNumber || '').localeCompare(b.clientNumber || ''));

        if (!baseClients.length) {
          return of(baseClients);
        }

        return forkJoin(
          baseClients.map((client) =>
            this.getClientPlants(client.idDoc).pipe(
              map((plants) => ({ ...client, plants }))
            )
          )
        );
      })
    );
  }

  private toClient(id: string, data: Record<string, any>): Client & { plants?: ClientPlant[] } {
    return {
      idDoc: id,
      clientNumber: data['clientNumber'],
      name: data['name'],
      legalName: data['legalName'],
      rfc: data['rfc'],
      email: data['email'],
      phone: data['phone'],
      brandUrl: data['brandUrl'],
      imageurl: data['imageurl'],
      customerId: data['customerId'],
      customerName: data['customerName'],
      active: data['active'],
      witnesses: (data['witnesses'] ?? []).map((w: any) => this.toWitness(w)),
      createdAt: data['createdAt'] instanceof Timestamp ? data['createdAt'].toDate() : data['createdAt'],
      updatedAt: data['updatedAt'] instanceof Timestamp ? data['updatedAt'].toDate() : data['updatedAt'],
    };
  }

  private toPlant(id: string, p: Record<string, any>): ClientPlant {
    return {
      idDoc: id,
      name: p['name'],
      description: p['description'],
      contactName: p['contactName'],
      contactPosition: p['contactPosition'],
      contactEmail: p['contactEmail'],
      contactPhone: p['contactPhone'],
      street: p['street'],
      exteriorNumber: p['exteriorNumber'],
      interiorNumber: p['interiorNumber'],
      colony: p['colony'],
      municipality: p['municipality'],
      state: p['state'],
      country: p['country'],
      postalCode: p['postalCode'],
      lat: p['lat'],
      lng: p['lng'],
      active: p['active'],
      shifts: (p['shifts'] ?? []).map((s: any) => this.toShift(s)),
      createdAt: p['createdAt'] instanceof Timestamp ? p['createdAt'].toDate() : p['createdAt'],
      updatedAt: p['updatedAt'] instanceof Timestamp ? p['updatedAt'].toDate() : p['updatedAt'],
    };
  }

  private toShift(s: Record<string, any>): ClientShift {
    return {
      idDoc: s['idDoc'],
      name: s['name'],
      type: s['type'],
      startTime: s['startTime'],
      endTime: s['endTime'],
      active: s['active'],
    };
  }

  private toWitness(w: Record<string, any>): Witness {
    return {
      idDoc: w['idDoc'],
      name: w['name'],
      lastName: w['lastName'],
      email: w['email'],
      phone: w['phone'],
      active: w['active'],
      createdAt: w['createdAt'] instanceof Timestamp ? w['createdAt'].toDate() : w['createdAt'],
      updatedAt: w['updatedAt'] instanceof Timestamp ? w['updatedAt'].toDate() : w['updatedAt'],
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
