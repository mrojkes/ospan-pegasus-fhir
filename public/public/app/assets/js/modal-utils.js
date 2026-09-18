/* =========================================================
   UTILIDAD GENÉRICA DE MODALES
   Reutilizable para cualquier funcionalidad (no está atada a
   ninguna feature puntual). Cualquier pantalla puede usar
   openModal(id) / closeModal(id) sobre un .modal-overlay.
   ========================================================= */
window.ModalUtils = (function () {
  const CLOSE_ANIM_MS = 280;

  function openModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove("hidden");
    // doble rAF para asegurar que el navegador pinte el estado inicial
    // (translateY 100%) antes de animar hacia arriba
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        el.classList.add("modal-overlay--open");
      });
    });
  }

  function closeModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove("modal-overlay--open");
    setTimeout(function () {
      el.classList.add("hidden");
    }, CLOSE_ANIM_MS);
  }

  function wireCloseButtons() {
    document.querySelectorAll("[data-close-modal]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        closeModal(btn.getAttribute("data-close-modal"));
      });
    });

    document.querySelectorAll(".modal-overlay").forEach(function (overlay) {
      overlay.addEventListener("click", function (event) {
        if (event.target === overlay) closeModal(overlay.id);
      });
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        document.querySelectorAll(".modal-overlay:not(.hidden)").forEach(function (overlay) {
          closeModal(overlay.id);
        });
      }
    });
  }

  document.addEventListener("DOMContentLoaded", wireCloseButtons);

  return { openModal: openModal, closeModal: closeModal };
})();
