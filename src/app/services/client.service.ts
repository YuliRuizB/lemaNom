import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  Timestamp,
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  updateDoc,
} from '@angular/fire/firestore';
import { Observable, from, map } from 'rxjs';

import { Client, ClientPlant, ClientShift } from '../interfaces/client.interface';

@Injectable({ providedIn: 'root' })
export class ClientService {
  private firestore = inject(Firestore);

  addPlant(clientId: string, plant: Omit<ClientPlant, 'idDoc' | 'createdAt' | 'updatedAt'>): Observable<void> {
    const clientRef = doc(this.firestore, 'client', clientId);
    const newPlant: Record<string, any> = {
      idDoc: crypto.randomUUID(),
      name: plant.name,
      active: plant.active,
      createdAt: new Date(),
      updatedAt: new Date(),
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

    return from(updateDoc(clientRef, { plants: arrayUnion(newPlant) }));
  }

  createClient(data: Pick<Client, 'name' | 'legalName' | 'rfc' | 'email' | 'phone' | 'active'>): Observable<void> {
    const ref = collection(this.firestore, 'client');
    const payload: Record<string, any> = {
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

    return from(addDoc(ref, payload)).pipe(map(() => void 0));
  }

  getClients(): Observable<Client[]> {
    const ref = collection(this.firestore, 'client');
    const q = query(ref, limit(500));

    return from(getDocs(q)).pipe(
      map((snapshot) =>
        snapshot.docs
          .map((d) => this.toClient(d.id, d.data()))
          .sort((a, b) => a.name.localeCompare(b.name))
      )
    );
  }

  private toClient(id: string, data: Record<string, any>): Client {
    return {
      idDoc: id,
      name: data['name'],
      legalName: data['legalName'],
      rfc: data['rfc'],
      email: data['email'],
      phone: data['phone'],
      brandUrl: data['brandUrl'],
      customerId: data['customerId'],
      customerName: data['customerName'],
      active: data['active'],
      plants: (data['plants'] ?? []).map((p: any) => this.toPlant(p)),
      createdAt: data['createdAt'] instanceof Timestamp ? data['createdAt'].toDate() : data['createdAt'],
      updatedAt: data['updatedAt'] instanceof Timestamp ? data['updatedAt'].toDate() : data['updatedAt'],
    };
  }

  private toPlant(p: Record<string, any>): ClientPlant {
    return {
      idDoc: p['idDoc'],
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
}
