/* =========================================================
   RUTAS DE LA APP ASOCIADO — /api/app/*
   Montadas sobre el mismo backend del conector, para reusar el pool
   de la RDS, el adapter de Pegasus y la persistencia versionada de
   `fhir_repo`.

   Regla transversal: NINGUNA ruta acepta un id_hub del cliente sin
   antes verificar contra el padrón que esa mascota pertenece al
   tutor de la sesión (`mascotaPerteneceATutor`).
   ========================================================= */

import { Router, type Request, type Response, type NextFunction, type RequestHandler } from "express";
import crypto from "crypto";
import { Readable } from "stream";
import fs from "fs";
import path from "path";
import {
  getPool,
  obtenerEstudiosPaciente,
  obtenerOrdenPorId,
  listarMascotasDeTutor,
  mascotaPerteneceATutor,
  buscarTutoresPorDocumento,
  type PadronPacienteConTutor,
  type OrdenMedicaActualRow,
} from "./deps";
import { solicitarCodigo, verificarCodigo, requiereSesion } from "./auth";
import { mapearOrden, urlAdjuntoOriginal } from "./mapping";

export const appAsociadoRouter = Router();

/**
 * `padron.patient.especie_id` es un entero y la tabla de especies vive en
 * otro schema (`terminology`), que este backend no lee. Mientras tanto,
 * mapa mínimo — PENDIENTE DE CONFIRMAR con OSPAN. Si un id no está acá,
 * la app simplemente no muestra la especie (degrada, no rompe).
 */
const ESPECIES: Record<number, string> = { 1: "Perro", 2: "Gato" };

/**
 * Configuración que la app necesita ANTES de tener sesión. No expone
 * nada sensible: solo banderas de presentación.
 */
appAsociadoRouter.get("/config", (_req, res) => {
  res.json({
    // Cartel "Vista preliminar" en las pantallas que todavía no tienen
    // datos de producción. Se apaga borrando el Secret.
    vistaPreliminar: (process.env.APP_VISTA_PRELIMINAR || "") === "1",
  });
});

/* ---------------- auth ---------------- */
appAsociadoRouter.post("/auth/solicitar-codigo", asyncH(solicitarCodigo));
appAsociadoRouter.post("/auth/verificar", asyncH(verificarCodigo));

/* ---------------- perfil + mascotas ---------------- */
appAsociadoRouter.get("/me", requiereSesion, asyncH(async (req, res) => {
  const { relatedPersonId, documento } = req.asociado!;
  const [tutores, mascotas] = await Promise.all([
    buscarTutoresPorDocumento(documento),
    listarMascotasDeTutor(documento, relatedPersonId),
  ]);
  const tutor = tutores.find((t) => t.related_person_id === relatedPersonId) ?? tutores[0];

  res.json({
    nombre: tutor?.nombre ?? "",
    apellido: tutor?.apellido ?? "",
    dni: formatearDni(documento),
    numeroAfiliado: numeroDeCuenta(mascotas),
    estadoCuenta: mascotas.some((m) => esActivo(m.estado)) ? "activo" : "suspendido",
    mascotas: mascotas.map((m) => ({
      id: m.identificador_ospan ?? m.nro_carnet ?? m.id_hub,
      idHub: m.id_hub,
      nombre: m.nombre ?? m.legacy_nombre ?? "—",
      especie: m.especie_id != null ? (ESPECIES[m.especie_id] ?? "") : "",
      raza: m.legacy_raza ?? m.raza_ospan_code ?? "",
      sexo: (m.sexo ?? "").toLowerCase(),
      // PENDIENTE: el plan (100/200/300/400/410) no es una columna de
      // padron.patient. Hasta saber de dónde sale, la app oculta el tag de
      // plan y la credencial usa una base por defecto.
      plan: "",
      estado: m.estado ?? "",
      // Foto: `photo_key` es el nombre del archivo en public/app/assets/img.
      // Si no hay archivo, la app muestra las iniciales.
      foto: urlFoto(m.photo_key),
      iniciales: (m.nombre ?? m.legacy_nombre ?? "??").slice(0, 2).toUpperCase(),
      fechaNacimiento: fecha(m.fecha_nacimiento),
      alta: fecha(m.fecha_alta),
      cobertura: "—",
      carencias: "—",
      detalles: "-",
    })),
  });
}));

/* ---------------- Foto de la mascota ----------------
   `padron.patient.photo_key` guarda el NOMBRE del archivo, y el archivo
   vive en public/app/assets/img (la misma carpeta que sirve la PWA).

   - Se usa solo el nombre (path.basename): un photo_key con "../" o con
     una ruta no puede apuntar fuera de la carpeta de imágenes.
   - Solo extensiones de imagen.
   - Si el archivo no está en la carpeta se devuelve null, y la app cae
     en las iniciales en vez de mostrar una imagen rota.
   - La URL es relativa a /app/, que es desde donde cargan las pantallas.
   ------------------------------------------------------ */
const DIR_FOTOS = path.resolve(process.cwd(), "public/app/assets/img");
const EXT_IMAGEN = /\.(jpe?g|png|webp|gif)$/i;

function urlFoto(photoKey: unknown): string | null {
  const archivo = path.basename(String(photoKey ?? "").trim().replace(/\\/g, "/"));
  if (!archivo || !EXT_IMAGEN.test(archivo)) return null;
  if (!fs.existsSync(path.join(DIR_FOTOS, archivo))) return null;
  return "assets/img/" + encodeURIComponent(archivo);
}

/* ---------------- Mis Resultados ---------------- */
appAsociadoRouter.get("/mascotas/:idHub/ordenes", requiereSesion, asyncH(async (req, res) => {
  const mascota = await mascotaPerteneceATutor(req.params.idHub, req.asociado!.relatedPersonId);
  if (!mascota) return res.status(404).json({ error: "Mascota no encontrada" });

  // Local-first con fallback en vivo: es el mismo servicio que usa el back
  // office, así que hereda la persistencia de todo lo que trae.
  const r = await obtenerEstudiosPaciente({ idHub: mascota.id_hub });
  res.json({
    origen: r.fuente,
    ordenes: r.ordenes.map((o) => ({ ...mapearOrden(o), origen: r.fuente })),
  });
}));

appAsociadoRouter.get("/ordenes/:id", requiereSesion, asyncH(async (req, res) => {
  const encontrada = await cargarOrdenDelAsociado(req.params.id, req.asociado!.relatedPersonId);
  if (!encontrada) return res.status(404).json({ error: "Orden no encontrada" });
  res.json({ ...mapearOrden(encontrada.orden), origen: encontrada.fuente });
}));

/**
 * Proxy de adjuntos. Las URLs que da Pegasus son públicas, permanentes y
 * sin token: no se le mandan al celular ni se loguean. El backend las
 * resuelve, valida la pertenencia y devuelve el archivo por streaming.
 */
appAsociadoRouter.get("/ordenes/:id/adjuntos/:n", requiereSesion, asyncH(async (req, res) => {
  const encontrada = await cargarOrdenDelAsociado(req.params.id, req.asociado!.relatedPersonId);
  if (!encontrada) return res.status(404).json({ error: "Orden no encontrada" });

  const url = urlAdjuntoOriginal(encontrada.orden, Number(req.params.n));
  if (!url) return res.status(404).json({ error: "Adjunto no encontrado" });

  // Si Pegasus no responde (red caída, dominio inaccesible), eso NO es un
  // error del backend: es un 502 con mensaje, para que la app muestre
  // "no pudimos abrir este archivo" en vez de una pantalla rota.
  // `Response` acá es el de Express: para la respuesta de fetch usamos su
  // propio tipo, sin importar nada.
  let upstream: Awaited<ReturnType<typeof fetch>>;
  try {
    upstream = await fetch(url);
  } catch (err) {
    console.error("[app-asociado] adjunto inaccesible:", err);
    return res.status(502).json({ error: "No pudimos traer el archivo" });
  }
  if (!upstream.ok || !upstream.body) {
    return res.status(502).json({ error: "No pudimos traer el archivo" });
  }
  res.setHeader("Content-Type", upstream.headers.get("content-type") ?? "application/octet-stream");
  res.setHeader("Cache-Control", "private, max-age=300");
  res.setHeader("Content-Disposition", "inline");
  Readable.fromWeb(upstream.body as any).pipe(res);
}));

/* ---------------- token de atención ---------------- */
appAsociadoRouter.post("/mascotas/:idHub/token-atencion", requiereSesion, asyncH(async (req, res) => {
  const mascota = await mascotaPerteneceATutor(req.params.idHub, req.asociado!.relatedPersonId);
  if (!mascota) return res.status(404).json({ error: "Mascota no encontrada" });

  const ttl = Number(process.env.APP_TOKEN_TTL_MIN || 15);
  let codigo = "";
  while (codigo.length < 6) codigo += String(crypto.randomInt(0, 10));

  await getPool().query(
    `insert into app_asociado.token_atencion
       (codigo, id_hub, patient_id, related_person_id, expira_en)
     values ($1, $2, $3, $4, now() + ($5 || ' minutes')::interval)`,
    [codigo, mascota.id_hub, mascota.id, req.asociado!.relatedPersonId, String(ttl)]
  );

  res.json({ codigo, expiraEn: ttl * 60, qr: `OSPAN|${mascota.id_hub}|${codigo}` });
}));

/* ---------------- contrato ---------------- */
appAsociadoRouter.get("/contrato", requiereSesion, asyncH(async (req, res) => {
  const { rows } = await getPool().query(
    `select * from app_asociado.contrato
      where related_person_id = $1 order by fecha_firma desc limit 1`,
    [req.asociado!.relatedPersonId]
  );
  const c = rows[0];
  if (!c) {
    // Todavía no existe el circuito de alta con firma desde la app: se
    // muestra lo que se puede derivar del padrón.
    const mascotas = await listarMascotasDeTutor(req.asociado!.documento, req.asociado!.relatedPersonId);
    return res.json({
      codigo: "—",
      fechaFirma: "—",
      vigenciaDesde: fecha(mascotas[0]?.fecha_alta) || "—",
      vigenciaHasta: "—",
      planesAsociados: mascotas.map((m) => m.nombre ?? "").filter(Boolean),
      archivoUrl: null,
    });
  }
  res.json({
    codigo: c.codigo,
    fechaFirma: fecha(c.fecha_firma),
    vigenciaDesde: fecha(c.vigencia_desde),
    vigenciaHasta: fecha(c.vigencia_hasta),
    planesAsociados: c.planes ?? [],
    archivoUrl: c.archivo_url,
  });
}));

/* ---------------- directorio ---------------- */
appAsociadoRouter.get("/directorio", requiereSesion, asyncH(async (_req, res) => {
  const { rows } = await getPool().query(
    `select nombre, categoria, zona, telefono, horario_texto, abierto
       from app_asociado.prestador where activo order by zona, nombre`
  );
  res.json(
    rows.map((p: any) => ({
      nombre: p.nombre,
      categoria: p.categoria,
      zona: p.zona,
      distancia: "—", // TODO: con lat/lng, cuando la app mande su posición
      telefono: p.telefono ?? "",
      abierto: p.abierto,
      horarioTexto: p.horario_texto ?? "",
    }))
  );
}));

/* ---------------- historial de prestaciones ---------------- */
appAsociadoRouter.get("/historial", requiereSesion, asyncH(async (req, res) => {
  // Derivado de las órdenes ya sincronizadas de las mascotas del tutor.
  // Cuando entre el adapter de ThingSoft, las prestaciones liquidadas
  // salen de ahí y esto se reemplaza.
  const mascotas = await listarMascotasDeTutor(req.asociado!.documento, req.asociado!.relatedPersonId);
  if (!mascotas.length) return res.json([]);

  const { rows } = await getPool().query(
    `select id_hub, fecha_orden, estado_nombre, id_estado,
            raw_pegasus->>'SucursalNombre' as sucursal
       from fhir_repo.orden_medica_actual
      where id_hub = any($1)
      order by fecha_orden desc nulls last
      limit 20`,
    [mascotas.map((m) => m.id_hub)]
  );

  res.json(
    rows.map((r: any) => ({
      prestador: r.sucursal ?? "—",
      fecha: fecha(r.fecha_orden),
      mascotaId: r.id_hub,
      // 3 = Realizada, 5 = Realizada informe pendiente
      estado: r.id_estado === 3 || r.id_estado === 5 ? "autorizado" : "auditoria",
      cubierto: "—", // los importes vienen en 0 desde Panda (sin convenio)
    }))
  );
}));

/* ---------------- helpers ---------------- */

/** Trae la orden y valida que sea de una mascota del tutor de la sesión. */
async function cargarOrdenDelAsociado(
  id: string,
  relatedPersonId: string
): Promise<{ orden: OrdenMedicaActualRow; fuente: "local" | "vivo" } | null> {
  const r = await obtenerOrdenPorId(id);
  if (!r.orden) return null;
  const idHub = r.orden.id_hub ?? r.orden.raw_pegasus?.IdHub ?? null;
  if (!idHub) return null;
  const mascota = await mascotaPerteneceATutor(idHub, relatedPersonId);
  return mascota ? { orden: r.orden, fuente: r.fuente } : null;
}

function esActivo(estado: string | null): boolean {
  return (estado ?? "").toLowerCase().startsWith("activ");
}

/**
 * En el padrón, `identificador_ospan` viene como "<nro de cuenta>/<orden>"
 * (100200/01, 100200/02): el número del titular es el prefijo, común a
 * todas sus mascotas.
 */
/**
 * Número que el afiliado ve en la home.
 *
 * Se prefiere `nro_carnet`, y se descarta cualquier valor que sea el
 * mismo identificador interno de la mascota (el id_hub): según cómo esté
 * armada la consulta del padrón, `identificador_ospan` puede terminar
 * apuntando a esa misma columna, y mostrarle "pet_990001" como número de
 * afiliado no le dice nada a la persona.
 */
function numeroDeCuenta(mascotas: PadronPacienteConTutor[]): string {
  for (const m of mascotas) {
    const candidatos = [m.nro_carnet, m.identificador_ospan];
    for (const c of candidatos) {
      const id = String(c ?? "").trim();
      if (!id || id === m.id_hub) continue;
      // "100200/01" -> "100200": el número de la cuenta es el prefijo.
      return id.includes("/") ? id.split("/")[0] : id;
    }
  }
  return "—";
}

function fecha(v: unknown): string {
  if (!v) return "";
  const d = new Date(v as string);
  return isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, 10);
}

function formatearDni(d: string): string {
  return String(d).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Envuelve un handler async para que un throw llegue al error handler. */
function asyncH(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve(fn(req, res, next)).catch(next);
  };
}
