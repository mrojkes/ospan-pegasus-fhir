/* Registro del service worker + banner "Instalar app" (Android/Chrome). */
(function () {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").then(function (reg) {
        // Si hay una versión nueva, se activa y se recarga una sola vez,
        // para no quedar sirviendo el shell viejo desde la caché.
        reg.addEventListener("updatefound", function () {
          const nuevo = reg.installing;
          if (!nuevo) return;
          nuevo.addEventListener("statechange", function () {
            if (nuevo.state === "installed" && navigator.serviceWorker.controller) {
              window.location.reload();
            }
          });
        });
        reg.update();
      }).catch(function () {});
    });
  }
  let deferred = null;
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferred = e;
    const btn = document.getElementById("pwa-install");
    if (!btn) return;
    btn.classList.remove("hidden");
    btn.addEventListener("click", function () {
      if (!deferred) return;
      deferred.prompt();
      deferred.userChoice.finally(function () { deferred = null; btn.classList.add("hidden"); });
    });
  });
})();
