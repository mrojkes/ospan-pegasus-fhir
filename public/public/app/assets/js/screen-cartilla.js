/* =========================================================
   RENDER — Cartilla de prestadores
   Buscador por nombre, zona o especialidad. Cada prestador lleva
   a su ficha, donde se pide el turno.
   ========================================================= */
(function () {
  const api = window.AppApi;
  const ui = window.AppShell;
  let todos = [];
  // Si se llegó desde "Reservar turno", la ficha abre directo en turnos.
  const paraTurno = new URLSearchParams(location.search).get("turno") === "1";

  function filtrar(texto) {
    const t = (texto || "").trim().toLowerCase();
    if (!t) return todos;
    return todos.filter(function (p) {
      return (p.nombre || "").toLowerCase().includes(t) ||
             (p.zona || "").toLowerCase().includes(t) ||
             (p.direccion || "").toLowerCase().includes(t) ||
             (p.especialidades || []).some(function (e) { return e.toLowerCase().includes(t); });
    });
  }

  function render(items) {
    const lista = document.getElementById("lista");
    document.getElementById("conteo").textContent =
      items.length + (items.length === 1 ? " resultado" : " resultados");

    if (!items.length) {
      lista.innerHTML = ui.vacio("No encontramos prestadores con esa búsqueda.");
      return;
    }
    lista.innerHTML = items.map(function (p) {
      const esp = (p.especialidades || []).map(function (e) {
        return '<span class="mini-tag">' + api.escapeHtml(e) + "</span>";
      }).join("");
      return '<a class="record-item orden-item" href="afil-prestador.html?id=' + p.id +
             (paraTurno ? "&turno=1" : "") + '">' +
        '<div class="record-item-top">' +
          '<p class="record-item-title">' + api.escapeHtml(p.nombre) + "</p>" +
          (p.copago != null ? '<span class="copago-chip">' + api.fmtPesos(p.copago) + "</span>" : "") +
        "</div>" +
        '<p class="record-item-meta">' + api.escapeHtml(p.direccion || p.zona || "") + "</p>" +
        '<div class="orden-item-badges">' + ui.estrellas(p.puntaje, p.opiniones) + esp + "</div>" +
        '<svg class="entity-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>' +
      "</a>";
    }).join("");
  }

  async function init() {
    if (!api.requireSession()) return;
    window.TabBar.render("cartilla");
    if (paraTurno) {
      document.querySelector(".page-title").textContent = "Elegí la veterinaria";
      document.querySelector(".back-link").setAttribute("href", "afil-turnos.html");
    }

    const buscar = document.getElementById("buscar");
    buscar.addEventListener("input", function () { render(filtrar(buscar.value)); });

    const lista = document.getElementById("lista");
    lista.innerHTML = ui.cargando(3);
    try {
      todos = await api.cartilla();
      render(todos);
    } catch (_) {
      lista.innerHTML = ui.vacio("No pudimos cargar la cartilla.");
      document.getElementById("conteo").textContent = "—";
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
