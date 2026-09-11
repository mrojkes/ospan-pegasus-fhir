/* =========================================================
   API CLIENT — App Asociado OSPAN
   Única puerta de entrada a datos de todas las pantallas.
   Dos modos:
     - real  : pega a /api/app/* del backend (conector Pegasus)
     - mock  : usa window.MOCK_* (mock-data.js) para demo sin backend
   El modo se decide en APP_CONFIG.api.mock, y se puede forzar
   desde la consola con localStorage.setItem("ospan_mock","1").
   ========================================================= */
window.AppApi = (function () {
  const cfg = window.APP_CONFIG;
  const BASE = (cfg.api && cfg.api.baseUrl) || "/api/app";
  const TOKEN_KEY = "ospan_app_token";
  const ME_KEY = "ospan_app_me";

  /**
   * Demo o datos reales. El valor de localStorage manda sobre la config,
   * para poder alternar sin tocar archivos. El default es "auto": demo
   * solo cuando la página se abrió con doble clic (file://), porque ahí
   * no hay backend; servida por el servidor, siempre datos reales.
   */
  function isMock() {
    try {
      const forced = localStorage.getItem("ospan_mock");
      if (forced === "1") return true;
      if (forced === "0") return false;
    } catch (_) {}
    const modo = cfg.api && cfg.api.mock;
    if (modo === "auto" || modo == null) return window.location.protocol === "file:";
    return !!modo;
  }

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY); } catch (_) { return null; }
  }
  function setToken(t) {
    try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (_) {}
  }
  function cacheMe(me) {
    try { me ? sessionStorage.setItem(ME_KEY, JSON.stringify(me)) : sessionStorage.removeItem(ME_KEY); } catch (_) {}
  }
  function cachedMe() {
    try { const s = sessionStorage.getItem(ME_KEY); return s ? JSON.parse(s) : null; } catch (_) { return null; }
  }

  class ApiError extends Error {
    constructor(status, message, payload) {
      super(message); this.status = status; this.payload = payload;
    }
  }

  async function request(method, path, body) {
    const headers = { Accept: "application/json" };
    if (body) headers["Content-Type"] = "application/json";
    const token = getToken();
    if (token) headers.Authorization = "Bearer " + token;
    const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    let payload = null;
    try { payload = await res.json(); } catch (_) {}
    if (res.status === 401) { logout(); throw new ApiError(401, "Sesión vencida", payload); }
    if (!res.ok) throw new ApiError(res.status, (payload && payload.error) || "Error de servidor", payload);
    return payload;
  }

  // ---------- sesión ----------
  function isLoggedIn() { return isMock() ? !!getToken() : !!getToken(); }

  function logout() { setToken(null); cacheMe(null); }

  function requireSession() {
    if (!isLoggedIn()) { window.location.replace("afil-login.html"); return false; }
    return true;
  }

  // ---------- auth OTP ----------
  /**
   * Paso 1 del login. Sin `canal`, el backend puede responder
   * { requiereEleccion: true, canales: [...] } cuando el afiliado tiene
   * más de un medio de contacto cargado en el padrón: ahí la app le
   * muestra las opciones y vuelve a llamar con el elegido.
   */
  async function solicitarCodigo(dni, canal) {
    if (isMock()) {
      await delay(400);
      const canales = [
        { tipo: "whatsapp", enmascarado: "+549 •• ••••-5678", etiqueta: "Por WhatsApp" },
        { tipo: "email", enmascarado: "ma••••••••@example.com", etiqueta: "Por correo electrónico" },
      ];
      if (!canal) return { requiereEleccion: true, canales: canales };
      const elegido = canales.find(function (c) { return c.tipo === canal; }) || canales[0];
      return { ok: true, canal: elegido.tipo, destinoEnmascarado: elegido.enmascarado,
               entregado: false, canales: canales, devCode: "123456" };
    }
    return request("POST", "/auth/solicitar-codigo", canal ? { dni: dni, canal: canal } : { dni: dni });
  }

  async function verificarCodigo(dni, codigo) {
    if (isMock()) {
      await delay(400);
      if (codigo !== "123456") throw new ApiError(400, "Código incorrecto");
      setToken("mock-token"); cacheMe(null);
      return { ok: true };
    }
    const r = await request("POST", "/auth/verificar", { dni, codigo });
    setToken(r.token); cacheMe(null);
    return r;
  }

  // ---------- afiliado ----------
  async function me(force) {
    const c = !force && cachedMe();
    if (c) return c;
    let data;
    if (isMock()) { await delay(150); data = JSON.parse(JSON.stringify(window.MOCK_AFILIADO)); }
    else data = await request("GET", "/me");
    cacheMe(data);
    return data;
  }

  function findMascota(afiliado, key) {
    return afiliado.mascotas.find((m) => m.idHub === key || m.id === key) || afiliado.mascotas[0];
  }

  // ---------- resultados (órdenes médicas de Pegasus) ----------
  async function ordenesDeMascota(idHub) {
    if (isMock()) {
      await delay(300);
      return { origen: "mock", ordenes: (window.MOCK_ORDENES || []).filter((o) => o.idHub === idHub) };
    }
    return request("GET", "/mascotas/" + encodeURIComponent(idHub) + "/ordenes");
  }

  async function orden(id) {
    if (isMock()) {
      await delay(300);
      const o = (window.MOCK_ORDENES || []).find((x) => String(x.id) === String(id));
      if (!o) throw new ApiError(404, "Orden no encontrada");
      return o;
    }
    return request("GET", "/ordenes/" + encodeURIComponent(id));
  }

  /**
   * Descarga el adjunto con el header de sesión y devuelve una URL local
   * (blob) para mostrarlo. Así el token nunca viaja en la URL — que se ve
   * en logs, historial y referrers — y podemos distinguir un error del
   * servidor de un archivo válido, en vez de meter un iframe a ciegas.
   * Quien lo llama debe hacer revocarAdjunto(url) al cerrar el visor.
   */
  async function adjuntoBlobUrl(ordenId, n) {
    if (isMock()) return null;
    const token = getToken();
    const res = await fetch(BASE + "/ordenes/" + encodeURIComponent(ordenId) + "/adjuntos/" + n, {
      headers: token ? { Authorization: "Bearer " + token } : {},
    });
    if (res.status === 401) { logout(); throw new ApiError(401, "Sesión vencida"); }
    if (!res.ok) throw new ApiError(res.status, "No pudimos abrir el archivo");
    const blob = await res.blob();
    return { url: URL.createObjectURL(blob), tipo: blob.type };
  }

  function revocarAdjunto(url) {
    try { if (url) URL.revokeObjectURL(url); } catch (_) {}
  }

  // ---------- otros ----------
  async function historial() {
    if (isMock()) { await delay(150); return window.MOCK_HISTORIAL; }
    return request("GET", "/historial");
  }
  async function contrato() {
    if (isMock()) { await delay(150); return window.MOCK_CONTRATO; }
    return request("GET", "/contrato");
  }
  async function directorio() {
    if (isMock()) { await delay(150); return window.MOCK_VETERINARIAS; }
    return request("GET", "/directorio");
  }
  async function tokenAtencion(idHub) {
    if (isMock()) {
      await delay(200);
      let code = ""; for (let i = 0; i < 6; i++) code += Math.floor(Math.random() * 10);
      return { codigo: code, expiraEn: 900, qr: "OSPAN|" + idHub + "|" + code };
    }
    return request("POST", "/mascotas/" + encodeURIComponent(idHub) + "/token-atencion");
  }

  function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }

  /* ---------- configuración de presentación (sin sesión) ---------- */
  let configCache = null;
  async function config() {
    if (configCache) return configCache;
    if (isMock()) { configCache = { vistaPreliminar: true }; return configCache; }
    try { configCache = await request("GET", "/config"); }
    catch (_) { configCache = { vistaPreliminar: false }; }
    return configCache;
  }

  /* ---------- cartilla de prestadores ---------- */
  async function cartilla(zona) {
    if (isMock()) { await delay(200); return window.MOCK_CARTILLA || []; }
    return request("GET", "/cartilla" + (zona ? "?zona=" + encodeURIComponent(zona) : ""));
  }
  async function prestador(id) {
    if (isMock()) { await delay(150); return (window.MOCK_CARTILLA || []).find(function (p) { return String(p.id) === String(id); }); }
    return request("GET", "/cartilla/" + encodeURIComponent(id));
  }
  async function disponibilidad(prestadorId, fecha) {
    if (isMock()) { await delay(200); return { fecha: fecha, horas: ["09:00", "10:30", "14:00", "17:00"] }; }
    return request("GET", "/cartilla/" + encodeURIComponent(prestadorId) + "/disponibilidad?fecha=" + encodeURIComponent(fecha));
  }

  /* ---------- autorizaciones ---------- */
  async function autorizaciones() {
    if (isMock()) { await delay(200); return window.MOCK_AUTORIZACIONES || []; }
    return request("GET", "/autorizaciones");
  }
  async function crearAutorizacion(datos) {
    if (isMock()) { await delay(400); return Object.assign({ codigo: "AUT-DEMO", estado: "pendiente" }, datos); }
    return request("POST", "/autorizaciones", datos);
  }

  /* ---------- turnos ---------- */
  async function turnos() {
    if (isMock()) { await delay(200); return window.MOCK_TURNOS || []; }
    return request("GET", "/turnos");
  }
  async function crearTurno(datos) {
    if (isMock()) { await delay(400); return Object.assign({ codigo: "TUR-DEMO", estado: "solicitado" }, datos); }
    return request("POST", "/turnos", datos);
  }

  /* ---------- copagos ---------- */
  async function copagos() {
    if (isMock()) { await delay(200); return { plan: null, items: window.MOCK_COPAGOS || [] }; }
    return request("GET", "/copagos");
  }

  /* ---------- reintegros ---------- */
  async function reintegros() {
    if (isMock()) { await delay(200); return window.MOCK_REINTEGROS || []; }
    return request("GET", "/reintegros");
  }
  async function crearReintegro(datos) {
    if (isMock()) { await delay(500); return Object.assign({ codigo: "REI-DEMO", estado: "pendiente" }, datos); }
    return request("POST", "/reintegros", datos);
  }
  function comprobanteUrl(adjuntoId) {
    return BASE + "/reintegros/adjuntos/" + encodeURIComponent(adjuntoId);
  }
  /** Igual que los adjuntos de estudios: se baja con el header de sesión. */
  async function comprobanteBlobUrl(adjuntoId) {
    if (isMock()) return null;
    const token = getToken();
    const res = await fetch(comprobanteUrl(adjuntoId), { headers: token ? { Authorization: "Bearer " + token } : {} });
    if (res.status === 401) { logout(); throw new ApiError(401, "Sesión vencida"); }
    if (!res.ok) throw new ApiError(res.status, "No pudimos abrir el comprobante");
    const blob = await res.blob();
    return { url: URL.createObjectURL(blob), tipo: blob.type };
  }

  /* ---------- DDJJ ---------- */
  async function ddjj(idHub) {
    if (isMock()) { await delay(200); return window.MOCK_DDJJ; }
    return request("GET", "/mascotas/" + encodeURIComponent(idHub) + "/ddjj");
  }
  /** `items` son los item[] de un QuestionnaireResponse; el recurso final
   *  lo arma y valida el servidor. */
  async function guardarDdjj(idHub, items) {
    if (isMock()) {
      await delay(400);
      return {
        ok: true,
        actualizadaEn: new Date().toISOString(),
        questionnaireResponse: { resourceType: "QuestionnaireResponse", status: "completed", item: items },
      };
    }
    return request("POST", "/mascotas/" + encodeURIComponent(idHub) + "/ddjj", { item: items });
  }

  /* ---------- comunidad ---------- */
  async function comunidad(tipo) {
    if (isMock()) {
      await delay(200);
      const todos = window.MOCK_COMUNIDAD || [];
      return !tipo || tipo === "Todos" ? todos : todos.filter(function (c) { return c.tipo === tipo; });
    }
    return request("GET", "/comunidad" + (tipo && tipo !== "Todos" ? "?tipo=" + encodeURIComponent(tipo) : ""));
  }

  /* ---------- recordatorios ---------- */
  async function recordatorios() {
    if (isMock()) { await delay(150); return window.MOCK_RECORDATORIOS || []; }
    return request("GET", "/recordatorios");
  }

  function fmtPesos(n) {
    const v = Number(n);
    if (!isFinite(v)) return "—";
    return "$" + v.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }



  // ---------- helpers de presentación ----------
  function fmtFecha(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
  }
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  return {
    ApiError, isMock, isLoggedIn, logout, requireSession,
    solicitarCodigo, verificarCodigo, me, findMascota,
    ordenesDeMascota, orden, adjuntoBlobUrl, revocarAdjunto,
    historial, contrato, directorio, tokenAtencion,
    config, cartilla, prestador, disponibilidad,
    autorizaciones, crearAutorizacion,
    turnos, crearTurno,
    copagos,
    reintegros, crearReintegro, comprobanteBlobUrl,
    ddjj, guardarDdjj,
    comunidad, recordatorios,
    fmtFecha, fmtPesos, escapeHtml,
  };
})();
