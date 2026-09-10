/* =========================================================
   UTILIDADES — Mis Resultados
   Presentación de estados de Pegasus y saneado del HTML que
   viene en EvoOrdenMedica / EvoOrdenMedicaResultados.
   ========================================================= */
window.ResultadosUtils = (function () {
  // Estados de una orden en Pegasus (IdEstado): ver doc del conector.
  const ESTADOS = {
    1: { label: "Pendiente", cls: "status-chip--pendiente", grupo: "pendientes" },
    2: { label: "Cancelada", cls: "status-chip--cancelada", grupo: "otras" },
    3: { label: "Realizada", cls: "status-chip--realizada", grupo: "con-resultado" },
    4: { label: "Cancelada", cls: "status-chip--cancelada", grupo: "otras" },
    5: { label: "Informe pendiente", cls: "status-chip--informe-pendiente", grupo: "pendientes" },
    6: { label: "Autorizada", cls: "status-chip--pendiente", grupo: "pendientes" },
    7: { label: "Duplicada", cls: "status-chip--otro", grupo: "otras" },
  };

  function estado(codigo, nombreFallback) {
    return ESTADOS[codigo] || { label: nombreFallback || "—", cls: "status-chip--otro", grupo: "otras" };
  }

  /**
   * El HTML de Pegasus es de presentación (br, p, h4, strong, ul/li,
   * tablas). Lo dejamos pasar pero quitamos scripts, handlers y
   * cualquier tag que no sea de formato, por si el sistema de origen
   * cambia. No es contenido tipeado por el usuario.
   */
  const TAGS_OK = new Set(["P", "BR", "B", "STRONG", "I", "EM", "U", "H1", "H2", "H3", "H4", "H5", "H6",
    "UL", "OL", "LI", "TABLE", "THEAD", "TBODY", "TR", "TD", "TH", "SPAN", "DIV", "A", "IMG", "SUP", "SUB", "HR", "SMALL"]);
  const ATTRS_OK = { A: ["href", "target", "rel"], IMG: ["src", "alt"] };

  // Estos se borran con contenido y todo: dejar su texto sería mostrar
  // código en pantalla. El resto de los tags desconocidos se "desenvuelven"
  // (se conserva el texto, se descarta el tag).
  const TAGS_FUERA = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "LINK", "META", "FORM", "INPUT", "BUTTON"]);

  function sanitizeHtml(html) {
    if (!html) return "";
    const tpl = document.createElement("template");
    tpl.innerHTML = String(html);
    const walk = function (node) {
      Array.from(node.children).forEach(function (el) {
        if (TAGS_FUERA.has(el.tagName)) { el.remove(); return; }
        if (!TAGS_OK.has(el.tagName)) { el.replaceWith(document.createTextNode(el.textContent)); return; }
        Array.from(el.attributes).forEach(function (a) {
          const ok = (ATTRS_OK[el.tagName] || []).includes(a.name.toLowerCase());
          if (!ok) el.removeAttribute(a.name);
        });
        if (el.tagName === "A") {
          const href = el.getAttribute("href") || "";
          if (!/^https?:\/\//i.test(href)) el.removeAttribute("href");
          el.setAttribute("target", "_blank"); el.setAttribute("rel", "noopener");
        }
        if (el.tagName === "IMG") {
          const src = el.getAttribute("src") || "";
          if (!/^(https?:\/\/|data:image\/)/i.test(src)) el.remove();
        }
        walk(el);
      });
    };
    walk(tpl.content);
    return tpl.innerHTML.trim();
  }

  function isEmptyValue(v) {
    if (v == null) return true;
    const s = String(v).replace(/&nbsp;/g, "").replace(/ /g, "").trim();
    return s === "";
  }

  function tipoAdjunto(a) {
    const t = (a.tipo || "").toLowerCase();
    const n = (a.nombre || "").toLowerCase();
    if (t.includes("pdf") || n.endsWith(".pdf")) return "pdf";
    if (t.startsWith("image/") || /\.(jpe?g|png|gif|webp)$/.test(n)) return "img";
    return "file";
  }

  return { estado, sanitizeHtml, isEmptyValue, tipoAdjunto };
})();
