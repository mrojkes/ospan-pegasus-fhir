/* =========================================================
   RENDER + LÓGICA — Login en tres pasos
     1. DNI
     2. Elegir cómo recibir el código (solo si hay más de un medio
        cargado en el padrón; con uno solo se saltea)
     3. Ingresar el código -> token de sesión

   Los medios de contacto salen del padrón (related_person.telefono /
   .email) y llegan siempre enmascarados: esta pantalla es previa a que
   la persona pruebe quién es.
   ========================================================= */
(function () {
  const cfg = window.APP_CONFIG;
  const api = window.AppApi;

  const PASO_DNI = 1, PASO_CANAL = 2, PASO_CODIGO = 3;
  let paso = PASO_DNI;
  let dniActual = "";
  let canalesActuales = [];
  let canalElegido = null;

  const ICONOS = {
    whatsapp: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.21 4.79 1.21 5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm0 18.15c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.15 8.15 0 01-1.25-4.38c0-4.54 3.7-8.24 8.24-8.24 2.2 0 4.27.86 5.83 2.42a8.19 8.19 0 012.41 5.82c0 4.54-3.7 8.24-8.24 8.24z"/></svg>',
    sms: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"/></svg>',
    email: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>',
    // Acceso interno: solo aparece si el backend lo ofrece (Secret puesto).
    interno: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4Z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/></svg>',
  };
  const CLASES_ICONO = {
    whatsapp: "menu-icon-circle--green",
    sms: "menu-icon-circle--blue",
    email: "menu-icon-circle--brand-secondary",
    interno: "menu-icon-circle--amber",
  };

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

  function mostrarPaso(nuevo) {
    paso = nuevo;
    document.getElementById("step-dni").classList.toggle("hidden", nuevo !== PASO_DNI);
    document.getElementById("step-canal").classList.toggle("hidden", nuevo !== PASO_CANAL);
    document.getElementById("step-codigo").classList.toggle("hidden", nuevo !== PASO_CODIGO);
    // En el paso de canal la acción es cada botón de la lista, no el CTA.
    document.getElementById("login-cta").classList.toggle("hidden", nuevo === PASO_CANAL);
    setError("");
  }

  /* ---------------- paso 2: elegir canal ---------------- */

  function renderCanales(canales) {
    canalesActuales = canales || [];
    const mount = document.getElementById("canal-list");
    mount.innerHTML = canalesActuales.map(function (c) {
      return '<button class="menu-item" type="button" data-canal="' + api.escapeHtml(c.tipo) + '">' +
        '<span class="menu-icon-circle ' + (CLASES_ICONO[c.tipo] || "menu-icon-circle--neutral") + '">' +
          (ICONOS[c.tipo] || ICONOS.email) + "</span>" +
        '<span class="menu-item-label">' +
          '<span class="canal-etiqueta">' + api.escapeHtml(c.etiqueta) + "</span>" +
          '<span class="canal-destino">' + api.escapeHtml(c.enmascarado) + "</span>" +
        "</span>" +
        '<svg class="menu-item-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>' +
      "</button>";
    }).join("");

    mount.querySelectorAll("[data-canal]").forEach(function (b) {
      b.addEventListener("click", function () { pedirCodigo(b.getAttribute("data-canal")); });
    });
    mostrarPaso(PASO_CANAL);
  }

  /* ---------------- paso 3: código ---------------- */

  function irAPasoCodigo(info) {
    canalElegido = info.canal || null;
    mostrarPaso(PASO_CODIGO);
    document.getElementById("login-cta").textContent = "Confirmar código";

    const esInterno = info.canal === "interno";
    if (esInterno) {
      // No se mandó nada: el código lo sabe quien está probando.
      document.getElementById("codigo-hint").textContent =
        "Ingresá el código interno de acceso. No se envió ningún mensaje.";
    } else {
      const nombreCanal = { whatsapp: "WhatsApp", sms: "SMS", email: "correo electrónico" }[info.canal] || "tu contacto registrado";
      document.getElementById("codigo-hint").textContent =
        "Te enviamos un código por " + nombreCanal + (info.destinoEnmascarado ? " a " + info.destinoEnmascarado : "") + ".";
    }
    // El código interno puede ser más largo que 6 dígitos y no ser numérico.
    const input = document.getElementById("codigo-input");
    input.setAttribute("maxlength", esInterno ? "64" : "6");
    input.setAttribute("inputmode", esInterno ? "text" : "numeric");
    input.placeholder = esInterno ? "Código interno" : "6 dígitos";
    // Reenviar no aplica cuando no hubo envío.
    document.getElementById("codigo-reenviar").classList.toggle("hidden", esInterno);

    // Si el canal todavía no tiene proveedor configurado, el código salió
    // por la consola del servidor: no le prometemos al afiliado un envío
    // que no ocurrió.
    const aviso = document.getElementById("codigo-aviso");
    if (info.entregado === false && !info.devCode && !esInterno) {
      aviso.textContent = "Este medio todavía no está habilitado para envíos. Pedile el código al equipo de OSPAN.";
      aviso.classList.remove("hidden");
    } else {
      aviso.classList.add("hidden");
    }

    const dev = document.getElementById("codigo-dev");
    if (info.devCode) {
      dev.textContent = "Modo demo: el código es " + info.devCode;
      dev.classList.remove("hidden");
    } else {
      dev.classList.add("hidden");
    }

    // "Probar por otro medio" solo tiene sentido si hay más de uno.
    document.getElementById("codigo-otro-medio").classList.toggle("hidden", (info.canales || []).length < 2);
    if (info.canales) canalesActuales = info.canales;

    const codigo = document.getElementById("codigo-input");
    codigo.value = "";
    codigo.focus();
    document.getElementById("login-cta").disabled = true;
  }

  /* ---------------- acciones ---------------- */

  async function pedirCodigo(canal) {
    setError("");
    setBusy(true);
    try {
      const r = await api.solicitarCodigo(dniActual, canal);
      if (r.requiereEleccion) renderCanales(r.canales);
      else irAPasoCodigo(r);
    } catch (e) {
      mostrarErrorDe(e);
      if (paso === PASO_CANAL) mostrarPaso(PASO_CANAL);
    } finally {
      setBusy(false);
      if (paso === PASO_DNI) document.getElementById("login-cta").disabled = dniActual.length < 6;
    }
  }

  function mostrarErrorDe(e) {
    // 400 (código incorrecto o medio inválido), 409 (sin contacto en el
    // padrón) y 429 (demasiados intentos) traen un mensaje ya pensado para
    // el afiliado: se muestra tal cual.
    if (e.status === 404) setError("No encontramos un afiliado con ese DNI. Verificá el número o contactanos.");
    else if (e.status === 400 || e.status === 409 || e.status === 429) setError(e.message || "No pudimos continuar.");
    else setError("No pudimos conectarnos. Intentá de nuevo en unos segundos.");
  }

  async function submit() {
    if (paso === PASO_DNI) {
      dniActual = document.getElementById("dni-input").value.replace(/\D/g, "");
      await pedirCodigo(null);
      return;
    }
    if (paso === PASO_CODIGO) {
      setError("");
      setBusy(true);
      try {
        await api.verificarCodigo(dniActual, document.getElementById("codigo-input").value.trim());
        window.location.replace("afil-home.html");
      } catch (e) {
        mostrarErrorDe(e);
        document.getElementById("login-cta").disabled = false;
      } finally {
        setBusy(false);
      }
    }
  }

  function volverADni() {
    mostrarPaso(PASO_DNI);
    document.getElementById("login-cta").textContent = cfg.login.ctaLabel;
    document.getElementById("login-cta").disabled = document.getElementById("dni-input").value.trim().length < 6;
  }

  function wireForm() {
    const dni = document.getElementById("dni-input");
    const codigo = document.getElementById("codigo-input");
    const cta = document.getElementById("login-cta");

    dni.addEventListener("input", function () { cta.disabled = dni.value.trim().length < 6; });
    codigo.addEventListener("input", function () { cta.disabled = codigo.value.trim().length < 4; });

    document.getElementById("canal-volver").addEventListener("click", function (ev) { ev.preventDefault(); volverADni(); });
    document.getElementById("codigo-volver").addEventListener("click", function (ev) { ev.preventDefault(); volverADni(); });
    document.getElementById("codigo-otro-medio").addEventListener("click", function (ev) {
      ev.preventDefault();
      renderCanales(canalesActuales);
    });
    document.getElementById("codigo-reenviar").addEventListener("click", function (ev) {
      ev.preventDefault();
      // Reenviar por el mismo medio que se usó recién.
      pedirCodigo(canalElegido);
    });

    document.getElementById("login-form").addEventListener("submit", function (event) {
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
