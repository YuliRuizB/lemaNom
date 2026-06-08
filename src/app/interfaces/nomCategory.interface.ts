
export interface nomCategory {
  idDoc: string;
  name: string;
  prefix: string;
  active: boolean;
  createdAt: Date;
  updatedAt?: Date;
}

export interface nomCategoryServices {
  idDoc: string;
  name: string;
  prefix: string;
  codeService: number;
  codeCustomer: string;
  year: number;
  active: boolean;
  createdAt: Date;
  updatedAt?: Date;
}

