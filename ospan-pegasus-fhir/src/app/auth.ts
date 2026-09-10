/* =========================================================
   AUTENTICACIÓN DE LA APP ASOCIADO
   Login en dos pasos: DNI -> código de un solo uso (OTP) al
   contacto que figura en el padrón -> token de sesión (JWT).

   Por qué OTP y no solo DNI: la app muestra datos clínicos de
   las mascotas (diagnósticos, informes de laboratorio). Con
   solo DNI, cualquiera que conozca el documento de un afiliado
   accede a su historia. El OTP prueba que además controla el
   teléfono/mail registrado.
   ========================================================= */

import crypto from "crypto";
import jwt, { type SignOptions } from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { getPool, buscarTutoresPorDocumento, type TutorRow } from "./deps";
import { enviarCodigo, elegirCanal } from "./notificaciones";

const JWT_SECRET = process.env.APP_JWT_SECRET || "";
const JWT_TTL = (process.env.APP_JWT_TTL || "12h") as SignOptions["expiresIn"];
const OTP_TTL_MIN = Number(process.env.APP_OTP_TTL_MIN || 10);
const OTP_MAX_INTENTOS = Number(process.env.APP_OTP_MAX_INTENTOS || 5);
// En desarrollo devolvemos el código en la respuesta para poder probar
// sin canal de envío configurado. NUNCA con NODE_ENV=production.
export const OTP_DEV_MODE =
  process.env.NODE_ENV !== "production" && process.env.APP_OTP_DEV !== "0";

if (!JWT_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("Falta APP_JWT_SECRET: la app no puede firmar sesiones.");
}

export interface SesionAsociado {
  relatedPersonId: string;
  documento: string;
  nombre: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      asociado?: SesionAsociado;
    }
  }
}

function hashCodigo(codigo: string, salt: string): string {
  return crypto.createHmac("sha256", JWT_SECRET || "dev").update(salt + ":" + codigo).digest("hex");
}

function generarCodigo(): string {
  // 6 dígitos, uniforme, sin sesgo de módulo.
  let n = "";
  while (n.length < 6) n += String(crypto.randomInt(0, 10));
  return n;
}

function normalizarDni(dni: unknown): string {
  return String(dni ?? "").replace(/\D/g, "");
}

function nombreCompleto(t: TutorRow): string {
  return [t.nombre, t.apellido].filter(Boolean).join(" ").trim() || "Afiliado/a";
}

/**
 * Paso 1: DNI -> se genera y envía un código.
 * Respondemos SIEMPRE lo mismo ante un DNI inexistente vs uno válido
 * salvo el 404 explícito, que el cliente ya maneja con un mensaje
 * genérico. (Si más adelante se quiere evitar enumeración de DNIs,
 * cambiar el 404 por un 200 con destinoEnmascarado nulo.)
 */
export async function solicitarCodigo(req: Request, res: Response) {
  const dni = normalizarDni(req.body?.dni);
  if (dni.length < 6) return res.status(400).json({ error: "DNI inválido" });

  const tutores = await buscarTutoresPorDocumento(dni);
  if (!tutores.length) return res.status(404).json({ error: "No encontramos un afiliado con ese DNI" });

  // Un documento puede matchear a más de un related_person. Tomamos el
  // que tenga un canal de contacto utilizable; si hay varios, el primero.
  const tutor = tutores.find((t) => !!elegirCanal(t)) || tutores[0];
  const canal = elegirCanal(tutor);
  if (!canal) {
    return res.status(409).json({
      error: "Tu cuenta no tiene un teléfono ni un email registrado. Contactanos para activarla.",
    });
  }

  // Rate limit simple: máximo 3 códigos por DNI cada 10 minutos.
  const { rows: recientes } = await getPool().query(
    `SELECT COUNT(*)::int AS n FROM app_asociado.otp_challenge
      WHERE dni = $1 AND creado_en > now() - interval '10 minutes'`,
    [dni]
  );
  if (recientes[0].n >= 3) {
    return res.status(429).json({ error: "Pediste demasiados códigos. Esperá unos minutos." });
  }

  const codigo = generarCodigo();
  const salt = crypto.randomBytes(8).toString("hex");
  await getPool().query(
    `INSERT INTO app_asociado.otp_challenge
       (dni, related_person_id, codigo_hash, canal, destino, expira_en, ip)
     VALUES ($1, $2, $3, $4, $5, now() + ($6 || ' minutes')::interval, $7)`,
    [dni, tutor.related_person_id, salt + "$" + hashCodigo(codigo, salt), canal.tipo, canal.destino, String(OTP_TTL_MIN), req.ip]
  );

  await enviarCodigo(canal, codigo, nombreCompleto(tutor));

  res.json({
    ok: true,
    canal: canal.tipo,
    destinoEnmascarado: canal.enmascarado,
    ...(OTP_DEV_MODE ? { devCode: codigo } : {}),
  });
}

/** Paso 2: DNI + código -> token de sesión. */
export async function verificarCodigo(req: Request, res: Response) {
  const dni = normalizarDni(req.body?.dni);
  const codigo = String(req.body?.codigo ?? "").replace(/\D/g, "");
  if (!dni || !codigo) return res.status(400).json({ error: "Faltan datos" });

  const { rows } = await getPool().query(
    `SELECT * FROM app_asociado.otp_challenge
      WHERE dni = $1 AND consumido = FALSE AND expira_en > now()
      ORDER BY creado_en DESC LIMIT 1`,
    [dni]
  );
  const challenge = rows[0];
  if (!challenge) return res.status(400).json({ error: "El código venció. Pedí uno nuevo." });

  if (challenge.intentos >= OTP_MAX_INTENTOS) {
    await getPool().query(`UPDATE app_asociado.otp_challenge SET consumido = TRUE WHERE id = $1`, [challenge.id]);
    return res.status(429).json({ error: "Demasiados intentos. Pedí un código nuevo." });
  }

  const [salt, esperado] = String(challenge.codigo_hash).split("$");
  const ok = crypto.timingSafeEqual(
    Buffer.from(hashCodigo(codigo, salt), "hex"),
    Buffer.from(esperado, "hex")
  );

  if (!ok) {
    await getPool().query(`UPDATE app_asociado.otp_challenge SET intentos = intentos + 1 WHERE id = $1`, [challenge.id]);
    return res.status(400).json({ error: "Código incorrecto" });
  }

  await getPool().query(`UPDATE app_asociado.otp_challenge SET consumido = TRUE WHERE id = $1`, [challenge.id]);

  const tutores = await buscarTutoresPorDocumento(dni);
  const tutor = tutores.find((t) => t.related_person_id === challenge.related_person_id) || tutores[0];

  const token = jwt.sign(
    { sub: challenge.related_person_id, dni, nombre: nombreCompleto(tutor) },
    JWT_SECRET || "dev",
    { expiresIn: JWT_TTL }
  );
  res.json({ ok: true, token });
}

/** Middleware: exige un JWT válido y deja la sesión en req.asociado. */
export function requiereSesion(req: Request, res: Response, next: NextFunction) {
  // Solo por header: el visor de adjuntos descarga el archivo con fetch y
  // lo muestra desde memoria, así que el token nunca necesita viajar en la
  // URL (donde quedaría en logs, historial y referrers).
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Sesión requerida" });
  try {
    const payload = jwt.verify(token, JWT_SECRET || "dev") as any;
    req.asociado = { relatedPersonId: payload.sub, documento: payload.dni, nombre: payload.nombre };
    next();
  } catch (_) {
    res.status(401).json({ error: "Sesión vencida" });
  }
}
