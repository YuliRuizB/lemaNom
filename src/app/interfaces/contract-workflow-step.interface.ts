export type WorkflowStepStatus = 'locked' | 'active' | 'completed';

export interface ContractWorkflowStep {
  idDoc: string;
  order: number;
  stepUid: string;        // referencia a WorkflowStepCatalog.uid
  code: string;
  name: string;
  description?: string;
  status: WorkflowStepStatus;
  completedAt?: Date;
  completedBy?: string;   // uid del usuario que lo completó
  notes?: string;
}
