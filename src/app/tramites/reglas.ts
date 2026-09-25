/* =========================================================
   REGLAS DE NEGOCIO DE LOS TRÁMITES
   -----------------------------------------------------------
   Lo que el Questionnaire NO puede expresar. El cuestionario sabe
   qué campos son obligatorios y cuáles dependen de otros; no sabe
   si la mascota está activa, si ya hay un trámite igual abierto o
   si se cumplió la antigüedad para cambiar de plan.

   Todas las reglas se evalúan ACÁ, antes de crear el expediente, y
   devuelven un motivo en castellano que la app muestra tal cual.

   PARAMETRIZABLES POR SECRET
   Los plazos son política de OSPAN, no del software, así que no los
   inventamos: por defecto están en 0 = sin límite, y se activan
   poniendo el Secret correspondiente.

     APP_TRAMITE_PLAZO_REINTEGRO_DIAS      (ej. 90)
     APP_TRAMITE_ANTIGUEDAD_CAMBIO_PLAN_MESES (ej. 6)
   ========================================================= */

import type { PadronPacienteConTutor } from "../deps";

const PLAZO_REINTEGRO_DIAS = Number(process.env.APP_TRAMITE_PLAZO_REINTEGRO_DIAS || 0);
const ANTIGUEDAD_CAMBIO_PLAN_MESES = Number(
  process.env.APP_TRAMITE_ANTIGUEDAD_CAMBIO_PLAN_MESES || 0
);

export class ReglaIncumplida extends Error {}

export interface ContextoRegla {
  tipo: string;
  valores: Record<string, boolean | string | number>;
  mascota: PadronPacienteConTutor | null;
  /** Tipos de trámite que este tutor/mascota ya tiene sin cerrar. */
  abiertosDelMismoTipo: number;
}

/**
 * Trámites que se pueden iniciar aunque la mascota esté dada de baja
 * o suspendida: son justamente los que sirven para resolver eso.
 */
const SIN_EXIGIR_MASCOTA_ACTIVA = new Set([
  "CONSULTA",
  "RECLAMO",
  "ENVIO_DOCUMENTACION",
  "PEDIDO_BAJA",
  "SOLICITUD_REINTEGRO",
]);

/** Un trámite abierto del mismo tipo alcanza: el resto son duplicados. */
const ADMITE_VARIOS_ABIERTOS = new Set(["CONSULTA", "RECLAMO", "ENVIO_DOCUMENTACION", "SOLICITUD_REINTEGRO"]);

const hoy = () => new Date().toISOString().slice(0, 10);

function diasDesde(fecha: string): number {
  const ms = Date.now() - new Date(`${fecha}T00:00:00Z`).getTime();
  return Math.floor(ms / 86400000);
}

function mesesDesde(fecha: string | Date | null | undefined): number | null {
  if (!fecha) return null;
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(d.getTime())) return null;
  const ahora = new Date();
  return (ahora.getFullYear() - d.getFullYear()) * 12 + (ahora.getMonth() - d.getMonth());
}

function esActivo(estado: unknown): boolean {
  const e = String(estado ?? "").toLowerCase();
  return e === "" || e.startsWith("act") || e === "a" || e === "vigente";
}

export function validarReglas(ctx: ContextoRegla): void {
  const v = ctx.valores;

  if (ctx.mascota && !SIN_EXIGIR_MASCOTA_ACTIVA.has(ctx.tipo) && !esActivo(ctx.mascota.estado)) {
    throw new ReglaIncumplida(
      "La cobertura de esta mascota no está activa. Iniciá una consulta o un reclamo y lo vemos."
    );
  }

  if (ctx.abiertosDelMismoTipo > 0 && !ADMITE_VARIOS_ABIERTOS.has(ctx.tipo)) {
    throw new ReglaIncumplida(
      "Ya tenés un trámite de este tipo en curso. Seguilo desde Mis trámites o adjuntá lo que falte ahí."
    );
  }

  // Ninguna fecha de un hecho ya ocurrido puede ser futura.
  for (const campo of ["fecha-prestacion", "fecha-hecho", "fecha-fallecimiento"]) {
    const f = v[campo];
    if (typeof f === "string" && f > hoy()) {
      throw new ReglaIncumplida("La fecha no puede ser posterior a hoy.");
    }
  }

  switch (ctx.tipo) {
    case "SOLICITUD_REINTEGRO": {
      const monto = Number(v["monto"]);
      if (!Number.isFinite(monto) || monto <= 0) {
        throw new ReglaIncumplida("El monto tiene que ser mayor a cero.");
      }
      const fecha = String(v["fecha-prestacion"] ?? "");
      if (PLAZO_REINTEGRO_DIAS > 0 && fecha && diasDesde(fecha) > PLAZO_REINTEGRO_DIAS) {
        throw new ReglaIncumplida(
          `Los reintegros se piden dentro de los ${PLAZO_REINTEGRO_DIAS} días de la prestación.`
        );
      }
      exigirCbu(v["cbu"]);
      break;
    }

    case "SOLICITUD_CAMBIO_PLAN": {
      // PENDIENTE: el plan vigente todavía no es una columna del padrón
      // (ver PENDIENTES del proyecto). Cuando lo sea, acá se compara
      // contra el plan solicitado y se rechaza "cambio al mismo plan".
      if (ANTIGUEDAD_CAMBIO_PLAN_MESES > 0) {
        const meses = mesesDesde(ctx.mascota?.fecha_alta as any);
        if (meses !== null && meses < ANTIGUEDAD_CAMBIO_PLAN_MESES) {
          throw new ReglaIncumplida(
            `El cambio de plan se puede pedir a partir de los ${ANTIGUEDAD_CAMBIO_PLAN_MESES} meses de antigüedad.`
          );
        }
      }
      break;
    }

    case "CAMBIO_CANAL_PAGO":
    case "PEDIDO_ADHESION_DEBITO": {
      const prefijo = ctx.tipo === "CAMBIO_CANAL_PAGO" ? "pago" : "debito";
      if (String(v[`${prefijo}-medio`] ?? "").includes("CBU")) exigirCbu(v[`${prefijo}-cbu`]);
      break;
    }

    case "SOLICITUD_FACTURA_A": {
      const cuit = String(v["cuit"] ?? "").replace(/\D/g, "");
      if (cuit.length !== 11) throw new ReglaIncumplida("El CUIT tiene que tener 11 dígitos.");
      break;
    }

    case "CAMBIO_TITULARIDAD": {
      const dni = String(v["nuevo-dni"] ?? "").replace(/\D/g, "");
      if (dni.length < 7 || dni.length > 8) {
        throw new ReglaIncumplida("El DNI del nuevo titular no parece válido.");
      }
      const email = String(v["nuevo-email"] ?? "");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        throw new ReglaIncumplida("El email del nuevo titular no parece válido.");
      }
      break;
    }

    case "PEDIDO_BAJA": {
      const desde = String(v["desde"] ?? "");
      if (desde && desde < hoy()) {
        throw new ReglaIncumplida("La baja no puede pedirse con fecha anterior a hoy.");
      }
      break;
    }

    case "MODIFICACION_DATOS_MASCOTA": {
      const algunCambio = Object.keys(v).some((k) => k.startsWith("cambia-") && v[k] === true);
      if (!algunCambio) throw new ReglaIncumplida("Marcá al menos un dato para corregir.");
      break;
    }

    case "MODIFICACION_DATOS_PERSONALES": {
      const algunCambio = ["cambia-domicilio", "cambia-telefono", "cambia-email"].some(
        (k) => v[k] === true
      );
      if (!algunCambio) throw new ReglaIncumplida("Marcá al menos un dato para actualizar.");
      const email = v["email"];
      if (typeof email === "string" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        throw new ReglaIncumplida("El email no parece válido.");
      }
      break;
    }
  }
}

/**
 * Un CBU/CVU son 22 dígitos. No se valida el dígito verificador acá
 * para no rechazar cuentas válidas por una implementación propia: eso
 * lo hace el sistema de cobranzas al cargarla.
 */
function exigirCbu(valor: unknown): void {
  const cbu = String(valor ?? "").replace(/\D/g, "");
  if (cbu.length !== 22) throw new ReglaIncumplida("El CBU/CVU tiene que tener 22 dígitos.");
}
