/* =========================================================
   RENDER — Declaración jurada
   La pantalla no tiene ninguna pregunta escrita: el formulario lo
   dibuja FhirQuestionnaire a partir del recurso `Questionnaire`
   que manda el backend, y lo respondido se envía como items de un
   `QuestionnaireResponse`.

   Para cambiar el cuestionario se edita `ddjjQuestionnaire.ts` en
   el servidor. Acá no hay nada que tocar.
   ========================================================= */
(function () {
  const api = window.AppApi;
  const ui = window.AppShell;
  const FQ = window.FhirQuestionnaire;
  let afiliado = null;
  let mascota = null;
  let datos = null;
  let form = null;

  function renderOrigen() {
    const texto = document.getElementById("origen-texto");
    if (datos.origen === "app") {
      let t = "Última actualización: " + api.fmtFecha(datos.actualizadaEn) + ".";
      // Si el cuestionario cambió desde que respondió, conviene decirlo:
      // puede haber preguntas nuevas sin contestar.
      if (datos.versionRespondida && datos.versionRespondida !== datos.versionActual) {
        t += " Desde entonces agregamos preguntas nuevas: revisalas y volvé a guardar.";
      }
      texto.textContent = t;
    } else if (datos.origen === "padron") {
      texto.textContent = "Todavía no la actualizaste desde la app. Mostramos lo que figura en tu ficha de afiliación.";
    } else {
      texto.textContent = "Todavía no completaste la declaración de " + mascota.nombre + ".";
    }
  }

  async function guardar(ev) {
    ev.preventDefault();
    const err = document.getElementById("form-error");
    const ok = document.getElementById("form-ok");
    const btn = document.getElementById("guardar-btn");
    err.classList.add("hidden");
    ok.classList.add("hidden");

    const items = form ? form.toResponseItems() : [];
    if (!items.length) {
      err.textContent = "Respondé al menos una pregunta.";
      err.classList.remove("hidden");
      return;
    }

    btn.disabled = true;
    try {
      const r = await api.guardarDdjj(mascota.idHub || mascota.id, items);
      datos.questionnaireResponse = r.questionnaireResponse;
      datos.actualizadaEn = r.actualizadaEn;
      datos.versionRespondida = datos.versionActual;
      datos.origen = "app";
      renderOrigen();
      ok.textContent = "Declaración guardada.";
      ok.classList.remove("hidden");
    } catch (e) {
      err.textContent = e.message || "No pudimos guardar la declaración.";
      err.classList.remove("hidden");
    } finally {
      btn.disabled = false;
    }
  }

  async function cargar() {
    const mount = document.getElementById("preguntas");
    try {
      datos = await api.ddjj(mascota.idHub || mascota.id);
      renderOrigen();
      form = FQ.montar(mount, datos.questionnaire, datos.questionnaireResponse);
    } catch (_) {
      mount.innerHTML = ui.vacio("No pudimos cargar la declaración.");
    }
  }

  async function init() {
    if (!api.requireSession()) return;
    window.TabBar.render("salud");
    ui.montarVistaPreliminar("Vista preliminar — lo que declares acá todavía no impacta en tu contrato");

    document.getElementById("ddjj-form").addEventListener("submit", guardar);

    try { afiliado = await api.me(); } catch (_) { return; }
    mascota = api.findMascota(afiliado, new URLSearchParams(location.search).get("mascota"));
    if (!mascota) {
      document.getElementById("preguntas").innerHTML = ui.vacio("No tenés mascotas asociadas.");
      return;
    }

    ui.montarSelectorMascota(document.getElementById("pet-selector"), afiliado, mascota, function (m) {
      mascota = m;
      history.replaceState(null, "", "afil-ddjj.html?mascota=" + encodeURIComponent(m.idHub || m.id));
      cargar();
    });

    cargar();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
