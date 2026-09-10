/* =========================================================
   RENDER + LÓGICA — Login en dos pasos (DNI + código)
   Paso 1: DNI → POST /auth/solicitar-codigo (busca al tutor en el
           padrón y manda un código por WhatsApp/SMS/email).
   Paso 2: código → POST /auth/verificar → token de sesión.
   En modo mock el código es 123456 (se muestra en pantalla).
   ========================================================= */
(function () {
  const cfg = window.APP_CONFIG;
  const api = window.AppApi;
  let paso = 1;
  let dniActual = "";

  function renderTexts() {
    document.getElementById("auth-logo").src = cfg.brand.logoCompleto;
    document.getElementById("auth-logo").alt = cfg.brand.nombre;
    document.getElementById("auth-subtitle").textContent = cfg.login.subtitulo;
    document.getElementById("form-label").textContent = cfg.login.inputLabel;
    document.getElementById("dni-input").placeholder = cfg.login.inputPlaceholder;
    document.getElementById("login-cta").textContent = cfg.login.ctaLabel;
    document.getElementById("security-note").textContent = cfg.login.notaSeguridad;
    document.getElementById("contact-phone-row").textContent = "Línea de atención: " + cfg.ayuda.general.telefono;
    document.getElementById("contact-hours-row").textContent = cfg.ayuda.general.horario;
  }

  function setError(msg) {
    const el = document.getElementById("login-error");
    el.textContent = msg || "";
    el.classList.toggle("hidden", !msg);
  }

  function setBusy(busy) {
    const cta = document.getElementById("login-cta");
    cta.disabled = busy;
    cta.classList.toggle("is-loading", busy);
  }

  function irAPaso2(info) {
    paso = 2;
    document.getElementById("step-dni").classList.add("hidden");
    document.getElementById("step-codigo").classList.remove("hidden");
    document.getElementById("login-cta").textContent = "Confirmar código";
    const hint = document.getElementById("codigo-hint");
    const canal = { whatsapp: "WhatsApp", sms: "SMS", email: "email" }[info.canal] || "tu contacto registrado";
    hint.textContent = "Te enviamos un código por " + canal + (info.destinoEnmascarado ? " a " + info.destinoEnmascarado : "") + ".";
    if (info.devCode) {
      const dev = document.getElementById("codigo-dev");
      dev.textContent = "Modo demo: el código es " + info.devCode;
      dev.classList.remove("hidden");
    }
    const codigo = document.getElementById("codigo-input");
    codigo.value = "";
    codigo.focus();
    document.getElementById("login-cta").disabled = true;
  }

  function volverAPaso1() {
    paso = 1;
    setError("");
    document.getElementById("step-codigo").classList.add("hidden");
    document.getElementById("step-dni").classList.remove("hidden");
    document.getElementById("login-cta").textContent = cfg.login.ctaLabel;
    document.getElementById("login-cta").disabled = document.getElementById("dni-input").value.trim().length < 6;
  }

  async function submit() {
    setError("");
    setBusy(true);
    try {
      if (paso === 1) {
        dniActual = document.getElementById("dni-input").value.replace(/\D/g, "");
        const info = await api.solicitarCodigo(dniActual);
        irAPaso2(info);
      } else {
        const codigo = document.getElementById("codigo-input").value.trim();
        await api.verificarCodigo(dniActual, codigo);
        window.location.replace("afil-home.html");
        return;
      }
    } catch (e) {
      // 400 (código incorrecto/vencido), 409 (sin contacto registrado) y
      // 429 (demasiados intentos) traen del backend un mensaje pensado
      // para el afiliado: se muestra tal cual en vez de uno genérico.
      if (e.status === 404) setError("No encontramos un afiliado con ese DNI. Verificá el número o contactanos.");
      else if (e.status === 400 || e.status === 409 || e.status === 429) setError(e.message || "No pudimos validar el código.");
      else setError("No pudimos conectarnos. Intentá de nuevo en unos segundos.");
      if (paso === 2) document.getElementById("login-cta").disabled = false;
    } finally {
      setBusy(false);
      if (paso === 1) document.getElementById("login-cta").disabled = dniActual.length < 6 && document.getElementById("dni-input").value.trim().length < 6;
    }
  }

  function wireForm() {
    const dni = document.getElementById("dni-input");
    const codigo = document.getElementById("codigo-input");
    const cta = document.getElementById("login-cta");
    const form = document.getElementById("login-form");

    dni.addEventListener("input", function () { cta.disabled = dni.value.trim().length < 6; });
    codigo.addEventListener("input", function () { cta.disabled = codigo.value.trim().length < 4; });
    document.getElementById("codigo-volver").addEventListener("click", volverAPaso1);
    document.getElementById("codigo-reenviar").addEventListener("click", async function (ev) {
      ev.preventDefault();
      setError("");
      try { const info = await api.solicitarCodigo(dniActual); irAPaso2(info); }
      catch (_) { setError("No pudimos reenviar el código."); }
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (cta.disabled) return;
      submit();
    });
  }

  function init() {
    if (api.isLoggedIn()) { window.location.replace("afil-home.html"); return; }
    renderTexts();
    wireForm();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
