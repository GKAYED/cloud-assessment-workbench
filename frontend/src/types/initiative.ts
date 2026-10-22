export interface Initiative {
  id: number;
  profile_id: number;
  name: string;
  title?: string | null;
  description?: string | null;
  status: string;
  priority: string;
  estimated_effort_weeks?: number | null;
  estimated_cost_saving?: number | null;
  complexity?: number | null;
  strategic_fit?: number | null;
  linked_app_ids?: number[] | null;
  dependency_ids?: number[] | null;
  lane?: string | null;
  planned_start_quarter?: string | null;
  planned_end_quarter?: string | null;
  target_quarter?: string | null;
  category?: string | null;
  business_owner?: string | null;
  technical_owner?: string | null;
  validation_status?: string | null;
  evidence_confidence?: string | null;
  parent_initiative_id?: number | null;
  prioritization_score?: number | null;
  deprecation_aligned: boolean;
  deprecation_aligned_override?: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface InitiativeCreate {
  name: string;
  description?: string;
  status?: string;
  priority?: string;
  complexity?: number;
  strategic_fit?: number;
  linked_app_ids?: number[];
  dependency_ids?: number[];
  lane?: string;
  planned_start_quarter?: string;
  planned_end_quarter?: string;
  target_quarter?: string;
  category?: string;
  estimated_effort_weeks?: number;
  estimated_cost_saving?: number;
  business_owner?: string;
  technical_owner?: string;
  validation_status?: string;
  evidence_confidence?: string;
  parent_initiative_id?: number;
  deprecation_aligned?: boolean;
}
