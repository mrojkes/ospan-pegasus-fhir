/* =========================================================
   ENVÍO DEL CÓDIGO DE ACCESO
   Un solo lugar para elegir el canal y mandar el mensaje.

   Hoy: solo LOG (el código se ve en la consola de Replit y, en
   dev, vuelve en la respuesta para poder probar).
   Cuando OSPAN defina el proveedor (WhatsApp Business API,
   Twilio, un SMTP), se implementa acá adentro y nada más
   del backend cambia.
   ========================================================= */

import type { TutorRow } from "./deps";

export type TipoCanal = "whatsapp" | "sms" | "email";

export interface Canal {
  tipo: TipoCanal;
  destino: string;
  enmascarado: string;
}

function soloDigitos(s: string): string {
  return String(s || "").replace(/\D/g, "");
}

function enmascararTelefono(tel: string): string {
  const d = soloDigitos(tel);
  if (d.length < 6) return "•••";
  return "+" + d.slice(0, 3) + " •• ••••-" + d.slice(-4);
}

function enmascararEmail(email: string): string {
  const [u, dom] = String(email).split("@");
  if (!dom) return "•••";
  const visible = u.slice(0, 2);
  return visible + "•".repeat(Math.max(1, u.length - 2)) + "@" + dom;
}

/**
 * Preferencia: WhatsApp > SMS > email. La app le dice al usuario por
 * dónde le llegó, así que el orden importa para la UX, no solo técnico.
 */
export function elegirCanal(tutor: TutorRow): Canal | null {
  const tel = soloDigitos(tutor.telefono || "");
  if (tel.length >= 10) {
    const tipo: TipoCanal = process.env.APP_CANAL_TELEFONO === "sms" ? "sms" : "whatsapp";
    return { tipo, destino: tel, enmascarado: enmascararTelefono(tel) };
  }
  const email = (tutor.email || "").trim();
  if (email.includes("@")) {
    return { tipo: "email", destino: email, enmascarado: enmascararEmail(email) };
  }
  return null;
}

export async function enviarCodigo(canal: Canal, codigo: string, nombre: string): Promise<void> {
  const mensaje =
    `Hola ${nombre}: tu código para ingresar a la app de OSPAN es ${codigo}. ` +
    `Vence en 10 minutos. Si no lo pediste, ignorá este mensaje.`;

  // TODO(OSPAN): reemplazar por el proveedor real.
  //   whatsapp -> WhatsApp Business API / proveedor local
  //   sms      -> Twilio, Infobip, etc.
  //   email    -> SMTP institucional
  // Mientras tanto queda el log: alcanza para probar en Replit.
  console.log(`[app-asociado][otp][${canal.tipo}] -> ${canal.enmascarado}: ${mensaje}`);
}
