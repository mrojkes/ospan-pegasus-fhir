/* =========================================================
   EL TRÁMITE COMO RECURSO FHIR
   -----------------------------------------------------------
   Las tablas de `app_asociado` son el almacenamiento; la vista FHIR
   es lo que sale del repositorio hacia afuera (back office, otros
   sistemas de OSPAN, auditoría).

   Un trámite se publica como un `Bundle` de tipo collection con:
     - el `Task`   → el expediente: número, estado, fechas, historial
     - el `QuestionnaireResponse` → lo que completó el afiliado
     - un `DocumentReference` por cada archivo adjunto

   El `QuestionnaireResponse` va además embebido en `Task.input`, que
   es donde FHIR espera encontrar el formulario que originó la tarea.
   ========================================================= */

import { env } from "../../config/env";
import type { Bundle, DocumentReference } from "../../fhir/types/r4";
import type { Task, TaskStatus } from "../../fhir/types/task";
import type { AdjuntoRow, EstadoTramite, EventoRow, TramiteRow } from "./db";

/** Sistema de numeración propio de OSPAN (no se integra con ThingSoft). */
export const SISTEMA_NRO_TRAMITE = `${env.fhirSourceSystemBase}/tramite`;
const SISTEMA_TIPO_TRAMITE = `${env.fhirSourceSystemBase}/CodeSystem/tipo-tramite`;

const ESTADO_FHIR: Record<EstadoTramite, TaskStatus> = {
  abierto: "requested",
  en_proceso: "in-progress",
  falta_documentacion: "on-hold",
  resuelto: "completed",
  rechazado: "rejected",
  anulado: "cancelled",
};

export function estadoFhir(estado: EstadoTramite): TaskStatus {
  return ESTADO_FHIR[estado] ?? "requested";
}

export function tramiteComoTask(
  t: TramiteRow,
  eventos: EventoRow[] = [],
  adjuntos: AdjuntoRow[] = []
): Task {
  return {
    resourceType: "Task",
    id: t.nro,
    identifier: [{ system: SISTEMA_NRO_TRAMITE, value: t.nro }],
    status: estadoFhir(t.estado),
    intent: "order",
    code: {
      coding: [{ system: SISTEMA_TIPO_TRAMITE, code: t.tipo, display: t.titulo }],
      text: t.titulo,
    },
    description: t.titulo,
    ...(t.patient_id ? { for: { reference: `Patient/${t.patient_id}`, display: t.mascota_nombre ?? undefined } } : {}),
    requester: { reference: `RelatedPerson/${t.related_person_id}` },
    authoredOn: t.creado_en?.toISOString?.() ?? String(t.creado_en),
    lastModified: t.actualizado_en?.toISOString?.() ?? String(t.actualizado_en),
    ...(t.resuelto_en
      ? {
          executionPeriod: {
            start: t.creado_en?.toISOString?.() ?? String(t.creado_en),
            end: t.resuelto_en?.toISOString?.() ?? String(t.resuelto_en),
          },
        }
      : {}),
    note: eventos.map((e) => ({
      authorString: e.autor,
      time: e.creado_en?.toISOString?.() ?? String(e.creado_en),
      text: e.detalle ?? e.estado,
    })),
    input: [
      {
        type: { text: "Formulario del trámite" },
        valueQuestionnaireResponse: t.respuesta,
      },
      ...adjuntos.map((a) => ({
        type: { text: a.etiqueta ?? "Documentación" },
        valueReference: { reference: `DocumentReference/${a.id}`, display: a.nombre },
      })),
    ],
    ...(t.resolucion
      ? { output: [{ type: { text: "Resolución" }, valueString: t.resolucion }] }
      : {}),
  };
}

export function adjuntoComoDocumentReference(t: TramiteRow, a: AdjuntoRow): DocumentReference {
  return {
    resourceType: "DocumentReference",
    id: String(a.id),
    identifier: [{ system: `${SISTEMA_NRO_TRAMITE}/adjunto`, value: String(a.id) }],
    status: "current",
    type: { text: a.etiqueta ?? a.link_id },
    subject: t.patient_id
      ? { reference: `Patient/${t.patient_id}`, display: t.mascota_nombre ?? undefined }
      : { reference: `RelatedPerson/${t.related_person_id}` },
    date: a.creado_en?.toISOString?.() ?? String(a.creado_en),
    content: [
      {
        attachment: {
          contentType: a.content_type,
          title: a.nombre,
          // URL del backend, autenticada. El binario nunca viaja en el recurso.
          url: `/api/app/tramites/${t.nro}/adjuntos/${a.id}`,
        },
      },
    ],
    context: { related: [{ reference: `Task/${t.nro}` }] },
  };
}

export function tramiteComoBundle(
  t: TramiteRow,
  eventos: EventoRow[],
  adjuntos: AdjuntoRow[]
): Bundle {
  return {
    resourceType: "Bundle",
    type: "collection",
    timestamp: new Date().toISOString(),
    entry: [
      // El Task no está en el union AnyResource de r4.ts (que cubre el
      // conector); el Bundle es estructuralmente el mismo.
      { fullUrl: `Task/${t.nro}`, resource: tramiteComoTask(t, eventos, adjuntos) as any },
      {
        fullUrl: `QuestionnaireResponse/${t.nro}`,
        resource: t.respuesta as any,
      },
      ...adjuntos.map((a) => ({
        fullUrl: `DocumentReference/${a.id}`,
        resource: adjuntoComoDocumentReference(t, a),
      })),
    ],
  };
}
