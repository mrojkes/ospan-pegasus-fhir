/* =========================================================
   RENDER + LÓGICA — Credencial Digital
   ========================================================= */
(function () {
  const api = window.AppApi;
  let afiliado = null;
  let historial = [];
  let mascotaActual = null;

  function getMascotaFromQuery() {
    const params = new URLSearchParams(window.location.search);
    return api.findMascota(afiliado, params.get("mascota"));
  }

  function baseImageUrl(mascota) {
    // El plan todavía no viene del padrón (ver PENDIENTES): sin plan se usa
    // la base genérica, en vez de pedir una imagen que no existe y romper.
    const plan = (mascota.plan || "").trim() || (window.APP_CONFIG.credencial || {}).planPorDefecto || "100";
    return "assets/img/credencial-base-plan" + plan + ".png";
  }

  function renderCredentialCompact(mascota) {
    document.getElementById("credential-compact").style.backgroundImage =
      "url('" + baseImageUrl(mascota) + "')";
    document.getElementById("credential-photo-compact").src = mascota.foto || "";
    document.getElementById("credential-photo-compact").alt = mascota.nombre;
  }

  function renderCredentialFull(mascota) {
    document.getElementById("credential-full").style.backgroundImage =
      "url('" + baseImageUrl(mascota) + "')";
    document.getElementById("credential-photo-full").src = mascota.foto || "";
    document.getElementById("credential-photo-full").alt = mascota.nombre;

    document.getElementById("credential-nombre").textContent = mascota.nombre;
    document.getElementById("credential-raza").textContent = mascota.raza;
    document.getElementById("credential-tutor").textContent = afiliado.nombre + " " + afiliado.apellido;
    document.getElementById("credential-dni").textContent = afiliado.dni;
    document.getElementById("credential-alta").textContent = mascota.alta;
    document.getElementById("credential-detalles").textContent = mascota.detalles;
  }

  function wireVerCompleta() {
    function abrirCompleta() {
      window.ModalUtils.openModal("modal-credencial-completa");
    }
    document.getElementById("ver-completa-btn").addEventListener("click", abrirCompleta);
    document.getElementById("credential-compact").addEventListener("click", abrirCompleta);
  }

  function renderHistorial() {
    const list = document.getElementById("historial-list");
    list.innerHTML = historial
      .map(function (h) {
        const mascotaNombre = (afiliado.mascotas.find((m) => m.id === h.mascotaId || m.idHub === h.mascotaId) || {}).nombre || "";
        const statusClass = h.estado === "autorizado" ? "status-chip--autorizado" : "status-chip--auditoria";
        const statusLabel = h.estado === "autorizado" ? "Autorizado" : "En auditoría";
        return (
          '<div class="record-item">' +
            '<div class="record-item-top">' +
              '<p class="record-item-title">' + h.prestador + "</p>" +
              '<span class="status-chip ' + statusClass + '">' + statusLabel + "</span>" +
            "</div>" +
            '<p class="record-item-meta">Servicio<br>' + h.fecha + " &bull; " + mascotaNombre + "</p>" +
            '<span class="record-item-value">Cubierto: ' + h.cubierto + "</span>" +
          "</div>"
        );
      })
      .join("");
  }

  function formatTokenCode(code) {
    return code.slice(0, 3) + " " + code.slice(3);
  }

  function drawQr(canvas, text) {
    if (window.QRCode && window.QRCode.toCanvas) {
      window.QRCode.toCanvas(canvas, text, { width: canvas.width, margin: 1 }, function () {});
      return;
    }
    drawPseudoQr(canvas);
  }

  function drawPseudoQr(canvas) {
    const ctx = canvas.getContext("2d");
    const size = canvas.width;
    const cells = 18;
    const cell = size / cells;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#111";
    for (let y = 0; y < cells; y++) {
      for (let x = 0; x < cells; x++) {
        if (Math.random() > 0.55) ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
    // Marcadores de esquina, para que se lea como QR
    [[0, 0], [cells - 4, 0], [0, cells - 4]].forEach(function (pos) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(pos[0] * cell, pos[1] * cell, cell * 4, cell * 4);
      ctx.fillStyle = "#111";
      ctx.fillRect(pos[0] * cell, pos[1] * cell, cell * 4, cell * 4);
      ctx.fillStyle = "#fff";
      ctx.fillRect((pos[0] + 0.7) * cell, (pos[1] + 0.7) * cell, cell * 2.6, cell * 2.6);
      ctx.fillStyle = "#111";
      ctx.fillRect((pos[0] + 1.3) * cell, (pos[1] + 1.3) * cell, cell * 1.4, cell * 1.4);
    });
  }

  let countdownInterval = null;

  function startCountdown(seconds) {
    let remaining = seconds || 15 * 60;
    const timerEl = document.getElementById("token-timer");
    clearInterval(countdownInterval);
    countdownInterval = setInterval(function () {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(countdownInterval);
        remaining = 0;
      }
      const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
      const ss = String(remaining % 60).padStart(2, "0");
      timerEl.textContent = mm + ":" + ss;
    }, 1000);
  }

  function wireToken() {
    document.getElementById("open-token").addEventListener("click", async function () {
      const btn = this;
      btn.disabled = true;
      try {
        const t = await api.tokenAtencion(mascotaActual.idHub || mascotaActual.id);
        document.getElementById("token-code").textContent = formatTokenCode(t.codigo);
        drawQr(document.getElementById("token-qr"), t.qr || t.codigo);
        const mm = String(Math.floor((t.expiraEn || 900) / 60)).padStart(2, "0");
        document.getElementById("token-timer").textContent = mm + ":00";
        startCountdown(t.expiraEn || 900);
        window.ModalUtils.openModal("modal-token");
      } catch (_) {
        document.getElementById("token-code").textContent = "— — —";
        document.getElementById("token-timer").textContent = "--:--";
        window.ModalUtils.openModal("modal-token");
      } finally { btn.disabled = false; }
    });
  }

  function wireResultados(mascota) {
    const link = document.getElementById("ver-resultados");
    if (link) link.href = "afil-resultados.html?mascota=" + encodeURIComponent(mascota.idHub || mascota.id);
  }

  async function init() {
    if (!api.requireSession()) return;
    wireVerCompleta();
    wireToken();
    try {
      afiliado = await api.me();
    } catch (_) { return; }
    mascotaActual = getMascotaFromQuery();
    renderCredentialCompact(mascotaActual);
    renderCredentialFull(mascotaActual);
    wireResultados(mascotaActual);
    try { historial = await api.historial(); } catch (_) { historial = []; }
    renderHistorial();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
