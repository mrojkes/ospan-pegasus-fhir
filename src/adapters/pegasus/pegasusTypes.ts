/**
 * Tipos del JSON que devuelve la API de Pegasus (Panda HIS) para ordenes medicas.
 * Fuente: documentacion "API Ordenes medicas" (GET /api/ordenesmedicas,
 * GET /api/ordenesmedicas/{id}).
 *
 * Notas del dominio (importantes para no romper supuestos al mapear a FHIR):
 * - La mascota SIEMPRE se identifica por id_hub (IdHub). NroAfiliado viaja
 *   pero es el documento del tutor, no identifica a la mascota.
 * - Solo se devuelven ordenes cuya cobertura es OSPAN (IdCobertura = 1).
 * - Si una orden esta fuera de ese alcance, el detalle da 404 (indistinguible
 *   de "no existe").
 * - Los items NO tienen estado de autorizacion propio; lo real es `Realizada`.
 * - Importe/ImporteTotal hoy siempre devuelven 0 (precios de lista en 0 y
 *   OSPAN sin convenio cargado en Panda). No tratar como valor real todavia.
 */

export type PegasusEstadoCodigo = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const PEGASUS_ESTADOS: Record<PegasusEstadoCodigo, string> = {
  1: "Pendiente de realizacion",
  2: "Cancelada por tutor",
  3: "Realizada",
  4: "Cancelada por medico",
  5: "Realizada, informe pendiente",
  6: "Autorizado por el tutor",
  7: "Duplicado",
};

export interface PegasusOrdenMedicaItem {
  IdOrdenMedicaItem: number;
  IdOrdenMedica?: number;
  IdSku: number;
  Descripcion: string;
  Indicaciones?: string | null;
  Realizada: boolean;
  Notas?: string | null;
  NumValor?: number | null;
  TextValor?: string | null;
  Valor?: string | null;
  Unidad?: string | null;
  ValoresReferencia?: string | null;
  IdProfesionalRealiza?: number | null;
  ProfesionalRealiza?: string | null;
  MatriculaRealiza?: string | null;
  Importe: number;
}

export interface PegasusOrdenMedica {
  IdOrdenMedica: number;
  Fecha: string; // ISO local, sin timezone explicito
  IdEstado: PegasusEstadoCodigo;
  EstadoNombre: string;
  IdSucursal?: number;
  SucursalNombre?: string;
  IdMedico?: number;
  MedicoNombre?: string;
  MedicoMatricula?: string | null;
  IdServicio?: number;
  ServicioNombre?: string;
  IdCobertura?: number; // siempre 1 (OSPAN) en este endpoint
  CoberturaNombre?: string;
  NroAfiliado?: string | null; // informativo, NO identifica a la mascota
  IdPaciente: number; // id interno Pegasus de la mascota
  IdHub: string; // id de la mascota en el HUB de OSPAN (clave real)
  PacienteNombre?: string;
  PacienteFechaNac?: string | null;
  EspecieNombre?: string; // Canino, Felino, etc.
  RazaNombre?: string;
  IdTutor?: number;
  TutorNombre?: string;
  TutorDocumento?: number | null;
  Diagnostico?: string | null;
  Notas?: string | null;
  EvoOrdenMedica?: string | null; // lo solicitado, HTML
  EvoOrdenMedicaResultados?: string | null; // resultados, HTML (informe real de lab)
  Informe?: string | null; // informe, HTML
  FechaResultados?: string | null;
  Recetario_Url?: string | null;
  CantidadItems: number;
  ImporteTotal: number;
  Items: PegasusOrdenMedicaItem[];
  Adjuntos: string[];
}

export interface PegasusOrdenesMedicasListResponse {
  id_hub: string;
  cantidad: number;
  ordenes: PegasusOrdenMedica[];
}

export interface PegasusOrdenesMedicasQuery {
  id_hub: string; // obligatorio
  desde?: string; // AAAA-MM-DD
  hasta?: string; // AAAA-MM-DD
  estado?: PegasusEstadoCodigo;
  top?: number; // default 500, tope 2000
}

/**
 * GET /api/ordenesmedicas/porfecha
 * A diferencia del listado por id_hub, este NO filtra por cobertura: trae
 * ordenes de OSPAN y de cualquier otra. Ventana maxima de 31 dias.
 */
export interface PegasusOrdenesPorFechaQuery {
  desde: string; // AAAA-MM-DD, obligatorio
  hasta?: string; // AAAA-MM-DD, si falta es solo el dia de `desde`. Maximo 31 dias de rango.
  cobertura?: number; // codigo de cobertura, para acotar a una sola
  top?: number; // sin limite si no se manda (trae todo el rango)
}

export interface PegasusOrdenesPorFechaResponse {
  desde: string;
  hasta: string;
  cantidad: number;
  truncado: boolean;
  ordenes: PegasusOrdenMedica[];
}

/**
 * GET /api/ordenesmedicas/pacientes
 * Busca mascotas por el documento del tutor. OJO: el documento NO
 * identifica a un solo tutor (hay documentos repetidos entre varios
 * tutores) -- la respuesta puede traer mascotas de mas de una persona,
 * hay que mirar IdTutor/TutorNombre de cada una, nunca asumir la primera.
 */
export interface PegasusPacientesPorDocumentoQuery {
  documento_tutor: string; // obligatorio
  top?: number; // default 200, tope 2000
}

export interface PegasusPacienteResumen {
  IdPaciente: number;
  IdHub: string | null; // puede faltar si la mascota no es de OSPAN
  PacienteNombre: string;
  PacienteFechaNac?: string | null;
  EspecieNombre?: string;
  RazaNombre?: string;
  IdCobertura?: number;
  CoberturaNombre?: string;
  EsOspan: 0 | 1; // si es 0, esta mascota NO sale por /api/ordenesmedicas (id_hub) -- usar /pacientes/{idPaciente}/ordenes
  IdTutor: number;
  TutorNombre: string;
  TutorDocumento: number;
  CantidadOrdenes: number;
  UltimaOrden?: string | null;
}

export interface PegasusPacientesPorDocumentoResponse {
  documento_tutor: string;
  cantidad: number;
  truncado: boolean;
  pacientes: PegasusPacienteResumen[];
}

/**
 * GET /api/ordenesmedicas/pacientes/{idPaciente}/ordenes
 * Unica via para el historial de una mascota que NO es de OSPAN (la gran
 * mayoria no tiene id_hub). El idPaciente sale de /pacientes.
 *
 * La doc no muestra el shape completo de la respuesta (solo dice "las
 * ordenes vienen con los mismos campos que en el listado"); se modela con
 * el mismo shape que /porfecha (cantidad + ordenes[]) por consistencia --
 * a confirmar/ajustar contra la respuesta real.
 */
export interface PegasusOrdenesPorPacienteQuery {
  idPaciente: number | string;
  desde?: string; // sin esto, toda la historia
  hasta?: string;
  top?: number; // sin esto, toda la historia
}

export interface PegasusOrdenesPorPacienteResponse {
  cantidad: number;
  truncado?: boolean;
  ordenes: PegasusOrdenMedica[];
}
