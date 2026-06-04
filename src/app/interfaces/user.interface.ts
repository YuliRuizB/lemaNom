import { Customer } from './customer.interface';
import { Role } from './role.interface';


export interface User {
  idDoc: string;
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
