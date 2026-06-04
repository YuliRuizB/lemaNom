export interface Client {
  idDoc: string;
  // Datos generales del cliente
  name: string;              // Nombre comercial
  legalName: string;         // Razón social
  rfc?: string;
  email?: string;
  phone?: string;
  brandUrl?: string;
  // Si tu sistema maneja customer padre
  customerId?: string;
  customerName?: string;  
  // Relación: 1 cliente puede tener N plantas
  plants?: ClientPlant[];
  active: boolean;
  createdAt: Date;
  updatedAt?: Date;
}


export interface ClientPlant {
  idDoc: string;
  name: string;              // Planta Norte, Planta Monterrey, Planta 1
  description?: string;
  // Contacto principal de la planta
  contactName?: string;
  contactPosition?: string;
  contactEmail?: string;
  contactPhone?: string;

  // Dirección de la planta
  street?: string;
  exteriorNumber?: string;
  interiorNumber?: string;
  colony?: string;
  municipality?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  // Coordenadas opcionales
  lat?: number;
  lng?: number;
  // Turnos de la planta
  shifts?: ClientShift[];
  active: boolean;
  createdAt: Date;
  updatedAt?: Date;
}

export interface ClientShift {
  idDoc: string;
  name: string; // Turno Diurno, Turno Nocturno
  type: ShiftType;
  startTime: string;
  endTime: string;
  active: boolean;
}

export type ShiftType =
  | 'diurnal'
  | 'nocturnal';