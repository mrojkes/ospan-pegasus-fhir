/**
 * Tipos FHIR R4 de Questionnaire / QuestionnaireResponse.
 *
 * Archivo nuevo (no modifica `r4.ts`, que ya está probado): sirve a la
 * declaración jurada de la App Asociado, y queda disponible para
 * cualquier otro formulario del repositorio que convenga modelar así
 * (consentimientos, triage, encuestas de satisfacción).
 *
 * Es un subconjunto: solo lo que realmente se usa. Ampliar cuando haga
 * falta, no antes.
 */

import type { Coding, DomainResource, Reference } from "./r4";

export type QuestionnaireItemType =
  | "group"
  | "display"
  | "boolean"
  | "decimal"
  | "integer"
  | "date"
  | "dateTime"
  | "string"
  | "text"
  | "choice";

/** Condición para mostrar un ítem según la respuesta de otro. */
export interface QuestionnaireEnableWhen {
  question: string; // linkId del ítem del que depende
  operator: "exists" | "=" | "!=" | ">" | "<" | ">=" | "<=";
  answerBoolean?: boolean;
  answerString?: string;
  answerCoding?: Coding;
}

export interface QuestionnaireAnswerOption {
  valueCoding?: Coding;
  valueString?: string;
}

export interface QuestionnaireItem {
  linkId: string;
  text?: string;
  type: QuestionnaireItemType;
  required?: boolean;
  repeats?: boolean;
  /** Código del concepto que representa la pregunta (LOINC/SNOMED). */
  code?: Coding[];
  enableWhen?: QuestionnaireEnableWhen[];
  enableBehavior?: "all" | "any";
  answerOption?: QuestionnaireAnswerOption[];
  item?: QuestionnaireItem[];
  /** Texto de ayuda propio, fuera del core de FHIR. */
  _ayuda?: string;
}

export interface Questionnaire extends DomainResource {
  resourceType: "Questionnaire";
  url?: string;
  version?: string;
  name?: string;
  title?: string;
  status: "draft" | "active" | "retired" | "unknown";
  subjectType?: string[];
  date?: string;
  publisher?: string;
  description?: string;
  item?: QuestionnaireItem[];
}

export interface QuestionnaireResponseAnswer {
  valueBoolean?: boolean;
  valueString?: string;
  valueDecimal?: number;
  valueInteger?: number;
  valueDate?: string;
  valueDateTime?: string;
  valueCoding?: Coding;
  item?: QuestionnaireResponseItem[];
}

export interface QuestionnaireResponseItem {
  linkId: string;
  text?: string;
  answer?: QuestionnaireResponseAnswer[];
  item?: QuestionnaireResponseItem[];
}

export interface QuestionnaireResponse extends DomainResource {
  resourceType: "QuestionnaireResponse";
  /** Canonical del Questionnaire: "<url>|<version>". */
  questionnaire?: string;
  status: "in-progress" | "completed" | "amended" | "entered-in-error" | "stopped";
  subject?: Reference;
  /** Quién respondió: acá siempre el tutor (RelatedPerson). */
  source?: Reference;
  authored?: string;
  item?: QuestionnaireResponseItem[];
}
