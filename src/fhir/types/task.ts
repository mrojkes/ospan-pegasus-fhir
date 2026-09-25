/**
 * Tipo FHIR R4 `Task`, usado para los TRÁMITES de la App Asociado.
 *
 * Por qué Task y no un recurso propio: un trámite es exactamente lo que
 * FHIR llama Task — un pedido que alguien hace, que otro alguien tiene
 * que resolver, con estado, fechas, responsable y un historial. Lo que
 * el afiliado completó viaja como `QuestionnaireResponse` dentro de
 * `Task.input`, y la documentación como `DocumentReference`.
 *
 * El número de trámite va en `Task.identifier`. OSPAN lo numera con su
 * propia serie (no se integra con ThingSoft), así que el identifier
 * lleva el sistema de numeración de la app.
 *
 * Igual que `questionnaire.ts`, es un subconjunto: solo los campos que
 * se usan.
 */

import type { CodeableConcept, DomainResource, Identifier, Period, Reference } from "./r4";
import type { QuestionnaireResponse } from "./questionnaire";

/** `Annotation` de FHIR: cada movimiento del trámite queda como una nota. */
export interface Annotation {
  authorString?: string;
  time?: string;
  text: string;
}

/**
 * Estados de FHIR que usa OSPAN. El resto del value set existe pero no
 * se emite: agregarlo cuando haya un caso real.
 *
 * - requested   → abierto, nadie lo tomó todavía
 * - in-progress → en proceso
 * - on-hold     → esperando algo del afiliado (típicamente documentación)
 * - completed   → resuelto
 * - rejected    → resuelto que no
 * - cancelled   → dado de baja (lo anula el afiliado o OSPAN)
 */
export type TaskStatus =
  | "requested"
  | "in-progress"
  | "on-hold"
  | "completed"
  | "rejected"
  | "cancelled";

export interface TaskInput {
  type: CodeableConcept;
  valueReference?: Reference;
  valueString?: string;
  /** El formulario respondido viaja embebido: es el cuerpo del trámite. */
  valueQuestionnaireResponse?: QuestionnaireResponse;
}

export interface TaskOutput {
  type: CodeableConcept;
  valueString?: string;
  valueReference?: Reference;
}

export interface Task extends DomainResource {
  resourceType: "Task";
  identifier?: Identifier[];
  status: TaskStatus;
  statusReason?: CodeableConcept;
  intent: "order";
  /** Tipo de trámite (código propio de OSPAN + título). */
  code?: CodeableConcept;
  description?: string;
  /** Mascota, cuando el trámite es sobre una mascota. */
  for?: Reference;
  authoredOn?: string;
  lastModified?: string;
  executionPeriod?: Period;
  /** Quién lo pidió: el tutor (RelatedPerson). */
  requester?: Reference;
  owner?: Reference;
  note?: Annotation[];
  input?: TaskInput[];
  output?: TaskOutput[];
}
