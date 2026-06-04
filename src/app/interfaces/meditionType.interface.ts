
export interface equipment {
  idDoc: string;
  name: string;
  identifier: string;
  brand?: string;
  model?: string;
  ns:string;
  range?: string;
  customerId?: string;
  customerName?: string;
  active: boolean;
  createdAt: Date;
  updatedAt?: Date;
  lastLoginAt?: Date;
  certificateUrl?: string;
}