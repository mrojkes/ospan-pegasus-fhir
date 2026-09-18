/* =========================================================
   AUTENTICACIÓN DE LA APP ASOCIADO
   Login: DNI -> código de un solo uso (OTP) al contacto que
   figura en el padrón -> token de sesión (JWT).

   Por qué OTP y no solo DNI: la app muestra datos clínicos de
   las mascotas (diagnósticos, informes de laboratorio). Con
   solo DNI, cualquiera que conozca el documento de un afiliado
   accede a su historia. El OTP prueba que además controla el
   teléfono/mail registrado.

   ---------------------------------------------------------
   CÓDIGO DE ACCESO INTERNO (etapa de pruebas)
   ---------------------------------------------------------
   Mientras WhatsApp/SMS no tengan proveedor y el mail salga
   desde una casilla provisoria, hace falta poder entrar con
   datos REALES del padrón sin mandarle nada a beneficiarios
   de verdad. Para eso existe APP_CODIGO_MAESTRO.

   Es una llave maestra: con ese código y un DNI del padrón se
   entra a la cuenta de ese afiliado. Por eso:
   - Vive SOLO en un Secret. Nunca en el repo (que es público).
   - Si el Secret no está, la función no existe: no hay código
     maestro por defecto ni valor de respaldo.
   - No dispara ningún envío: se elige explícitamente en
     pantalla ("Ingresar con código interno").
   - Cada uso queda registrado en app_asociado.otp_challenge
     con canal='interno' y un aviso en el log del servidor.

   Para desactivarlo: se borra el Secret. Nada más.
   ========================================================= */

import crypto from "crypto";
import jwt, { type SignOptions } from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { getPool, buscarTutoresPorDocumento, type TutorRow } from "./deps";
import { enviarCodigo, canalesDisponibles, canalPublico, type Canal, type TipoCanal } from "./notificaciones";

const JWT_SECRET = process.env.APP_JWT_SECRET || "";
const JWT_TTL = (process.env.APP_JWT_TTL || "12h") as SignOptions["expiresIn"];
const OTP_TTL_MIN = Number(process.env.APP_OTP_TTL_MIN || 10);
const OTP_MAX_INTENTOS = Number(process.env.APP_OTP_MAX_INTENTOS || 5);
// En desarrollo devolvemos el código en la respuesta para poder probar
// sin canal de envío configurado. NUNCA con NODE_ENV=production.
export const OTP_DEV_MODE =
  process.env.NODE_ENV !== "production" && process.env.APP_OTP_DEV !== "0";

/**
 * Código de acceso interno. Vacío = desactivado (comportamiento por
 * defecto). Ver la nota del encabezado antes de activarlo.
 */
const CODIGO_MAESTRO = (process.env.APP_CODIGO_MAESTRO || "").trim();
export const MAESTRO_ACTIVO = CODIGO_MAESTRO.length > 0;

if (MAESTRO_ACTIVO) {
  console.warn(
    "[app-asociado] ATENCIÓN: código de acceso interno ACTIVO. " +
      "Cualquiera que lo conozca puede entrar con el DNI de un afiliado. " +
      "Borrá el Secret APP_CODIGO_MAESTRO antes de abrir la app a afiliados reales."
  );
}

if (!JWT_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("Falta APP_JWT_SECRET: la app no puede firmar sesiones.");
}

/** Opción que se agrega a la lista solo cuando el acceso interno está activo. */
const CANAL_INTERNO = {
  tipo: "interno" as const,
  etiqueta: "Ingresar con código interno",
  enmascarado: "Solo para pruebas — no envía nada",
};

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
 * Paso 1: DNI -> canales disponibles y/o envío del código.
 *
 * Si el tutor tiene más de un canal cargado en el padrón (teléfono Y
 * email) y todavía no eligió, NO se manda nada: se devuelven los canales
 * enmascarados para que elija en pantalla. Con un solo canal se manda
 * directo, porque no hay nada que preguntar.
 *
 * Nunca se devuelve el teléfono ni el email completos, solo la versión
 * enmascarada: la pantalla es previa a probar identidad.
 */
export async function solicitarCodigo(req: Request, res: Response) {
  const dni = normalizarDni(req.body?.dni);
  // "interno" no es un canal de envío: es la opción de acceso de pruebas.
  const canalPedido = String(req.body?.canal ?? "").trim() as TipoCanal | "interno" | "";
  if (dni.length < 6) return res.status(400).json({ error: "DNI inválido" });

  const tutores = await buscarTutoresPorDocumento(dni);
  if (!tutores.length) return res.status(404).json({ error: "No encontramos un afiliado con ese DNI" });

  // Un documento puede matchear a más de un related_person: nos quedamos
  // con el primero que tenga algún canal de contacto utilizable.
  const tutor = tutores.find((t) => canalesDisponibles(t).length > 0) ?? tutores[0];
  const canales = canalesDisponibles(tutor);

  // Con el acceso interno activo se ofrece como una opción más, y NUNCA se
  // manda nada solo: aunque el afiliado tenga un único canal, primero se
  // pregunta. Así elegir no dispara un mail a una persona real por error.
  const opciones = MAESTRO_ACTIVO ? [...canales.map(canalPublico), CANAL_INTERNO] : canales.map(canalPublico);

  if (!opciones.length) {
    return res.status(409).json({
      error: "Tu cuenta no tiene un teléfono ni un email registrado. Contactanos para activarla.",
    });
  }

  if (canalPedido === "interno") {
    if (!MAESTRO_ACTIVO) return res.status(400).json({ error: "Ese medio de contacto no está disponible" });
    // No se genera ni se manda nada: el código lo sabe quien está probando.
    return res.json({ ok: true, canal: "interno", sinEnvio: true, entregado: false, canales: opciones });
  }

  // Elección del canal.
  let canal: Canal;
  if (canalPedido) {
    const elegido = canales.find((c) => c.tipo === canalPedido);
    if (!elegido) return res.status(400).json({ error: "Ese medio de contacto no está disponible" });
    canal = elegido;
  } else if (opciones.length > 1 || !canales.length) {
    // Se pregunta siempre que haya más de una opción, y TAMBIÉN cuando no
    // hay ningún canal de envío real: en ese caso la única opción es el
    // acceso interno, que no manda nada. Sin este `|| !canales.length`,
    // `canales[0]` quedaba `undefined` y el pedido explotaba más abajo
    // con "Cannot read properties of undefined (reading 'tipo')".
    return res.json({ requiereEleccion: true, canales: opciones });
  } else {
    canal = canales[0];
  }

  // Rate limit: máximo 3 códigos por DNI cada 10 minutos. Se cuenta acá,
  // después de resolver el canal, para que pedir la lista de opciones no
  // consuma intentos.
  const { rows: recientes } = await getPool().query(
    `select count(*)::int as n from app_asociado.otp_challenge
      where dni = $1 and creado_en > now() - interval '10 minutes'`,
    [dni]
  );
  if (recientes[0].n >= 3) {
    return res.status(429).json({ error: "Pediste demasiados códigos. Esperá unos minutos." });
  }

  const codigo = generarCodigo();
  const salt = crypto.randomBytes(8).toString("hex");
  await getPool().query(
    `insert into app_asociado.otp_challenge
       (dni, related_person_id, codigo_hash, canal, destino, expira_en, ip)
     values ($1, $2, $3, $4, $5, now() + ($6 || ' minutes')::interval, $7)`,
    [
      dni,
      tutor.related_person_id,
      salt + "$" + hashCodigo(codigo, salt),
      canal.tipo,
      canal.destino,
      String(OTP_TTL_MIN),
      req.ip,
    ]
  );

  const { entregado } = await enviarCodigo(canal, codigo, nombreCompleto(tutor), OTP_TTL_MIN);

  res.json({
    ok: true,
    canal: canal.tipo,
    destinoEnmascarado: canal.enmascarado,
    // Cuando el canal todavía no tiene proveedor configurado, el código
    // sale por consola: se avisa para que la app no prometa un envío que
    // no ocurrió.
    entregado,
    // Otros canales, para el link "probar por otro medio".
    canales: opciones,
    ...(OTP_DEV_MODE ? { devCode: codigo } : {}),
  });
}

/** Paso 2: DNI + código -> token de sesión. */
export async function verificarCodigo(req: Request, res: Response) {
  const dni = normalizarDni(req.body?.dni);
  // Sin normalizar: el código interno puede no ser solo numérico.
  const codigoCrudo = String(req.body?.codigo ?? "").trim();
  const codigo = codigoCrudo.replace(/\D/g, "");
  if (!dni || !codigoCrudo) return res.status(400).json({ error: "Faltan datos" });

  // --- Acceso interno (etapa de pruebas, ver nota del encabezado) ---
  if (MAESTRO_ACTIVO && esCodigoMaestro(codigoCrudo)) {
    const tutores = await buscarTutoresPorDocumento(dni);
    if (!tutores.length) return res.status(404).json({ error: "No encontramos un afiliado con ese DNI" });
    const tutor = tutores[0];

    // Rastro de auditoría: queda igual que un OTP, con canal 'interno' y ya
    // consumido, para poder saber después quién entró así y cuándo.
    await getPool().query(
      `insert into app_asociado.otp_challenge
         (dni, related_person_id, codigo_hash, canal, destino, expira_en, consumido, ip)
       values ($1, $2, $3, 'interno', 'acceso interno', now(), true, $4)`,
      [dni, tutor.related_person_id, "-", req.ip]
    );
    console.warn(
      `[app-asociado] ACCESO INTERNO usado — DNI ${dni} (${nombreCompleto(tutor)}), IP ${req.ip}`
    );

    return res.json({ ok: true, token: firmarSesion(tutor.related_person_id, dni, nombreCompleto(tutor)) });
  }

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

  res.json({ ok: true, token: firmarSesion(challenge.related_person_id, dni, nombreCompleto(tutor)) });
}

function firmarSesion(relatedPersonId: string, dni: string, nombre: string): string {
  return jwt.sign({ sub: relatedPersonId, dni, nombre }, JWT_SECRET || "dev", { expiresIn: JWT_TTL });
}

/** Comparación de duración constante, para no filtrar el código por tiempos. */
function esCodigoMaestro(codigo: string): boolean {
  const a = Buffer.from(codigo);
  const b = Buffer.from(CODIGO_MAESTRO);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
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
