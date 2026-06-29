import { Customer } from './customer.interface';
import { Role } from './role.interface';


export interface User {
  idDoc: string;
  prefix?: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  phone?: string;
  photoUrl?: string;
  customerId?: string;
  customerName?: string;
  roleId: string;
  roleName?: string;
  active: boolean;
  approved: boolean;
  termsAccepted?: boolean;
  termsAcceptedAt?: Date;
  createdAt: Date;
  updatedAt?: Date;
  lastLoginAt?: Date;
}

export interface UserAccreditation {
  idDoc: string;
  name: string;
  description?: string;
  fileUrl: string;
  fileName?: string;
  active: boolean;
  createdAt: Date;
  updatedAt?: Date;
}

export interface UserQualification {
  idDoc: string;
  name: string;
  description?: string;
  fileUrl: string;
  fileName?: string;
  active: boolean;
  createdAt: Date;
  updatedAt?: Date;
}
