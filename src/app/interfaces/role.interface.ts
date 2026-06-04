export interface Role {
  idDoc: string;
  name: string;
  active: boolean;
  description?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
