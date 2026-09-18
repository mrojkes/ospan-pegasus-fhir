/* =========================================================
   RENDER — Mi Contrato
   Mock: hoy no hay backend que genere/entregue el PDF firmado,
   así que el botón de descarga queda deshabilitado a propósito.
   Cuando exista archivoUrl, habilitar el botón y linkearlo.
   ========================================================= */
(function () {
  const api = window.AppApi;

  function render(contrato) {
    document.getElementById("contrato-codigo").textContent = contrato.codigo;
    document.getElementById("contrato-fecha-firma").textContent = contrato.fechaFirma;
    document.getElementById("contrato-vigencia").textContent =
      contrato.vigenciaDesde + " > " + contrato.vigenciaHasta;
    const planesEl = document.getElementById("contrato-planes");
    planesEl.innerHTML = "";
    contrato.planesAsociados.forEach(function (plan) {
      const pill = document.createElement("span");
      pill.className = "pill pill--default";
      pill.textContent = plan;
      planesEl.appendChild(pill);
    });

    if (contrato.archivoUrl) {
      const btn = document.getElementById("contrato-descargar");
      btn.disabled = false;
      btn.addEventListener("click", function () {
        window.open(contrato.archivoUrl, "_blank");
      });
      document.getElementById("contrato-nota").classList.add("hidden");
    }
  }

  async function init() {
    if (!api.requireSession()) return;
    window.TabBar.render("perfil");
    try { render(await api.contrato()); } catch (_) {}
  }

  document.addEventListener("DOMContentLoaded", init);
})();
