
export interface equipment {
  idDoc: string;
  name: string;
  identifier: string;
  brand?: string;
  model?: string;
  ns: string;
  range?: string;
  frecuency?: string;
  precition?: string;
  especify_equipment?: string;
  voltage?: string;
  customerId?: string;
  customerName?: string;
  active: boolean;
  createdAt: Date;
  updatedAt?: Date;
  lastLoginAt?: Date;
  certificateUrl?: string;
}

export interface CalibrationRow {
  patron:           number | null;
  valorMedido:      number | null;
  incertidumbreOhm: number | null;
  incertidumbrePct: number | null;
}

export interface CalibrationRecord {
  idDoc: string;
  certNumber: string;
  calibrationDate: string;
  expirationDate?: string;
  voltage: '25V' | '50V' | 'Ambos';
  calibrationRows25v: CalibrationRow[];
  calibrationRows50v: CalibrationRow[];
  createdAt: Date;
  createdBy?: string;
}

export interface UserReading {
  userId: string;
  userName: string;
  readings: (number | null)[];
}

export interface RepeatabilityRecord {
  idDoc: string;
  userReadings: UserReading[];
  createdAt: Date;
  createdBy?: string;
}

export interface EquipmentCertificate {
  idDoc: string;
  certificateUrl: string;
  fileName: string;
  uploadedAt: Date;
  uploadedBy?: string;
}
