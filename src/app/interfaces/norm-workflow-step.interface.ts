export interface NormWorkflowStep {
  idDoc: string;
  order: number;
  stepUid: string;   // referencia a WorkflowStepCatalog.uid
  code: string;
  name: string;
  description?: string;
  optional: boolean;
  createdAt: Date;
  updatedAt?: Date;
}
