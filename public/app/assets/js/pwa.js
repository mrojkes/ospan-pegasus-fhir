/* Registro del service worker + banner "Instalar app" (Android/Chrome). */
(function () {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () {});
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
