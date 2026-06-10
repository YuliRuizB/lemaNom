export interface Noms {
  idDoc: string;
  name: string;
  code: string;
  prefix: string;
  description?: string;
  nomCategoryId: string;
  nomCategoryName?: string;
  nomCategoryServiceId?: string;
  nomCategoryServiceName?: string;
  active: boolean;
  createdAt: Date;
  updatedAt?: Date;
}

