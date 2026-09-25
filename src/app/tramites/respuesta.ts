/* =========================================================
   DE LO QUE MANDA LA APP A UN QuestionnaireResponse VÁLIDO
   -----------------------------------------------------------
   Genérico: sirve para CUALQUIER Questionnaire, no sabe nada de
   trámites. Hace tres cosas, y todas del lado del servidor porque
   no se le cree al cliente:

   1. Descarta linkIds que no existan en el cuestionario y valores
      cuyo tipo no corresponda al del ítem (un texto donde va un
      número, una opción que no está en `answerOption`).
   2. Evalúa `enableWhen`: una respuesta a una pregunta que quedó
      oculta no se guarda. Así no queda "detalle del motivo" colgado
      de un motivo que después cambió.
   3. Controla los `required` — pero solo los de los ítems que
      efectivamente están habilitados. Si falta alguno, devuelve la
      lista y el trámite no se crea.

   Los adjuntos no viajan dentro del recurso: el binario se guarda
   aparte y el answer queda con nombre, tipo y la URL autenticada.
   ========================================================= */

import type {
  Questionnaire,
  QuestionnaireItem,
  QuestionnaireResponse,
  QuestionnaireResponseAnswer,
  QuestionnaireResponseItem,
} from "../../fhir/types/questionnaire";

export class RespuestaInvalida extends Error {
  /** linkIds obligatorios que faltan, para que la app los marque. */
  faltantes: string[];
  constructor(mensaje: string, faltantes: string[] = []) {
    super(mensaje);
    this.faltantes = faltantes;
  }
}

export type Valor =
  | { valueBoolean: boolean }
  | { valueString: string }
  | { valueDecimal: number }
  | { valueInteger: number }
  | { valueDate: string };

/** Adjunto ya decodificado, listo para guardar. */
export interface AdjuntoEntrante {
  linkId: string;
  etiqueta: string;
  nombre: string;
  contentType: string;
  contenido: Buffer;
}

export function indexar(
  items: QuestionnaireItem[] = [],
  acc = new Map<string, QuestionnaireItem>()
): Map<string, QuestionnaireItem> {
  for (const it of items) {
    acc.set(it.linkId, it);
    if (it.item) indexar(it.item, acc);
  }
  return acc;
}

/* ---------------------------------------------------------
   Lectura de valores
   --------------------------------------------------------- */

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function valorDe(item: QuestionnaireItem, answer: any): Valor | null {
  switch (item.type) {
    case "boolean":
      return typeof answer?.valueBoolean === "boolean" ? { valueBoolean: answer.valueBoolean } : null;

    case "string":
    case "text": {
      const v = String(answer?.valueString ?? "").trim().slice(0, 2000);
      return v ? { valueString: v } : null;
    }

    case "choice": {
      const v = String(answer?.valueString ?? answer?.valueCoding?.code ?? "").trim();
      const permitido = (item.answerOption ?? []).some(
        (o) => o.valueString === v || o.valueCoding?.code === v
      );
      return permitido ? { valueString: v } : null;
    }

    case "date": {
      const v = String(answer?.valueDate ?? answer?.valueString ?? "").trim();
      return FECHA.test(v) ? { valueDate: v } : null;
    }

    case "integer": {
      const n = Number(answer?.valueInteger ?? answer?.valueDecimal ?? answer?.valueString);
      return Number.isInteger(n) ? { valueInteger: n } : null;
    }

    case "decimal": {
      const n = Number(answer?.valueDecimal ?? answer?.valueInteger ?? answer?.valueString);
      return Number.isFinite(n) ? { valueDecimal: n } : null;
    }

    default:
      // display, group y attachment no traen valor por esta vía.
      return null;
  }
}

/** Valor "plano" para evaluar enableWhen y para las reglas de negocio. */
function plano(v: Valor): boolean | string | number {
  if ("valueBoolean" in v) return v.valueBoolean;
  if ("valueString" in v) return v.valueString;
  if ("valueDate" in v) return v.valueDate;
  if ("valueInteger" in v) return v.valueInteger;
  return v.valueDecimal;
}

export function condicionCumplida(
  def: QuestionnaireItem,
  valores: Map<string, Valor>
): boolean {
  if (!def.enableWhen?.length) return true;
  const comprobar = (c: NonNullable<QuestionnaireItem["enableWhen"]>[number]) => {
    const v = valores.get(c.question);
    if (!v) return false;
    if (c.operator === "exists") return true;
    const actual = plano(v);
    const esperado =
      c.answerBoolean !== undefined ? c.answerBoolean
      : c.answerString !== undefined ? c.answerString
      : c.answerCoding?.code;
    if (esperado === undefined) return false;
    return c.operator === "!=" ? actual !== esperado : actual === esperado;
  };
  return def.enableBehavior === "any" ? def.enableWhen.some(comprobar) : def.enableWhen.every(comprobar);
}

/* ---------------------------------------------------------
   Armado del recurso
   --------------------------------------------------------- */

export interface ArmadoRespuesta {
  respuesta: QuestionnaireResponse;
  /** {linkId: valor} para las reglas de negocio de `reglas.ts`. */
  valores: Record<string, boolean | string | number>;
}

export function construirRespuesta(entrada: {
  questionnaire: Questionnaire;
  items: unknown;
  adjuntos: AdjuntoEntrante[];
  /** Cómo se arma la URL de descarga de cada adjunto. */
  urlAdjunto: (indice: number) => string;
  subject: { reference: string };
  source: { reference: string };
}): ArmadoRespuesta {
  const indice = indexar(entrada.questionnaire.item);
  const crudos = Array.isArray(entrada.items) ? entrada.items : [];

  // 1. Valores conocidos y bien tipados.
  const valores = new Map<string, Valor>();
  for (const raw of crudos) {
    const linkId = String((raw as any)?.linkId ?? "");
    const item = indice.get(linkId);
    if (!item) continue;
    const v = valorDe(item, (raw as any)?.answer?.[0] ?? {});
    if (v) valores.set(linkId, v);
  }

  // 2. Adjuntos por linkId (solo de ítems attachment que existan).
  const adjuntosPorItem = new Map<string, Array<{ adjunto: AdjuntoEntrante; indice: number }>>();
  entrada.adjuntos.forEach((a, i) => {
    const item = indice.get(a.linkId);
    if (!item || item.type !== "attachment") return;
    const lista = adjuntosPorItem.get(a.linkId) ?? [];
    lista.push({ adjunto: a, indice: i });
    adjuntosPorItem.set(a.linkId, lista);
  });

  // 3. Obligatorios: solo los habilitados según lo respondido.
  const faltantes: string[] = [];
  (function revisar(items: QuestionnaireItem[] = []) {
    for (const it of items) {
      if (!condicionCumplida(it, valores)) continue;
      if (it.required) {
        const tieneValor =
          it.type === "attachment" ? (adjuntosPorItem.get(it.linkId)?.length ?? 0) > 0 : valores.has(it.linkId);
        if (!tieneValor && it.type !== "group" && it.type !== "display") faltantes.push(it.linkId);
      }
      if (it.item) revisar(it.item);
    }
  })(entrada.questionnaire.item);

  if (faltantes.length) {
    throw new RespuestaInvalida(
      faltantes.length === 1 ? "Falta completar un dato obligatorio" : "Faltan datos obligatorios",
      faltantes
    );
  }

  const items = armar(entrada.questionnaire.item ?? [], valores, adjuntosPorItem, entrada.urlAdjunto);
  if (!items.length) throw new RespuestaInvalida("No hay nada para guardar");

  return {
    respuesta: {
      resourceType: "QuestionnaireResponse",
      questionnaire: `${entrada.questionnaire.url}|${entrada.questionnaire.version}`,
      status: "completed",
      subject: entrada.subject,
      source: entrada.source,
      authored: new Date().toISOString(),
      item: items,
    },
    valores: Object.fromEntries([...valores].map(([k, v]) => [k, plano(v)])),
  };
}

function armar(
  definicion: QuestionnaireItem[],
  valores: Map<string, Valor>,
  adjuntos: Map<string, Array<{ adjunto: AdjuntoEntrante; indice: number }>>,
  urlAdjunto: (indice: number) => string
): QuestionnaireResponseItem[] {
  const salida: QuestionnaireResponseItem[] = [];

  for (const def of definicion) {
    if (!condicionCumplida(def, valores)) continue;
    if (def.type === "display") continue;

    const hijos = def.item ? armar(def.item, valores, adjuntos, urlAdjunto) : [];

    if (def.type === "attachment") {
      const lista = adjuntos.get(def.linkId) ?? [];
      if (!lista.length) continue;
      salida.push({
        linkId: def.linkId,
        text: def.text,
        answer: lista.map(({ adjunto, indice }) => ({
          valueAttachment: {
            contentType: adjunto.contentType,
            title: adjunto.nombre,
            url: urlAdjunto(indice),
          },
        })),
      });
      continue;
    }

    if (def.type === "group") {
      if (hijos.length) salida.push({ linkId: def.linkId, text: def.text, item: hijos });
      continue;
    }

    const valor = valores.get(def.linkId);
    if (!valor && !hijos.length) continue;

    const item: QuestionnaireResponseItem = { linkId: def.linkId, text: def.text };
    if (valor) {
      const answer: QuestionnaireResponseAnswer = { ...valor };
      if (hijos.length) answer.item = hijos;
      item.answer = [answer];
    } else {
      item.item = hijos;
    }
    salida.push(item);
  }

  return salida;
}

/* ---------------------------------------------------------
   Adjuntos que llegan como data URL
   --------------------------------------------------------- */

const TIPOS_ADJUNTO = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
]);

export const MAX_ADJUNTOS = 10;
export const MAX_BYTES_ADJUNTO = 8 * 1024 * 1024;

/**
 * La app lee los archivos con FileReader y los manda como
 * "data:<tipo>;base64,...". Mismo formato que ya usan los
 * comprobantes de reintegro.
 */
export function decodificarAdjuntos(
  entrada: unknown,
  questionnaire: Questionnaire
): AdjuntoEntrante[] {
  if (!entrada) return [];
  if (!Array.isArray(entrada)) throw new RespuestaInvalida("Adjuntos inválidos");
  if (entrada.length > MAX_ADJUNTOS) {
    throw new RespuestaInvalida(`Podés adjuntar hasta ${MAX_ADJUNTOS} archivos`);
  }

  const indice = indexar(questionnaire.item);

  return entrada.map((a: any) => {
    const linkId = String(a?.linkId ?? "");
    const item = indice.get(linkId);
    if (!item || item.type !== "attachment") {
      throw new RespuestaInvalida("Adjuntaste un archivo en un campo que no existe");
    }

    const m = /^data:([\w/+.-]+);base64,(.+)$/.exec(String(a?.contenido ?? ""));
    if (!m) throw new RespuestaInvalida("No pudimos leer uno de los archivos");

    const contentType = m[1].toLowerCase();
    if (!TIPOS_ADJUNTO.has(contentType)) {
      throw new RespuestaInvalida("Los archivos tienen que ser imágenes o PDF");
    }

    const contenido = Buffer.from(m[2], "base64");
    if (!contenido.length) throw new RespuestaInvalida("Uno de los archivos vino vacío");
    if (contenido.length > MAX_BYTES_ADJUNTO) {
      throw new RespuestaInvalida("Cada archivo puede pesar hasta 8 MB");
    }

    return {
      linkId,
      etiqueta: item.text ?? linkId,
      nombre: String(a?.nombre ?? "archivo").slice(0, 200),
      contentType,
      contenido,
    };
  });
}
