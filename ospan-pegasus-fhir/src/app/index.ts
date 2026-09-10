/* =========================================================
   MONTAJE DE LA APP ASOCIADO
   -----------------------------------------------------------
   Una sola línea a agregar en el server Express existente
   (src/server.ts / src/index.ts, donde se monta /back-office):

       import { montarAppAsociado } from "./app";
       montarAppAsociado(app);

   Eso deja servidas dos cosas:
     - la API   en  /api/app/*
     - la PWA   en  /app/*   (archivos estáticos de public/app)

   No toca ninguna ruta existente del conector ni del back office.
   ========================================================= */

import path from "path";
import express, { type Express } from "express";
import { appAsociadoRouter } from "./routes";

export function montarAppAsociado(app: Express, opciones: { rutaEstaticos?: string } = {}) {
  // El body parser puede estar ya montado globalmente; montarlo de nuevo
  // acotado a estas rutas es inofensivo y hace el módulo autocontenido.
  app.use("/api/app", express.json({ limit: "256kb" }));
  app.use("/api/app", appAsociadoRouter);

  const estaticos = opciones.rutaEstaticos || path.resolve(process.cwd(), "public/app");
  app.use(
    "/app",
    express.static(estaticos, {
      // El service worker no debe cachearse: si queda pegado, el usuario
      // no recibe nunca una versión nueva de la app.
      setHeaders(res, filePath) {
        if (filePath.endsWith("sw.js")) res.setHeader("Cache-Control", "no-cache");
      },
    })
  );
  app.get("/app", (_req, res) => res.redirect("/app/index.html"));

  return app;
}

export { appAsociadoRouter };
