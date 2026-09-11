/**
 * Subset de tipos FHIR R4 (solo lo que este conector necesita para modelar
 * ordenes medicas de Pegasus). No es la especificacion completa: es
 * suficiente para tipar los mappers y los Bundles que arma este backend.
 *
 * Referencia: https://hl7.org/fhir/R4/
 */

export interface Identifier {
  use?: "usual" | "official" | "temp" | "secondary" | "old";
  system?: string;
  value?: string;
}

export interface Coding {
  system?: string;
  code?: string;
  display?: string;
}

export interface CodeableConcept {
  coding?: Coding[];
  text?: string;
}

export interface Reference {
  reference?: string;
  type?: string;
  display?: string;
}

export interface Period {
  start?: string;
  end?: string;
}

export interface Quantity {
  value?: number;
  unit?: string;
  system?: string;
  code?: string;
}

export interface Range {
  low?: Quantity;
  high?: Quantity;
  text?: string;
}

export interface Attachment {
  contentType?: string;
  url?: string;
  title?: string;
}

export interface Extension {
  url: string;
  valueString?: string;
  valueCode?: string;
  valueBoolean?: boolean;
  valueCodeableConcept?: CodeableConcept;
  extension?: Extension[];
}

export interface Narrative {
  status: "generated" | "extensions" | "additional" | "empty";
  div: string;
}

export interface DomainResource {
  resourceType: string;
  id?: string;
  text?: Narrative;
  extension?: Extension[];
}

export interface HumanName {
  text?: string;
  family?: string;
  given?: string[];
}

export interface Patient extends DomainResource {
  resourceType: "Patient";
  identifier?: Identifier[];
  active?: boolean;
  name?: HumanName[];
  birthDate?: string;
  generalPractitioner?: Reference[];
}

export interface RelatedPerson extends DomainResource {
  resourceType: "RelatedPerson";
  identifier?: Identifier[];
  patient: Reference;
  relationship?: CodeableConcept[];
  name?: HumanName[];
}

export interface Practitioner extends DomainResource {
  resourceType: "Practitioner";
  identifier?: Identifier[];
  name?: HumanName[];
  qualification?: { identifier?: Identifier[]; code: CodeableConcept }[];
}

export interface Organization extends DomainResource {
  resourceType: "Organization";
  identifier?: Identifier[];
  active?: boolean;
  type?: CodeableConcept[];
  name?: string;
}

export interface Coverage extends DomainResource {
  resourceType: "Coverage";
  identifier?: Identifier[];
  status: "active" | "cancelled" | "draft" | "entered-in-error";
  beneficiary: Reference;
  payor: Reference[];
  subscriberId?: string;
}

export type ServiceRequestStatus =
  | "draft"
  | "active"
  | "on-hold"
  | "revoked"
  | "completed"
  | "entered-in-error"
  | "unknown";

export interface ServiceRequest extends DomainResource {
  resourceType: "ServiceRequest";
  identifier?: Identifier[];
  status: ServiceRequestStatus;
  intent: "order" | "original-order" | "plan";
  category?: CodeableConcept[];
  code?: CodeableConcept;
  subject: Reference;
  encounter?: Reference;
  occurrenceDateTime?: string;
  authoredOn?: string;
  requester?: Reference;
  performerType?: CodeableConcept;
  performer?: Reference[];
  locationReference?: Reference[];
  reasonCode?: CodeableConcept[];
  insurance?: Reference[];
  note?: { text: string }[];
  basedOn?: Reference[];
}

export type ObservationStatus =
  | "registered"
  | "preliminary"
  | "final"
  | "amended"
  | "corrected"
  | "cancelled"
  | "entered-in-error"
  | "unknown";

export interface Observation extends DomainResource {
  resourceType: "Observation";
  identifier?: Identifier[];
  basedOn?: Reference[];
  status: ObservationStatus;
  category?: CodeableConcept[];
  code: CodeableConcept;
  subject: Reference;
  performer?: Reference[];
  effectiveDateTime?: string;
  valueQuantity?: Quantity;
  valueString?: string;
  valueBoolean?: boolean;
  dataAbsentReason?: CodeableConcept;
  note?: { text: string }[];
  referenceRange?: Range[];
}

export type DiagnosticReportStatus =
  | "registered"
  | "partial"
  | "preliminary"
  | "final"
  | "amended"
  | "cancelled"
  | "entered-in-error"
  | "unknown";

export interface DiagnosticReport extends DomainResource {
  resourceType: "DiagnosticReport";
  identifier?: Identifier[];
  basedOn?: Reference[];
  status: DiagnosticReportStatus;
  category?: CodeableConcept[];
  code: CodeableConcept;
  subject: Reference;
  effectiveDateTime?: string;
  issued?: string;
  performer?: Reference[];
  resultsInterpreter?: Reference[];
  result?: Reference[];
  conclusion?: string;
  presentedForm?: Attachment[];
}

export interface DocumentReference extends DomainResource {
  resourceType: "DocumentReference";
  identifier?: Identifier[];
  status: "current" | "superseded" | "entered-in-error";
  type?: CodeableConcept;
  subject: Reference;
  date?: string;
  content: { attachment: Attachment }[];
  context?: { related?: Reference[] };
}

export type AnyResource =
  | Patient
  | RelatedPerson
  | Practitioner
  | Organization
  | Coverage
  | ServiceRequest
  | Observation
  | DiagnosticReport
  | DocumentReference;

export interface BundleEntry {
  fullUrl?: string;
  resource: AnyResource;
  search?: { mode: "match" | "include" };
}

export interface Bundle {
  resourceType: "Bundle";
  type: "collection" | "searchset" | "transaction";
  timestamp?: string;
  total?: number;
  entry: BundleEntry[];
}
