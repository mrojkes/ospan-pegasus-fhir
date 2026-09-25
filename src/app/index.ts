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
import { mvpRouter } from "./routesMvp";
import { backOfficeSolicitudesRouter } from "./backOfficeSolicitudes";
import { tramitesRouter } from "./tramites/routes";
import { backOfficeTramitesRouter } from "./tramites/backOffice";

export function montarAppAsociado(app: Express, opciones: { rutaEstaticos?: string } = {}) {
  // El body parser puede estar ya montado globalmente; montarlo de nuevo
  // acotado a estas rutas es inofensivo y hace el módulo autocontenido.
  // 24 MB: los comprobantes de reintegro viajan como data URL dentro del
  // JSON (hasta 4 archivos de 5 MB, que en base64 crecen ~33%).
  app.use("/api/app", express.json({ limit: "24mb" }));
  app.use("/api/app", appAsociadoRouter);
  app.use("/api/app", mvpRouter);
  app.use("/api/app", tramitesRouter);

  // Pantalla del back office para resolver lo que piden los afiliados.
  // Router aparte: no toca routes/backOffice.ts.
  app.use(express.urlencoded({ extended: true }));
  app.use(backOfficeSolicitudesRouter);
  app.use(backOfficeTramitesRouter);

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
