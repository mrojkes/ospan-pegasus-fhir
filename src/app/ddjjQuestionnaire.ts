/* =========================================================
   DECLARACIÓN JURADA COMO FHIR Questionnaire
   -----------------------------------------------------------
   El cuestionario es un recurso `Questionnaire` y lo que responde
   el tutor se guarda como `QuestionnaireResponse`. Dos motivos:

   1. La pantalla se arma SOLA a partir del Questionnaire. Agregar,
      sacar o reordenar preguntas es editar este archivo y subir la
      versión: no se toca ni el front ni la base.
   2. Lo guardado es un recurso FHIR válido, así que sale del
      repositorio tal cual — sin una capa de traducción que haya que
      mantener sincronizada con la tabla.

   Al cambiar las preguntas hay que SUBIR `VERSION`. Las respuestas
   viejas quedan apuntando a la versión con la que se respondieron
   (el campo `questionnaire` del QR es "<url>|<version>"), así una
   declaración de hace seis meses se sigue interpretando con el
   cuestionario que el tutor efectivamente vio.

   PENDIENTE DE TERMINOLOGÍA: los ítems no llevan `code` todavía.
   Preferimos no inventar códigos LOINC/SNOMED: cuando OSPAN defina
   el binding (o se conecte el schema `terminology` de la RDS), se
   agrega `code` a cada ítem y los QR ya guardados siguen siendo
   válidos, porque el código va en el Questionnaire, no en la
   respuesta.
   ========================================================= */

import { env } from "../config/env";
import type {
  Questionnaire,
  QuestionnaireItem,
  QuestionnaireResponse,
  QuestionnaireResponseItem,
} from "../fhir/types/questionnaire";

export const DDJJ_URL = `${env.fhirSourceSystemBase}/Questionnaire/ddjj-mascota`;
export const DDJJ_VERSION = "1.0.0";
export const DDJJ_CANONICAL = `${DDJJ_URL}|${DDJJ_VERSION}`;

/**
 * Patrón de cada antecedente: una pregunta booleana y, colgado de
 * ella, el detalle que solo aparece si respondió que sí (`enableWhen`).
 * El renderer del front no sabe nada de "alergias" ni de "cirugías":
 * solo sabe leer tipos y condiciones.
 */
function antecedente(linkId: string, texto: string, detalle: string): QuestionnaireItem {
  return {
    linkId,
    text: texto,
    type: "boolean",
    required: true,
    item: [
      {
        linkId: `${linkId}-detalle`,
        text: detalle,
        type: "text",
        enableWhen: [{ question: linkId, operator: "=", answerBoolean: true }],
      },
    ],
  };
}

export const DDJJ_QUESTIONNAIRE: Questionnaire = {
  resourceType: "Questionnaire",
  id: "ddjj-mascota",
  url: DDJJ_URL,
  version: DDJJ_VERSION,
  name: "DeclaracionJuradaMascota",
  title: "Declaración jurada de salud de la mascota",
  status: "active",
  subjectType: ["Patient"],
  date: "2026-09-11",
  publisher: "OSPAN",
  description:
    "Antecedentes de salud declarados por el tutor desde la App Asociado. " +
    "Lo declarado no reemplaza el examen veterinario.",
  item: [
    antecedente("preexistentes", "¿Tiene enfermedades preexistentes?", "¿Cuáles?"),
    antecedente("cirugias", "¿Tiene cirugías previas?", "¿Cuáles y cuándo?"),
    antecedente("alergias", "¿Tiene alergias conocidas?", "¿A qué es alérgica?"),
    {
      linkId: "esterilizado",
      text: "¿Está esterilizado/a?",
      type: "boolean",
      required: true,
    },
    antecedente("medicacion", "¿Recibe medicación crónica?", "¿Cuál y con qué frecuencia?"),
    antecedente("vacunacion", "¿Tiene el plan de vacunación al día?", "¿Qué vacuna le falta?"),
  ],
};

/* ---------------------------------------------------------
   Validación y armado del QuestionnaireResponse
   --------------------------------------------------------- */

/** Aplana el árbol de ítems para poder buscarlos por linkId. */
function indexar(items: QuestionnaireItem[] = [], acc = new Map<string, QuestionnaireItem>()) {
  for (const it of items) {
    acc.set(it.linkId, it);
    if (it.item) indexar(it.item, acc);
  }
  return acc;
}

const INDICE = indexar(DDJJ_QUESTIONNAIRE.item);

export class DdjjInvalida extends Error {}

/**
 * Toma lo que mandó la app y devuelve un QuestionnaireResponse limpio.
 *
 * Se construye acá y no se confía en el cliente: se descartan linkIds
 * desconocidos, se verifica que el tipo de dato corresponda al del ítem,
 * y se ignoran los detalles cuya condición `enableWhen` no se cumple
 * (para que no quede guardado "alergias: no" con un detalle colgado).
 */
export function construirRespuesta(entrada: {
  items: unknown;
  patientId: string;
  relatedPersonId: string;
}): QuestionnaireResponse {
  const crudos = Array.isArray(entrada.items) ? entrada.items : [];
  if (!crudos.length) throw new DdjjInvalida("No hay respuestas para guardar");

  // Primera pasada: valores por linkId, solo de ítems conocidos.
  const valores = new Map<string, { valueBoolean?: boolean; valueString?: string }>();
  for (const raw of crudos) {
    const linkId = String((raw as any)?.linkId ?? "");
    const item = INDICE.get(linkId);
    if (!item) continue;

    const answer = (raw as any)?.answer?.[0] ?? {};
    if (item.type === "boolean") {
      if (typeof answer.valueBoolean !== "boolean") continue;
      valores.set(linkId, { valueBoolean: answer.valueBoolean });
    } else if (item.type === "string" || item.type === "text") {
      const v = String(answer.valueString ?? "").trim().slice(0, 1000);
      if (v) valores.set(linkId, { valueString: v });
    } else if (item.type === "choice") {
      const v = String(answer.valueString ?? "").trim();
      const permitido = (item.answerOption ?? []).some((o) => o.valueString === v);
      if (permitido) valores.set(linkId, { valueString: v });
    }
  }

  // Segunda pasada: se arma el árbol respetando enableWhen.
  const items = armarItems(DDJJ_QUESTIONNAIRE.item ?? [], valores);
  if (!items.length) throw new DdjjInvalida("Respondé al menos una pregunta");

  return {
    resourceType: "QuestionnaireResponse",
    questionnaire: DDJJ_CANONICAL,
    status: "completed",
    subject: { reference: `Patient/${entrada.patientId}` },
    source: { reference: `RelatedPerson/${entrada.relatedPersonId}` },
    authored: new Date().toISOString(),
    item: items,
  };
}

function armarItems(
  definicion: QuestionnaireItem[],
  valores: Map<string, { valueBoolean?: boolean; valueString?: string }>
): QuestionnaireResponseItem[] {
  const salida: QuestionnaireResponseItem[] = [];

  for (const def of definicion) {
    if (!condicionCumplida(def, valores)) continue;
    const valor = valores.get(def.linkId);
    const hijos = def.item ? armarItems(def.item, valores) : [];

    if (!valor && !hijos.length) continue;

    const item: QuestionnaireResponseItem = { linkId: def.linkId, text: def.text };
    if (valor) {
      // Los hijos cuelgan de la respuesta, como indica FHIR para los
      // ítems anidados bajo una pregunta contestada.
      item.answer = [{ ...valor, ...(hijos.length ? { item: hijos } : {}) }];
    } else if (hijos.length) {
      item.item = hijos;
    }
    salida.push(item);
  }
  return salida;
}

function condicionCumplida(
  def: QuestionnaireItem,
  valores: Map<string, { valueBoolean?: boolean; valueString?: string }>
): boolean {
  if (!def.enableWhen?.length) return true;
  const comprobar = (c: (typeof def.enableWhen)[number]) => {
    const v = valores.get(c.question);
    if (!v) return false;
    if (c.operator === "exists") return true;
    if (c.answerBoolean !== undefined) {
      return c.operator === "=" ? v.valueBoolean === c.answerBoolean : v.valueBoolean !== c.answerBoolean;
    }
    if (c.answerString !== undefined) {
      return c.operator === "=" ? v.valueString === c.answerString : v.valueString !== c.answerString;
    }
    return false;
  };
  return def.enableBehavior === "any" ? def.enableWhen.some(comprobar) : def.enableWhen.every(comprobar);
}

/* ---------------------------------------------------------
   Compatibilidad
   --------------------------------------------------------- */

/**
 * Convierte el formato viejo ({codigo: {respuesta, detalle}}) al
 * QuestionnaireResponse. Se usa para migrar lo poco que se guardó
 * durante las pruebas y para el valor de base que viene del padrón.
 */
export function desdeFormatoPlano(
  plano: Record<string, { respuesta?: string; detalle?: string }>,
  ctx: { patientId: string; relatedPersonId: string; authored?: string }
): QuestionnaireResponse {
  const items = Object.entries(plano || {}).flatMap(([linkId, v]) => {
    if (!INDICE.has(linkId)) return [];
    const out: any[] = [{ linkId, answer: [{ valueBoolean: v?.respuesta === "si" }] }];
    if (v?.detalle) out[0].answer[0].item = [{ linkId: `${linkId}-detalle`, answer: [{ valueString: v.detalle }] }];
    return out;
  });

  return {
    resourceType: "QuestionnaireResponse",
    questionnaire: DDJJ_CANONICAL,
    status: "completed",
    subject: { reference: `Patient/${ctx.patientId}` },
    source: { reference: `RelatedPerson/${ctx.relatedPersonId}` },
    authored: ctx.authored || new Date().toISOString(),
    item: items,
  };
}
