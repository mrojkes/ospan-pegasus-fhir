/* =========================================================
   ENVÍO DEL CÓDIGO DE ACCESO
   Un solo lugar para saber por dónde se le puede escribir a un
   tutor y para mandarle el mensaje.

   Canales:
   - email     : implementado de verdad con SMTP (nodemailer). Se
                 activa solo si están los Secrets SMTP_*; si no, cae
                 al log como los demás.
   - whatsapp  : pendiente de proveedor (WhatsApp Business API).
   - sms       : pendiente de proveedor (Twilio, Infobip, etc.).

   Mientras un canal no tenga proveedor configurado, el código sale
   por consola: alcanza para probar el circuito completo en Replit.
   ========================================================= */

import type { TutorRow } from "./deps";

export type TipoCanal = "whatsapp" | "sms" | "email";

export interface Canal {
  tipo: TipoCanal;
  destino: string;
  /** Versión que se le muestra al afiliado, sin revelar el dato completo. */
  enmascarado: string;
  /** Texto del botón en la pantalla de login. */
  etiqueta: string;
}

function soloDigitos(s: string | null): string {
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
  return u.slice(0, 2) + "•".repeat(Math.max(1, u.length - 2)) + "@" + dom;
}

/**
 * Canales por los que este tutor puede recibir el código, según lo que
 * tenga cargado en el padrón. El orden es el que ve el afiliado en
 * pantalla: primero el teléfono, que es lo más inmediato.
 *
 * Si el padrón no tiene ni teléfono ni email, devuelve lista vacía y el
 * login no puede seguir (la app le pide que llame a OSPAN).
 */
export function canalesDisponibles(tutor: TutorRow): Canal[] {
  const canales: Canal[] = [];

  const tel = soloDigitos(tutor.telefono);
  if (tel.length >= 10) {
    const tipo: TipoCanal = process.env.APP_CANAL_TELEFONO === "sms" ? "sms" : "whatsapp";
    canales.push({
      tipo,
      destino: tel,
      enmascarado: enmascararTelefono(tel),
      etiqueta: tipo === "sms" ? "Por SMS" : "Por WhatsApp",
    });
  }

  const email = (tutor.email || "").trim();
  if (email.includes("@")) {
    canales.push({
      tipo: "email",
      destino: email,
      enmascarado: enmascararEmail(email),
      etiqueta: "Por correo electrónico",
    });
  }

  return canales;
}

/** Lo que se le manda al cliente: nunca el destino real, solo el enmascarado. */
export function canalPublico(c: Canal) {
  return { tipo: c.tipo, enmascarado: c.enmascarado, etiqueta: c.etiqueta };
}

/* ---------------------------------------------------------
   Envío
   --------------------------------------------------------- */

const SMTP_CONFIGURADO = !!(process.env.SMTP_HOST && process.env.SMTP_USER);

function cuerpoDelMensaje(codigo: string, nombre: string, minutos: number): string {
  return (
    `Hola ${nombre}: tu código para ingresar a la app de OSPAN es ${codigo}. ` +
    `Vence en ${minutos} minutos. Si no lo pediste, ignorá este mensaje.`
  );
}

async function enviarPorEmail(canal: Canal, codigo: string, nombre: string, minutos: number): Promise<boolean> {
  if (!SMTP_CONFIGURADO) return false;

  // Import dinámico: si nodemailer no está instalado o SMTP no se usa, el
  // backend arranca igual.
  const nodemailer = await import("nodemailer");
  const transporte = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: (process.env.SMTP_SECURE ?? "false") === "true",
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASSWORD || "" },
  });

  await transporte.sendMail({
    from: process.env.SMTP_FROM || `OSPAN <${process.env.SMTP_USER}>`,
    to: canal.destino,
    subject: `Tu código de ingreso: ${codigo}`,
    text: cuerpoDelMensaje(codigo, nombre, minutos),
    html:
      `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:480px">` +
      `<p>Hola ${escapar(nombre)},</p>` +
      `<p>Tu código para ingresar a la app de OSPAN es:</p>` +
      `<p style="font-size:32px;font-weight:700;letter-spacing:6px;color:#001753;margin:24px 0">${codigo}</p>` +
      `<p style="color:#64748b;font-size:14px">Vence en ${minutos} minutos. Si no lo pediste, podés ignorar este mensaje.</p>` +
      `</div>`,
  });
  return true;
}

function escapar(s: string): string {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

async function enviarPorTelefono(_canal: Canal, _mensaje: string): Promise<boolean> {
  // TODO(OSPAN): enchufar el proveedor cuando esté definido.
  //   whatsapp -> WhatsApp Business API / proveedor local
  //   sms      -> Twilio, Infobip, etc.
  // La firma ya es la definitiva: solo hay que implementar el envío acá
  // y devolver true. Nada más del backend cambia.
  return false;
}

/**
 * Manda el código por el canal elegido. Si ese canal todavía no tiene
 * proveedor configurado, lo escribe en la consola (visible en Replit) para
 * poder probar igual, y avisa que fue por log.
 */
export async function enviarCodigo(
  canal: Canal,
  codigo: string,
  nombre: string,
  minutos: number
): Promise<{ entregado: boolean }> {
  const mensaje = cuerpoDelMensaje(codigo, nombre, minutos);
  try {
    const entregado =
      canal.tipo === "email"
        ? await enviarPorEmail(canal, codigo, nombre, minutos)
        : await enviarPorTelefono(canal, mensaje);

    if (entregado) {
      console.log(`[app-asociado][otp][${canal.tipo}] enviado a ${canal.enmascarado}`);
      return { entregado: true };
    }
  } catch (err) {
    // Un fallo del proveedor no debe dejar al afiliado sin poder entrar
    // mientras estamos probando: se loguea y el código igual queda válido.
    console.error(`[app-asociado][otp][${canal.tipo}] error enviando a ${canal.enmascarado}:`, err);
  }

  console.log(`[app-asociado][otp][${canal.tipo}][SIN PROVEEDOR] -> ${canal.enmascarado}: ${mensaje}`);
  return { entregado: false };
}
