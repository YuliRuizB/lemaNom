export type ElectrodeType = 'unique' | 'multiple';
export type MeasurementCondition = 'dry' | 'wet';
export type SoilType = 'cement' | 'soil' | 'asphalt' ;
export type VoltageStatus = 'absence' | 'presence' | 'empty';
export type GeneratorSource =
  | 'structure'
  | 'electrical_equipment'
  | 'lightning_rod'
  | 'no_equipment';


  export interface Point {
  idDoc: string;
  pointNumber: number;          // Punto No.
  location: string;             // Ubicación
  electrodeType: ElectrodeType; // Tipo de Electrodo
  hasLightningRod: boolean;     // Pararrayo: Sí / No
  lightningRodHeight?: number;  // Altura del pararrayos (m)
  protectionRadius?: number;    // Radio de protección (m)
  systemType?: string;          // Tipo de sistema
  temperature?: number;         // Temperatura ambiental °C
  humidity?: number;            // Humedad relativa %
  measurementCondition: MeasurementCondition; // Seco / Húmedo
  soilType: SoilType;           // Cemento / Tierra / Asfalto

  startTime?: string;           // Hora inicial hh:mm
  endTime?: string;             // Hora final hh:mm
  measurementData: PointMeasurementData;
  voltageStatus?: VoltageStatus; // Ausencia / Presencia / vacío
  hasContinuity?: boolean;       // Existe continuidad?

  generatorSources?: GeneratorSource[]; // Fuentes generadoras
  connectedEquipment: PointConnectedEquipment[]; // mínimo 1, máximo 3
  observations?: string;
  createdBy: string;            // uid usuario creador
  createdAt: Date;
  updatedAt?: Date;
}

export interface PointMeasurementData {
  p1_1m?: number;
  p1_4m?: number;
  p1_7m?: number;
  p1_10m?: number;
  p1_13m?: number;
  p1_16m?: number;
  p1_19m?: number;
}

export interface PointConnectedEquipment {
  idDoc: string;
  description: GeneratorSource;
}