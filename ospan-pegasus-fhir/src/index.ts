import cors from "cors";
import express from "express";
import { env } from "./config/env";
import { ordenesMedicasRouter } from "./routes/ordenesMedicas";
import { backOfficeRouter } from "./routes/backOffice";

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // para los <form> del back office

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "ospan-pegasus-fhir" });
});

app.get("/", (_req, res) => res.redirect("/back-office"));

app.use(ordenesMedicasRouter);
app.use(backOfficeRouter);

app.listen(env.port, () => {
  console.log(`ospan-pegasus-fhir escuchando en http://localhost:${env.port}`);
  console.log(`Pegasus base URL: ${env.pegasusBaseUrl}`);
  if (!env.pegasusToken) {
    console.warn(
      "AVISO: PEGASUS_TOKEN vacio -- las llamadas a Pegasus van a fallar con 401/403 hasta que se configure."
    );
  }
});
