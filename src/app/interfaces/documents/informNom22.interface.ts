export interface InformNom22Data {  
  client_image: string;  //client.urlLogo
  client_name: string;  //client.name
  client_address: string; // clientPlant choseed, street + exteriorNumber + colony + municipality + state + country + postalCode
  inform_number: string; //workOrder.informNumber
  date_address: string; // plant chossed municipality + state + current date
  client_rfc: string; // client.rfc
  client_phone: string; // client.phone
  client_activity: string; // client.activity
  date: string; // current date  DD de MM(text  marzo, abril etc... ) de YYYY
  signatario_name: string; // workOrder.signatoryName

  //equipment
  identifier: string; // workorder.equipment.identifier
  model: string; // workorder.equipment.model
  ns: string; // workorder.equipment.ns
  medition_interval: string; // workorder.equipment.medition_interval
  precition: string; // workorder.equipment.precition
  frecuency: string; // workorder.equipment.frecuency
  especify_equipment: string; // workorder.equipment.especify_equipment
  tabla_4_2_2_id?: string;
  tabla_5_1_id?: string;
  tabla_5_2_id?: string;
  tabla_5_3_id?: string;
  charts?: string;
}

export interface InformNom22ChartItem {
  point_number: number;
  chart_card_id: string;
  chart_summary_id: string;
  chart_measurements_id: string;
  chart_graph_id: string;
  location: string;
  registered_value?: string;
  image_base64?: string;
  image_url?: string;
}
