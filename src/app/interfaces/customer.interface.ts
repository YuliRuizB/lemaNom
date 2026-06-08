export interface Customer {
  idDoc: string;
  code: string;
  codeCustomer?: string;
  businessName: string;        
  commercialName?: string;  
  rfc?: string;
  active: boolean;
  createdAt?: any;
  updatedAt?: any;
  street?: string;
  exteriorNumber?: string;
  colony?: string;
  municipality?: string;
  state?: string;
  country?: string;
  urlLogo?: string;
  postalCode?: string;
}
