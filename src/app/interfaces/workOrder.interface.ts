
export interface workOrder{
  idDoc: string;
  code: string; // clave de contrato ejem OSO-FOR-FG-006
  createdAt: Date; // fecha de emison del contrato
  evaluationDate: Date; // fecha de revision del contrato
  evaluationNumber: string; // numero de revision del contrato
  workOrderNumber: string; // numero de orden de trabajo
  informNumber: string; // numero de informe  aqui es donde se jala el de la bitacora.
  purchaseOrderNumber: string; // numero de orden de compra
  quotationNumber?: string; // numero de cotizacion 

  // datos de la empresa
  clientId: string; // datos del cliente
  clientName?: string;  
  plantId: string; // datos de la planta
  plantName?: string;
  // adjuntamos datos del contcto de la planta, direccion, ciudad, CP, Contacto y Telefono

  nomCategoryId: string; // datos de la categoria de la norma que se va a cargar
  nomCategoryName?: string;
  nomCategoryServiceId: string; // datos del servicio de la categoria de la norma que se va a cargar
  nomCategoryServiceName?: string;  
  nomId: string; // datos del nom  que se va a cargar 
  nomName?: string;
  //datosde la norma  workflow

  //datos del signatario
  userAssignedId: string; // datos del signatario pero este es un usuario... con perfil signatario
  userAssignedName?: string;
  assingDate: Date; // fecha de asignacion del contrato al signatario

  //datos del signatario el que firma el contrato
  signatoryId: string; // datos del signatario pero este es un usuario... con perfil signatario
  signatoryName?: string;

  // observador y fecha de observación
  observerName?: string;
  observationDate?: Date;
  cableResistance?: number;

  // llenado de Gestion de la imparcialidad
  impartiality?: WorkOrderImpartiality;

  // datos de quien creo el contrato
  createdUser: string; // datos del usuario que creo el contrato
  createdUserName?: string;
  active: boolean;
  status: 'pending' | 'in-progress' | 'completed' | 'cancelled';
  currentStepId?: string | null;
  currentStepName?: string | null;
  updatedAt?: Date;

}

export interface WorkOrderImpartiality {
  familiarAffinity: boolean | null;
  bloodRelationship: boolean | null;
  friendshipRelationship: boolean | null;
  commercialInterest: boolean | null;
  economicInterest: boolean | null;
  intimidation: boolean | null;
  serviceImpartialityRisk: boolean | null;
  reviewedByUserId?: string;
  reviewedByUserName?: string;
  reviewedAt?: Date;
  observations?: string;
}

export interface WorkOrderClientVisitSignature {
  signedByName: string;
  signedByRole?: string;
  signedAt?: Date;
  observations?: string;
  confirmedVisit: boolean;
  signatureDataUrl: string;
  updatedByUserId?: string;
  updatedByUserName?: string;
  updatedAt?: Date;
}

export interface workOrderStep {
  idDoc: string; // sugerido: 01-solicitud, 02-planeacion, etc.
  workOrderId: string;
  nomId: string; // referencia a la norma origen del flujo
  workflowId?: string; // flujo maestro del que nace este paso
  stepCode?: string;
  stepName: string;
  order: number;
  optional: boolean;
  status: 'pending' | 'in-progress' | 'completed' | 'cancelled';
  assignedUserId?: string;
  assignedUserName?: string;
  completedByUserId?: string;
  completedByUserName?: string;
  observations?: string;
  clientVisitSignature?: WorkOrderClientVisitSignature;
  startedAt?: Date;
  completedAt?: Date;
  active: boolean;
  createdAt: Date;
  updatedAt?: Date;
}

export interface workOrderEquipment {
  idDoc: string; // sugerido: id del equipo o slug legible dentro de la orden
  workOrderId: string;
  equipmentId: string; // referencia al equipo maestro
  equipmentName?: string;
  equipmentType?: string;
  equipmentBrand?: string;
  equipmentModel?: string;
  equipmentNs?: string;
  equipmentSerialNumber?: string;
  equipmentFrecuency?: string;
  equipmentMeditionInterval?: string;
  equipmentPrecition?: string;
  equipmentSpecifyEquipment?: string;
  equipmentVoltage?: string;
  promedioFC?: number;
  active: boolean;
  createdAt: Date;
  updatedAt?: Date;
}
