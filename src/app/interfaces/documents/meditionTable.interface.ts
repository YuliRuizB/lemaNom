export interface MeditionTableRow {
  point_number: number;
  area: string;
  electrode_type: string;
  has_lightning_rod: string;

  soil_cemento: boolean;
  soil_asfalto: boolean;
  soil_tierra: boolean;

  condition_seco: boolean;
  condition_humedo: boolean;

  voltage_yes: boolean;
  voltage_no: boolean;

  continuity_yes: boolean;
  continuity_no: boolean;

  measurement_1: string;
  measurement_4: string;
  measurement_7: string;
  measurement_10: string;
  measurement_13: string;
  measurement_16: string;
  measurement_19: string;

  generator_source: string;
  connected_equipment: string;
}
