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
  query,
  serverTimestamp,
  setDoc,
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
    const witnessesRef = collection(this.firestore, 'client', clientId, 'witnesses');
    const newWitness: Record<string, any> = {
      name: witness.name,
      lastName: witness.lastName,
      email: witness.email,
      active: witness.active,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    if (witness.phone) {
      newWitness['phone'] = witness.phone;
    }

    return from(addDoc(witnessesRef, newWitness)).pipe(map(() => void 0));
  }

  getClientPlantById(clientId: string, plantId: string): Observable<ClientPlant | null> {
    const plantRef = doc(this.firestore, 'client', clientId, 'plants', plantId);
    return from(getDoc(plantRef)).pipe(
      map((snapshot) => (snapshot.exists() ? this.toPlant(snapshot.id, snapshot.data()) : null))
    );
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

  getClientWitnesses(clientId: string): Observable<Witness[]> {
    const witnessesRef = collection(this.firestore, 'client', clientId, 'witnesses');
    const witnessesQuery = query(witnessesRef, limit(500));

    return from(getDocs(witnessesQuery)).pipe(
      map((snapshot) =>
        snapshot.docs
          .map((witnessDoc) => this.toWitness(witnessDoc.id, witnessDoc.data()))
          .sort((a, b) => `${a.name} ${a.lastName}`.localeCompare(`${b.name} ${b.lastName}`))
      )
    );
  }

  deleteWitness(clientId: string, witnessId: string): Observable<void> {
    const witnessRef = doc(this.firestore, 'client', clientId, 'witnesses', witnessId);
    return from(deleteDoc(witnessRef));
  }

  createClient(
    data: Pick<
      Client,
      'clientNumber' | 'name' | 'legalName' | 'rfc' | 'email' | 'phone' | 'client_activity' | 'active'
    > &
      Partial<Pick<Client, 'customerId' | 'customerName'>> &
      Partial<Pick<Client, 'urlLogo'>>
  ): Observable<string> {
    const ref = collection(this.firestore, 'client');
    const payload: Record<string, any> = {
      clientNumber: data.clientNumber,
      name: data.name,
      legalName: data.legalName,
      active: data.active,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (data.rfc)   payload['rfc']   = data.rfc;
    if (data.email) payload['email'] = data.email;
    if (data.phone) payload['phone'] = data.phone;
    if (data.client_activity) payload['client_activity'] = data.client_activity;
    if (data.customerId) payload['customerId'] = data.customerId;
    if (data.customerName) payload['customerName'] = data.customerName;
    if (data.urlLogo) payload['urlLogo'] = data.urlLogo;

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

  getClientById(clientId: string): Observable<Client | null> {
    const clientRef = doc(this.firestore, 'client', clientId);

    return from(getDoc(clientRef)).pipe(
      map((snapshot) => (snapshot.exists() ? this.toClient(snapshot.id, snapshot.data()) : null))
    );
  }

  uploadClientImage(clientId: string, file: File): Observable<string> {
    const extension = file.name.split('.').pop() || 'png';
    const storageRef = ref(this.storage, `customer/${clientId}/image.${extension}`);

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
        if (!snapshot.docs.length) {
          return of(snapshot.docs);
        }

        return forkJoin(
          snapshot.docs.map((docSnapshot) =>
            this.migrateLegacySubcollections(docSnapshot.id, docSnapshot.data()).pipe(
              map(() => docSnapshot)
            )
          )
        );
      }),
      switchMap((docSnapshots) => {
        const baseClients = docSnapshots
          .map((docSnapshot) => this.toClient(docSnapshot.id, docSnapshot.data()))
          .sort((a, b) => (a.clientNumber || '').localeCompare(b.clientNumber || ''));

        if (!baseClients.length) {
          return of(baseClients);
        }

        return forkJoin(
          baseClients.map((client) =>
            forkJoin({
              plants: this.getClientPlants(client.idDoc),
              witnesses: this.getClientWitnesses(client.idDoc),
            }).pipe(
              map(({ plants, witnesses }) => ({ ...client, plants, witnesses }))
            )
          )
        );
      })
    );
  }

  private migrateLegacySubcollections(clientId: string, data: Record<string, any>): Observable<void> {
    const legacyPlants = Array.isArray(data['plants']) ? data['plants'] : [];
    const legacyWitnesses = Array.isArray(data['witnesses']) ? data['witnesses'] : [];

    const operations: Observable<unknown>[] = [];

    for (const plant of legacyPlants) {
      const plantId = plant['idDoc'] || crypto.randomUUID();
      const plantRef = doc(this.firestore, 'client', clientId, 'plants', plantId);
      const payload = {
        ...plant,
        createdAt: plant['createdAt'] ?? serverTimestamp(),
        updatedAt: plant['updatedAt'] ?? serverTimestamp(),
      };
      delete payload['idDoc'];
      operations.push(from(setDoc(plantRef, payload, { merge: true })));
    }

    for (const witness of legacyWitnesses) {
      const witnessId = witness['idDoc'] || crypto.randomUUID();
      const witnessRef = doc(this.firestore, 'client', clientId, 'witnesses', witnessId);
      const payload = {
        ...witness,
        createdAt: witness['createdAt'] ?? serverTimestamp(),
        updatedAt: witness['updatedAt'] ?? serverTimestamp(),
      };
      delete payload['idDoc'];
      operations.push(from(setDoc(witnessRef, payload, { merge: true })));
    }

    if (legacyPlants.length || legacyWitnesses.length) {
      const clientRef = doc(this.firestore, 'client', clientId);
      const cleanup: Record<string, unknown> = {};

      if (legacyPlants.length) {
        cleanup['plants'] = deleteField();
      }

      if (legacyWitnesses.length) {
        cleanup['witnesses'] = deleteField();
      }

      operations.push(from(updateDoc(clientRef, cleanup)));
    }

    if (!operations.length) {
      return of(void 0);
    }

    return forkJoin(operations).pipe(map(() => void 0));
  }

  private toClient(id: string, data: Record<string, any>): Client {
    return {
      idDoc: id,
      clientNumber: data['clientNumber'],
      name: data['name'],
      legalName: data['legalName'],
      rfc: data['rfc'],
      email: data['email'],
      phone: data['phone'],
      client_activity: data['client_activity'] ?? data['activity'],
      brandUrl: data['brandUrl'],
      urlLogo: data['urlLogo'],
      customerId: data['customerId'],
      customerName: data['customerName'],
      active: data['active'],
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

  private toWitness(id: string, w: Record<string, any>): Witness {
    return {
      idDoc: id,
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
