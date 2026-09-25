/* =========================================================
   CATÁLOGO DE TRÁMITES
   -----------------------------------------------------------
   Cada trámite es un recurso FHIR `Questionnaire`. La app no tiene
   ningún formulario escrito: pide el cuestionario y lo dibuja. Para
   agregar un trámite nuevo se agrega acá y se sube la versión; no se
   toca ni el front ni la base.

   Los 12 tipos son los mismos que hoy ofrece la autogestión de OSPAN
   (AUTOGESTION-PREPAN), donde los 12 comparten un único formulario de
   texto libre + adjuntos. Acá cada uno tiene sus campos, sus
   obligatorios y la documentación que pide por nombre.

   ÁMBITO
   - "mascota": el trámite es sobre una mascota. La app obliga a
     elegirla y el backend VALIDA contra el padrón que esa mascota sea
     del titular que inició sesión.
   - "titular": es sobre el titular; no lleva mascota.
   - "opcional": puede o no referirse a una mascota (consultas,
     reclamos).

   REGLAS
   Lo que se puede expresar en el cuestionario va en el cuestionario
   (`required`, `enableWhen`, `answerOption`). Las reglas de negocio
   —antigüedad, plazos, duplicados— van en `reglas.ts`, porque
   necesitan mirar el padrón y los trámites ya abiertos.

   PENDIENTE DE TERMINOLOGÍA: los ítems no llevan `code` (LOINC/
   SNOMED). Mismo criterio que la DDJJ: preferimos no inventar
   códigos. Cuando OSPAN defina el binding se agregan al Questionnaire
   y las respuestas ya guardadas siguen siendo válidas.
   ========================================================= */

import { env } from "../../config/env";
import type { Questionnaire, QuestionnaireItem } from "../../fhir/types/questionnaire";

export const TRAMITE_VERSION = "1.0.0";

export type AmbitoTramite = "mascota" | "titular" | "opcional";

export interface TipoTramite {
  /** Código estable, el que se guarda en la base. */
  codigo: string;
  titulo: string;
  /** Cómo se llama hoy en la autogestión de OSPAN. */
  etiquetaLegacy: string;
  ambito: AmbitoTramite;
  resumen: string;
  questionnaire: Questionnaire;
}

/* ---------------------------------------------------------
   Atajos para armar ítems. Son azúcar: todo lo que devuelven
   es FHIR estándar.
   --------------------------------------------------------- */

const texto = (linkId: string, text: string, required = false): QuestionnaireItem =>
  ({ linkId, text, type: "string", required });

const parrafo = (linkId: string, text: string, required = false): QuestionnaireItem =>
  ({ linkId, text, type: "text", required });

const fecha = (linkId: string, text: string, required = false): QuestionnaireItem =>
  ({ linkId, text, type: "date", required });

const monto = (linkId: string, text: string, required = false): QuestionnaireItem =>
  ({ linkId, text, type: "decimal", required });

const siNo = (linkId: string, text: string, required = false): QuestionnaireItem =>
  ({ linkId, text, type: "boolean", required });

const opciones = (
  linkId: string,
  text: string,
  valores: string[],
  required = false
): QuestionnaireItem => ({
  linkId,
  text,
  type: "choice",
  required,
  answerOption: valores.map((v) => ({ valueString: v })),
});

const adjunto = (
  linkId: string,
  text: string,
  required = false,
  varios = false
): QuestionnaireItem => ({ linkId, text, type: "attachment", required, repeats: varios });

const aviso = (linkId: string, text: string): QuestionnaireItem =>
  ({ linkId, text, type: "display" });

/** Muestra el ítem solo si otro se respondió con un valor dado. */
const si = (question: string, answerString: string) =>
  [{ question, operator: "=" as const, answerString }];

const siEs = (question: string, answerBoolean: boolean) =>
  [{ question, operator: "=" as const, answerBoolean }];

function cuestionario(
  slug: string,
  title: string,
  description: string,
  item: QuestionnaireItem[]
): Questionnaire {
  return {
    resourceType: "Questionnaire",
    id: `tramite-${slug}`,
    url: `${env.fhirSourceSystemBase}/Questionnaire/tramite-${slug}`,
    version: TRAMITE_VERSION,
    name: `Tramite${slug.replace(/-/g, "")}`,
    title,
    status: "active",
    subjectType: ["Patient", "RelatedPerson"],
    date: "2026-09-24",
    publisher: "OSPAN",
    description,
    item,
  };
}

/* ---------------------------------------------------------
   Bloques que se repiten en varios trámites.
   --------------------------------------------------------- */

const MEDIOS_PAGO = ["Débito en cuenta bancaria (CBU)", "Débito en tarjeta de crédito", "Cupón de pago"];

/**
 * Datos bancarios para débito.
 *
 * DECISIÓN: no se pide el número completo de la tarjeta. Guardar un PAN
 * obliga a todo el régimen PCI-DSS y no hace falta: para la tarjeta se
 * adjunta la autorización de débito y OSPAN la carga en el sistema de
 * cobranzas. Los últimos 4 dígitos alcanzan para identificarla.
 */
function bloqueMedioPago(prefijo: string, medios: string[] = MEDIOS_PAGO): QuestionnaireItem[] {
  return [
    opciones(`${prefijo}-medio`, "¿Con qué medio querés pagar?", medios, true),
    {
      ...texto(`${prefijo}-cbu`, "CBU o CVU (22 dígitos)", true),
      enableWhen: si(`${prefijo}-medio`, MEDIOS_PAGO[0]),
    },
    {
      ...texto(`${prefijo}-banco`, "Banco"),
      enableWhen: si(`${prefijo}-medio`, MEDIOS_PAGO[0]),
    },
    {
      ...texto(`${prefijo}-titular-cuenta`, "Titular de la cuenta (como figura en el banco)", true),
      enableWhen: si(`${prefijo}-medio`, MEDIOS_PAGO[0]),
    },
    {
      ...texto(`${prefijo}-tarjeta-marca`, "Marca de la tarjeta"),
      enableWhen: si(`${prefijo}-medio`, MEDIOS_PAGO[1]),
    },
    {
      ...texto(`${prefijo}-tarjeta-ultimos4`, "Últimos 4 dígitos de la tarjeta"),
      enableWhen: si(`${prefijo}-medio`, MEDIOS_PAGO[1]),
    },
    {
      ...aviso(
        `${prefijo}-tarjeta-aviso`,
        "Por seguridad no pedimos el número completo de la tarjeta. Adjuntá la autorización de débito firmada y te contactamos para completar la adhesión."
      ),
      enableWhen: si(`${prefijo}-medio`, MEDIOS_PAGO[1]),
    },
    {
      ...adjunto(`${prefijo}-autorizacion`, "Autorización de débito firmada", true),
      enableWhen: si(`${prefijo}-medio`, MEDIOS_PAGO[1]),
    },
  ];
}

const bloqueDomicilio = (prefijo: string, required = false): QuestionnaireItem[] => [
  texto(`${prefijo}-calle`, "Calle y número", required),
  texto(`${prefijo}-piso`, "Piso / depto."),
  texto(`${prefijo}-localidad`, "Localidad", required),
  texto(`${prefijo}-cp`, "Código postal", required),
  texto(`${prefijo}-provincia`, "Provincia", required),
];

const PLANES = ["100", "200", "300", "400", "410"];

/* =========================================================
   LOS 12 TRÁMITES
   ========================================================= */

export const TIPOS_TRAMITE: TipoTramite[] = [
  /* ----------------------------------------------------- 1 */
  {
    codigo: "CAMBIO_CANAL_PAGO",
    titulo: "Cambio de canal de pago",
    etiquetaLegacy: "CAMBIO DE CANAL DE PAGO",
    ambito: "titular",
    resumen: "Cambiar por qué medio pagás la cuota.",
    questionnaire: cuestionario(
      "cambio-canal-pago",
      "Cambio de canal de pago",
      "Cambio del medio por el que el titular paga la cuota.",
      [
        ...bloqueMedioPago("pago"),
        fecha("desde", "¿Desde qué período querés el cambio?"),
        parrafo("observaciones", "Observaciones"),
      ]
    ),
  },

  /* ----------------------------------------------------- 2 */
  {
    codigo: "CAMBIO_TITULARIDAD",
    titulo: "Cambio de titularidad",
    etiquetaLegacy: "CAMBIO DE TITULARIDAD",
    ambito: "mascota",
    resumen: "Pasar la mascota a otro titular.",
    questionnaire: cuestionario(
      "cambio-titularidad",
      "Cambio de titularidad",
      "Traspaso de la cobertura de una mascota a un nuevo titular.",
      [
        texto("nuevo-nombre", "Nombre del nuevo titular", true),
        texto("nuevo-apellido", "Apellido del nuevo titular", true),
        texto("nuevo-dni", "DNI del nuevo titular", true),
        texto("nuevo-email", "Email del nuevo titular", true),
        texto("nuevo-telefono", "Teléfono del nuevo titular", true),
        opciones(
          "vinculo",
          "¿Qué vínculo tenés con el nuevo titular?",
          ["Familiar", "Convivo con él/ella", "Adopción / entrega de la mascota", "Otro"],
          true
        ),
        {
          ...texto("vinculo-detalle", "Contanos el vínculo"),
          enableWhen: si("vinculo", "Otro"),
        },
        fecha("desde", "¿Desde cuándo?"),
        adjunto("doc-dni-nuevo", "DNI del nuevo titular (frente y dorso)", true, true),
        adjunto("doc-conformidad", "Conformidad firmada por ambas partes", true),
        parrafo("observaciones", "Observaciones"),
      ]
    ),
  },

  /* ----------------------------------------------------- 3 */
  {
    codigo: "CONSULTA",
    titulo: "Consulta",
    etiquetaLegacy: "CONSULTA",
    ambito: "opcional",
    resumen: "Cualquier duda que no entre en los otros trámites.",
    questionnaire: cuestionario("consulta", "Consulta", "Consulta general del afiliado.", [
      opciones(
        "tema",
        "¿Sobre qué es la consulta?",
        ["Cobertura", "Facturación y pagos", "Carencias", "Prestadores", "Uso de la app", "Otro"],
        true
      ),
      texto("asunto", "Asunto", true),
      parrafo("detalle", "Contanos tu consulta", true),
      adjunto("doc", "Si querés, adjuntá algo que ayude a entenderla", false, true),
    ]),
  },

  /* ----------------------------------------------------- 4 */
  {
    codigo: "ENVIO_DOCUMENTACION",
    titulo: "Envío de documentación",
    etiquetaLegacy: "ENVIO DE DOCUMENTACION",
    ambito: "opcional",
    resumen: "Mandar documentación que te pidieron.",
    questionnaire: cuestionario(
      "envio-documentacion",
      "Envío de documentación",
      "Documentación que el afiliado envía, normalmente por un trámite ya iniciado.",
      [
        opciones(
          "tipo-doc",
          "¿Qué documentación estás enviando?",
          [
            "DNI",
            "Constancia de CUIL / CUIT",
            "Comprobante de domicilio",
            "Libreta sanitaria de la mascota",
            "Factura o comprobante de pago",
            "Certificado veterinario",
            "Otra",
          ],
          true
        ),
        {
          ...texto("tipo-doc-detalle", "¿Qué documentación es?"),
          enableWhen: si("tipo-doc", "Otra"),
        },
        texto("tramite-relacionado", "Número de trámite al que corresponde (si lo tenés)"),
        adjunto("doc", "Documentación", true, true),
        parrafo("observaciones", "Observaciones"),
      ]
    ),
  },

  /* ----------------------------------------------------- 5 */
  {
    codigo: "MODIFICACION_DATOS_MASCOTA",
    titulo: "Modificación de datos de la mascota",
    etiquetaLegacy: "MODIFICACION DE DATOS MASCOTA",
    ambito: "mascota",
    resumen: "Corregir nombre, raza, fecha de nacimiento u otros datos.",
    questionnaire: cuestionario(
      "modificacion-datos-mascota",
      "Modificación de datos de la mascota",
      "Corrección de los datos de una mascota en el padrón de OSPAN.",
      [
        aviso("intro", "Marcá qué querés corregir y completá solo esos datos."),
        siNo("cambia-nombre", "¿Cambia el nombre?"),
        { ...texto("nombre", "Nombre correcto", true), enableWhen: siEs("cambia-nombre", true) },
        siNo("cambia-nacimiento", "¿Cambia la fecha de nacimiento?"),
        {
          ...fecha("fecha-nacimiento", "Fecha de nacimiento correcta", true),
          enableWhen: siEs("cambia-nacimiento", true),
        },
        siNo("cambia-sexo", "¿Cambia el sexo?"),
        {
          ...opciones("sexo", "Sexo correcto", ["Macho", "Hembra"], true),
          enableWhen: siEs("cambia-sexo", true),
        },
        siNo("cambia-raza", "¿Cambia la raza?"),
        { ...texto("raza", "Raza correcta", true), enableWhen: siEs("cambia-raza", true) },
        siNo("cambia-color", "¿Cambia el color de pelaje?"),
        { ...texto("color", "Color correcto", true), enableWhen: siEs("cambia-color", true) },
        siNo("cambia-castrado", "¿Cambió si está castrado/a?"),
        {
          ...opciones("castrado", "¿Está castrado/a?", ["Sí", "No"], true),
          enableWhen: siEs("cambia-castrado", true),
        },
        siNo("cambia-foto", "¿Querés actualizar la foto?"),
        {
          ...adjunto("foto", "Foto de la mascota", true),
          enableWhen: siEs("cambia-foto", true),
        },
        adjunto("doc-respaldo", "Libreta sanitaria o certificado veterinario que respalde el cambio", false, true),
        parrafo("observaciones", "Observaciones"),
      ]
    ),
  },

  /* ----------------------------------------------------- 6 */
  {
    codigo: "MODIFICACION_DATOS_PERSONALES",
    titulo: "Modificación de datos personales",
    etiquetaLegacy: "MODIFICACION DE DATOS PERSONALES",
    ambito: "titular",
    resumen: "Actualizar tu domicilio, teléfono o email.",
    questionnaire: cuestionario(
      "modificacion-datos-personales",
      "Modificación de datos personales",
      "Actualización de los datos de contacto del titular.",
      [
        siNo("cambia-domicilio", "¿Cambia el domicilio?"),
        ...bloqueDomicilio("dom").map((i) => ({
          ...i,
          enableWhen: siEs("cambia-domicilio", true),
        })),
        {
          ...adjunto("doc-domicilio", "Comprobante de domicilio", false, true),
          enableWhen: siEs("cambia-domicilio", true),
        },
        siNo("cambia-telefono", "¿Cambia el teléfono?"),
        { ...texto("telefono", "Teléfono", true), enableWhen: siEs("cambia-telefono", true) },
        siNo("cambia-email", "¿Cambia el email?"),
        { ...texto("email", "Email", true), enableWhen: siEs("cambia-email", true) },
        parrafo("observaciones", "Observaciones"),
      ]
    ),
  },

  /* ----------------------------------------------------- 7 */
  {
    codigo: "PEDIDO_ADHESION_DEBITO",
    titulo: "Adhesión al débito automático",
    etiquetaLegacy: "PEDIDO DE ADHESION AL DEBITO AUTOMATICO",
    ambito: "titular",
    resumen: "Que la cuota se debite sola todos los meses.",
    questionnaire: cuestionario(
      "adhesion-debito",
      "Adhesión al débito automático",
      "Alta del débito automático de la cuota.",
      [
        // En el débito automático no entra el cupón de pago.
        ...bloqueMedioPago("debito", [MEDIOS_PAGO[0], MEDIOS_PAGO[1]]),
        parrafo("observaciones", "Observaciones"),
      ]
    ),
  },

  /* ----------------------------------------------------- 8 */
  {
    codigo: "PEDIDO_BAJA",
    titulo: "Pedido de baja",
    etiquetaLegacy: "PEDIDO DE BAJA",
    ambito: "opcional",
    resumen: "Dar de baja una mascota o todo el grupo.",
    questionnaire: cuestionario(
      "pedido-baja",
      "Pedido de baja",
      "Solicitud de baja de la cobertura, de una mascota o de todo el grupo familiar.",
      [
        opciones("alcance", "¿Qué querés dar de baja?", ["Solo esta mascota", "Todo el grupo"], true),
        opciones(
          "motivo",
          "¿Por qué motivo?",
          [
            "Motivos económicos",
            "No usé el servicio",
            "Disconformidad con la atención",
            "Fallecimiento de la mascota",
            "Cambio de cobertura",
            "Otro",
          ],
          true
        ),
        { ...parrafo("motivo-detalle", "Contanos un poco más", true), enableWhen: si("motivo", "Otro") },
        {
          ...fecha("fecha-fallecimiento", "Fecha del fallecimiento"),
          enableWhen: si("motivo", "Fallecimiento de la mascota"),
        },
        fecha("desde", "¿Desde qué fecha querés la baja?", true),
        adjunto("doc", "Si corresponde, adjuntá documentación", false, true),
        aviso(
          "aviso-deuda",
          "La baja se procesa con las cuotas al día y según el preaviso previsto en el contrato. Te confirmamos por este mismo trámite."
        ),
      ]
    ),
  },

  /* ----------------------------------------------------- 9 */
  {
    codigo: "RECLAMO",
    titulo: "Reclamo",
    etiquetaLegacy: "RECLAMO",
    ambito: "opcional",
    resumen: "Algo no salió como esperabas.",
    questionnaire: cuestionario("reclamo", "Reclamo", "Reclamo del afiliado.", [
      opciones(
        "motivo",
        "¿Sobre qué es el reclamo?",
        [
          "Atención en la veterinaria",
          "Autorización demorada o rechazada",
          "Reintegro",
          "Facturación o cobro",
          "Credencial / afiliación",
          "Otro",
        ],
        true
      ),
      fecha("fecha-hecho", "¿Cuándo pasó?", true),
      texto("prestador", "Veterinaria o prestador (si aplica)"),
      parrafo("detalle", "Contanos qué pasó", true),
      texto("tramite-relacionado", "Número de trámite relacionado (si lo hay)"),
      adjunto("doc", "Adjuntá lo que respalde el reclamo", false, true),
    ]),
  },

  /* ---------------------------------------------------- 10 */
  {
    codigo: "SOLICITUD_CAMBIO_PLAN",
    titulo: "Solicitud de cambio de plan",
    etiquetaLegacy: "SOLICITUD CAMBIO DE PLAN",
    ambito: "mascota",
    resumen: "Subir o bajar el plan de tu mascota.",
    questionnaire: cuestionario(
      "cambio-plan",
      "Solicitud de cambio de plan",
      "Cambio del plan de cobertura de una mascota.",
      [
        opciones("plan-solicitado", "¿A qué plan querés pasar?", PLANES, true),
        opciones(
          "motivo",
          "¿Por qué?",
          ["Necesito más cobertura", "Quiero bajar el costo", "Cambió la situación de mi mascota", "Otro"],
          true
        ),
        { ...parrafo("motivo-detalle", "Contanos un poco más", true), enableWhen: si("motivo", "Otro") },
        fecha("desde", "¿Desde qué período?"),
        aviso(
          "aviso-carencias",
          "Al subir de plan, las prestaciones nuevas empiezan con las carencias del plan al que pasás."
        ),
        parrafo("observaciones", "Observaciones"),
      ]
    ),
  },

  /* ---------------------------------------------------- 11 */
  {
    codigo: "SOLICITUD_FACTURA_A",
    titulo: "Solicitud de factura A",
    etiquetaLegacy: "SOLICITUD DE FACTURA A",
    ambito: "titular",
    resumen: "Recibir la factura a nombre de tu empresa.",
    questionnaire: cuestionario(
      "factura-a",
      "Solicitud de factura A",
      "Pedido de facturación tipo A a nombre de una razón social.",
      [
        texto("razon-social", "Razón social", true),
        texto("cuit", "CUIT", true),
        opciones(
          "condicion-iva",
          "Condición frente al IVA",
          ["Responsable Inscripto", "Monotributista", "Exento"],
          true
        ),
        ...bloqueDomicilio("fiscal", true),
        texto("email-facturacion", "Email al que enviamos la factura", true),
        adjunto("doc-afip", "Constancia de inscripción de AFIP", true),
        fecha("desde", "¿Desde qué período?"),
        parrafo("observaciones", "Observaciones"),
      ]
    ),
  },

  /* ---------------------------------------------------- 12 */
  {
    codigo: "SOLICITUD_REINTEGRO",
    titulo: "Solicitud de reintegro",
    etiquetaLegacy: "SOLICITUD REINTEGRO",
    ambito: "mascota",
    resumen: "Pedir que te devuelvan lo que pagaste.",
    questionnaire: cuestionario(
      "reintegro",
      "Solicitud de reintegro",
      "Pedido de reintegro por una prestación abonada por el afiliado.",
      [
        opciones(
          "tipo-prestacion",
          "¿Qué prestación pagaste?",
          [
            "Consulta veterinaria",
            "Vacunación",
            "Estudios / laboratorio",
            "Diagnóstico por imágenes",
            "Cirugía",
            "Internación",
            "Medicamentos",
            "Urgencia",
            "Otra",
          ],
          true
        ),
        { ...texto("tipo-detalle", "¿Cuál?", true), enableWhen: si("tipo-prestacion", "Otra") },
        fecha("fecha-prestacion", "¿Qué día fue?", true),
        texto("prestador", "Veterinaria o profesional que la hizo", true),
        monto("monto", "Monto abonado", true),
        adjunto("doc-factura", "Factura o recibo a tu nombre", true, true),
        adjunto("doc-orden", "Orden, receta o informe (si lo tenés)", false, true),
        aviso("aviso-cbu", "El reintegro se acredita por transferencia."),
        texto("cbu", "CBU o CVU donde acreditamos el reintegro", true),
        texto("titular-cuenta", "Titular de la cuenta", true),
        parrafo("observaciones", "Observaciones"),
      ]
    ),
  },
];

/* ---------------------------------------------------------
   Accesos
   --------------------------------------------------------- */

const PORCODIGO = new Map(TIPOS_TRAMITE.map((t) => [t.codigo, t]));

export function tipoTramite(codigo: string): TipoTramite | null {
  return PORCODIGO.get(String(codigo || "").toUpperCase()) ?? null;
}

/** Lo mínimo para dibujar la pantalla de "nuevo trámite". */
export function catalogoPublico() {
  return TIPOS_TRAMITE.map((t) => ({
    codigo: t.codigo,
    titulo: t.titulo,
    resumen: t.resumen,
    ambito: t.ambito,
  }));
}

export function canonicalDe(t: TipoTramite): string {
  return `${t.questionnaire.url}|${t.questionnaire.version}`;
}
