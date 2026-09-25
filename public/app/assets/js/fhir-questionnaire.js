/* =========================================================
   RENDERIZADOR DE FHIR Questionnaire
   -----------------------------------------------------------
   Dibuja un formulario a partir de un recurso `Questionnaire` y
   devuelve un `QuestionnaireResponse` con lo respondido.

   No sabe nada de declaraciones juradas ni de mascotas: sirve para
   cualquier formulario que el backend defina como Questionnaire
   (consentimientos, triage, encuestas). Agregar una pregunta es
   editar el recurso en el servidor, no este archivo.

   Soporta: boolean, string, text, choice (answerOption), date,
   integer, decimal, attachment, display, group, ítems anidados y
   enableWhen (= y != sobre boolean/string, y exists), con
   enableBehavior all/any.

   Los adjuntos (`attachment`) se leen con FileReader y salen aparte
   de las respuestas, en `adjuntos()`: el binario no va dentro del
   QuestionnaireResponse, va como archivo con su linkId.
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
    if (item.type === "attachment") {
      const id = "adj-" + item.linkId;
      return '<div class="adjunto-campo" data-adjuntos="' + esc(item.linkId) + '">' +
        '<label class="dropzone" for="' + esc(id) + '">' +
          '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>' +
          "<span>Tocá para adjuntar foto o PDF</span>" +
          "<small>" + (item.repeats ? "Podés adjuntar más de uno. " : "") + "Hasta 8 MB cada archivo</small>" +
        "</label>" +
        '<input type="file" id="' + esc(id) + '" accept="image/*,application/pdf"' +
          (item.repeats ? " multiple" : "") + " hidden />" +
        '<div class="archivo-list" data-lista="' + esc(item.linkId) + '"></div>' +
      "</div>";
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
    // {linkId: [{nombre, contenido}]} — los archivos elegidos, todavía
    // en memoria. Se mandan al servidor junto con el formulario.
    const archivos = {};

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

    /* ---- adjuntos ---- */

    function pintarArchivos(linkId) {
      const cont = mount.querySelector('[data-lista="' + linkId + '"]');
      if (!cont) return;
      const lista = archivos[linkId] || [];
      cont.innerHTML = lista.map(function (a, i) {
        return '<div class="archivo-item"><span>' + esc(a.nombre) + "</span>" +
          '<button type="button" class="archivo-quitar" data-quitar="' + i + '" aria-label="Quitar">&times;</button></div>';
      }).join("");
      cont.querySelectorAll("[data-quitar]").forEach(function (b) {
        b.addEventListener("click", function () {
          archivos[linkId].splice(Number(b.getAttribute("data-quitar")), 1);
          pintarArchivos(linkId);
        });
      });
    }

    mount.querySelectorAll("[data-adjuntos] input[type=file]").forEach(function (input) {
      const linkId = input.closest("[data-adjuntos]").getAttribute("data-adjuntos");
      const def = buscarItem(questionnaire.item, linkId) || {};
      input.addEventListener("change", async function (ev) {
        const elegidos = Array.prototype.slice.call(ev.target.files || []);
        if (!archivos[linkId] || !def.repeats) archivos[linkId] = [];
        for (const file of elegidos) {
          try {
            archivos[linkId].push(await window.AppShell.leerArchivo(file));
          } catch (_) {}
          if (!def.repeats) break;
        }
        ev.target.value = "";
        pintarArchivos(linkId);
        limpiarMarcas();
      });
    });

    function limpiarMarcas() {
      mount.querySelectorAll(".is-faltante").forEach(function (el) { el.classList.remove("is-faltante"); });
    }

    repintarCondiciones();

    return {
      leerValores: leerValores,
      /** Archivos elegidos, listos para mandar: [{linkId, nombre, contenido}]. */
      adjuntos: function () {
        return Object.keys(archivos).reduce(function (acc, linkId) {
          // Un adjunto de una pregunta que quedó oculta no se manda.
          const el = mount.querySelector('[data-item="' + linkId + '"]');
          if (el && el.classList.contains("hidden")) return acc;
          (archivos[linkId] || []).forEach(function (a) {
            acc.push({ linkId: linkId, nombre: a.nombre, contenido: a.contenido });
          });
          return acc;
        }, []);
      },
      /** Marca en rojo los obligatorios que el servidor devolvió como faltantes. */
      marcarFaltantes: function (linkIds) {
        limpiarMarcas();
        (linkIds || []).forEach(function (linkId) {
          const el = mount.querySelector('[data-item="' + linkId + '"]');
          if (el) el.classList.add("is-faltante");
        });
        const primero = mount.querySelector(".is-faltante");
        if (primero) primero.scrollIntoView({ behavior: "smooth", block: "center" });
      },
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

  /* ---------------- vista de solo lectura ---------------- */

  /**
   * Dibuja un QuestionnaireResponse ya guardado, sin el Questionnaire:
   * el recurso trae el texto de cada pregunta, así que un trámite viejo
   * se lee como se respondió aunque el formulario haya cambiado.
   */
  function resumen(qr) {
    const filas = [];
    (function recorrer(items) {
      (items || []).forEach(function (it) {
        const answers = it.answer || [];
        if (answers.length) {
          filas.push({ pregunta: it.text || it.linkId, valor: answers.map(textoDeAnswer) });
          answers.forEach(function (a) { if (a.item) recorrer(a.item); });
        } else if (it.item) {
          recorrer(it.item);
        }
      });
    })(qr && qr.item);

    return filas.map(function (f) {
      const valores = f.valor.map(function (v) {
        return v.url
          ? '<a class="adjunto-link" href="#" data-adjunto-url="' + esc(v.url) + '">' + esc(v.texto) + "</a>"
          : esc(v.texto);
      }).join("<br>");
      return '<div class="dato-row"><span class="dato-label">' + esc(f.pregunta) + "</span>" +
             '<span class="dato-value">' + valores + "</span></div>";
    }).join("");
  }

  function textoDeAnswer(a) {
    if (a.valueBoolean !== undefined) return { texto: a.valueBoolean ? "Sí" : "No" };
    if (a.valueAttachment) return { texto: a.valueAttachment.title || "Archivo", url: a.valueAttachment.url };
    if (a.valueDecimal !== undefined) return { texto: String(a.valueDecimal) };
    if (a.valueInteger !== undefined) return { texto: String(a.valueInteger) };
    if (a.valueDate !== undefined) return { texto: window.AppApi.fmtFecha(a.valueDate) };
    if (a.valueCoding) return { texto: a.valueCoding.display || a.valueCoding.code || "" };
    return { texto: a.valueString || "" };
  }

  return { montar, valoresDeRespuesta, resumen };
})();
