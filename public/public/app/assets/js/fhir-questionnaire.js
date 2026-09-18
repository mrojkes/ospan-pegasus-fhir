/* =========================================================
   RENDERIZADOR DE FHIR Questionnaire
   -----------------------------------------------------------
   Dibuja un formulario a partir de un recurso `Questionnaire` y
   devuelve un `QuestionnaireResponse` con lo respondido.

   No sabe nada de declaraciones juradas ni de mascotas: sirve para
   cualquier formulario que el backend defina como Questionnaire
   (consentimientos, triage, encuestas). Agregar una pregunta es
   editar el recurso en el servidor, no este archivo.

   Soporta: boolean, string, text, choice (answerOption), display,
   group, ítems anidados y enableWhen (= y != sobre boolean/string,
   y exists), con enableBehavior all/any.
   ========================================================= */
window.FhirQuestionnaire = (function () {
  const esc = window.AppApi.escapeHtml;

  /* ---------------- lectura de un QuestionnaireResponse ---------------- */

  /** Aplana un QR a { linkId: valor } para poder pintar los valores previos. */
  function valoresDeRespuesta(qr) {
    const out = {};
    (function recorrer(items) {
      (items || []).forEach(function (it) {
        const a = (it.answer || [])[0];
        if (a) {
          if (a.valueBoolean !== undefined) out[it.linkId] = a.valueBoolean;
          else if (a.valueString !== undefined) out[it.linkId] = a.valueString;
          else if (a.valueCoding && a.valueCoding.code !== undefined) out[it.linkId] = a.valueCoding.code;
          if (a.item) recorrer(a.item);
        }
        if (it.item) recorrer(it.item);
      });
    })(qr && qr.item);
    return out;
  }

  /* ---------------- condiciones ---------------- */

  function condicionCumplida(item, valores) {
    if (!item.enableWhen || !item.enableWhen.length) return true;
    const prueba = function (c) {
      const v = valores[c.question];
      if (v === undefined || v === null || v === "") return false;
      if (c.operator === "exists") return true;
      const esperado = c.answerBoolean !== undefined ? c.answerBoolean
                     : c.answerString !== undefined ? c.answerString
                     : c.answerCoding ? c.answerCoding.code : undefined;
      if (esperado === undefined) return false;
      return c.operator === "!=" ? v !== esperado : v === esperado;
    };
    return item.enableBehavior === "any" ? item.enableWhen.some(prueba) : item.enableWhen.every(prueba);
  }

  /* ---------------- dibujo ---------------- */

  function campo(item, valor) {
    const id = "q-" + item.linkId;
    if (item.type === "boolean") {
      return '<div class="ddjj-opciones" data-campo="' + esc(item.linkId) + '" data-tipo="boolean">' +
        '<button class="ddjj-op' + (valor === true ? " is-active" : "") + '" type="button" data-valor="true">Sí</button>' +
        '<button class="ddjj-op' + (valor === false ? " is-active" : "") + '" type="button" data-valor="false">No</button>' +
      "</div>";
    }
    if (item.type === "choice") {
      const ops = (item.answerOption || []).map(function (o) {
        const v = o.valueString !== undefined ? o.valueString : (o.valueCoding || {}).code;
        const t = o.valueString !== undefined ? o.valueString : ((o.valueCoding || {}).display || v);
        return '<button class="ddjj-op' + (valor === v ? " is-active" : "") +
          '" type="button" data-valor="' + esc(v) + '">' + esc(t) + "</button>";
      }).join("");
      return '<div class="ddjj-opciones ddjj-opciones--wrap" data-campo="' + esc(item.linkId) + '" data-tipo="choice">' + ops + "</div>";
    }
    if (item.type === "text") {
      return '<textarea class="form-input" id="' + id + '" rows="2" data-campo="' + esc(item.linkId) +
        '" data-tipo="string" placeholder="' + esc(item.text || "") + '">' + esc(valor || "") + "</textarea>";
    }
    if (item.type === "string") {
      return '<input class="form-input" id="' + id + '" type="text" data-campo="' + esc(item.linkId) +
        '" data-tipo="string" placeholder="' + esc(item.text || "") + '" value="' + esc(valor || "") + '" />';
    }
    if (item.type === "integer" || item.type === "decimal") {
      return '<input class="form-input" id="' + id + '" type="number" data-campo="' + esc(item.linkId) +
        '" data-tipo="' + item.type + '" value="' + esc(valor == null ? "" : valor) + '" />';
    }
    if (item.type === "date") {
      return '<input class="form-input" id="' + id + '" type="date" data-campo="' + esc(item.linkId) +
        '" data-tipo="date" value="' + esc(valor || "") + '" />';
    }
    return "";
  }

  function dibujarItems(items, valores, nivel) {
    return (items || []).map(function (item) {
      const oculto = !condicionCumplida(item, valores);
      const clase = nivel > 0 ? "ddjj-sub" : "ddjj-item";

      if (item.type === "display") {
        return '<p class="ddjj-display' + (oculto ? " hidden" : "") + '" data-item="' +
          esc(item.linkId) + '">' + esc(item.text || "") + "</p>";
      }
      if (item.type === "group") {
        return '<div class="ddjj-grupo' + (oculto ? " hidden" : "") + '" data-item="' + esc(item.linkId) + '">' +
          (item.text ? '<p class="menu-group-title">' + esc(item.text) + "</p>" : "") +
          dibujarItems(item.item, valores, nivel + 1) +
        "</div>";
      }

      // Una pregunta con sus hijos (típicamente el detalle condicional).
      return '<div class="' + clase + (oculto ? " hidden" : "") + '" data-item="' + esc(item.linkId) + '">' +
        (nivel === 0 && item.text
          ? '<p class="ddjj-pregunta">' + esc(item.text) + (item.required ? ' <span class="req">*</span>' : "") + "</p>"
          : "") +
        campo(item, valores[item.linkId]) +
        (item.item ? dibujarItems(item.item, valores, nivel + 1) : "") +
      "</div>";
    }).join("");
  }

  /* ---------------- API pública ---------------- */

  /**
   * Monta el formulario. Devuelve un objeto con `toResponse()`, que
   * arma el QuestionnaireResponse con lo que hay en pantalla.
   */
  function montar(mount, questionnaire, questionnaireResponse) {
    const valores = valoresDeRespuesta(questionnaireResponse);

    function repintarCondiciones() {
      // Cada cambio puede habilitar u ocultar otros ítems: se recalcula
      // todo el árbol en vez de manejar casos sueltos.
      const actuales = leerValores();
      mount.querySelectorAll("[data-item]").forEach(function (el) {
        const linkId = el.getAttribute("data-item");
        const def = buscarItem(questionnaire.item, linkId);
        if (!def) return;
        el.classList.toggle("hidden", !condicionCumplida(def, actuales));
      });
    }

    function leerValores() {
      const out = {};
      mount.querySelectorAll("[data-campo]").forEach(function (el) {
        const linkId = el.getAttribute("data-campo");
        const tipo = el.getAttribute("data-tipo");
        if (tipo === "boolean" || tipo === "choice") {
          const activo = el.querySelector(".ddjj-op.is-active");
          if (!activo) return;
          const v = activo.getAttribute("data-valor");
          out[linkId] = tipo === "boolean" ? v === "true" : v;
        } else {
          const v = (el.value || "").trim();
          if (v) out[linkId] = tipo === "integer" || tipo === "decimal" ? Number(v) : v;
        }
      });
      return out;
    }

    mount.innerHTML = dibujarItems(questionnaire.item, valores, 0);

    mount.querySelectorAll('[data-tipo="boolean"] .ddjj-op, [data-tipo="choice"] .ddjj-op').forEach(function (b) {
      b.addEventListener("click", function () {
        const grupo = b.parentElement;
        grupo.querySelectorAll(".ddjj-op").forEach(function (x) { x.classList.toggle("is-active", x === b); });
        repintarCondiciones();
      });
    });
    mount.querySelectorAll("input[data-campo], textarea[data-campo]").forEach(function (el) {
      el.addEventListener("input", repintarCondiciones);
    });

    repintarCondiciones();

    return {
      leerValores: leerValores,
      /** Items del QuestionnaireResponse; el servidor arma el recurso final. */
      toResponseItems: function () {
        const valores = leerValores();
        return Object.keys(valores).map(function (linkId) {
          const v = valores[linkId];
          const answer = typeof v === "boolean" ? { valueBoolean: v }
                       : typeof v === "number" ? { valueDecimal: v }
                       : { valueString: String(v) };
          return { linkId: linkId, answer: [answer] };
        });
      },
    };
  }

  function buscarItem(items, linkId) {
    for (const it of items || []) {
      if (it.linkId === linkId) return it;
      const hijo = buscarItem(it.item, linkId);
      if (hijo) return hijo;
    }
    return null;
  }

  return { montar, valoresDeRespuesta };
})();
