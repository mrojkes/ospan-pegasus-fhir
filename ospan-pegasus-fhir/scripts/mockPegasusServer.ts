/**
 * Mock local de la API de Pegasus, SOLO para probar el backend de punta a
 * punta sin depender de la red/token reales. No se envia ni se usa en
 * produccion -- vive en scripts/, no en src/.
 */
import express from "express";

const app = express();
const PORT = 4001;

const ordenBase = {
  IdOrdenMedica: 36988,
  Fecha: "2026-08-31T09:00:00",
  IdEstado: 1,
  EstadoNombre: "Pendiente de realizacion",
  IdSucursal: 3,
  SucursalNombre: "Ruiz Huidobro",
  IdMedico: 55,
  MedicoNombre: "Gianoni Laura",
  MedicoMatricula: null,
  IdServicio: 6,
  ServicioNombre: "Diagnostico x imagenes",
  IdCobertura: 1,
  CoberturaNombre: "OSPAN",
  NroAfiliado: "29317482",
  IdPaciente: 117823,
  IdHub: "pet_a1b2c3d4e5f6789",
  PacienteNombre: "Bamba guzman",
  PacienteFechaNac: "2021-02-10",
  EspecieNombre: "Felino",
  RazaNombre: "Siames",
  IdTutor: 9001,
  TutorNombre: "Galan, Mariana",
  TutorDocumento: 29317482,
  Diagnostico: "control",
  Notas: null,
  EvoOrdenMedica: "Solicito:<br>113 ECOGRAFIA ABDOMINAL<br><br>Diagnóstico: control",
  EvoOrdenMedicaResultados:
    "<p><strong>ECOGRAFIA ABDOMINAL &nbsp;</strong><br><small><i></i></small></p><p><h4>Detalle</h4><p>sin hallazgos patológicos</p></p>",
  Informe: null,
  FechaResultados: null,
  Recetario_Url: null,
  CantidadItems: 1,
  ImporteTotal: 0,
  Items: [
    {
      IdOrdenMedicaItem: 61215,
      IdOrdenMedica: 36988,
      IdSku: 113,
      Descripcion: "ECOGRAFIA ABDOMINAL",
      Indicaciones: null,
      Realizada: true,
      Notas: null,
      NumValor: null,
      TextValor: null,
      Valor: "&nbsp;", // como llega de Panda cuando no hay valor cargado -- ver observation.ts
      Unidad: null,
      ValoresReferencia: null,
      IdProfesionalRealiza: 2380,
      ProfesionalRealiza: "Alvarez Lorena",
      MatriculaRealiza: null,
      Importe: 0,
    },
  ],
  Adjuntos: [
    "https://panda.pegasusvet-his.com.ar/_files/repositorio/a2748316-x.pdf",
  ],
};

const ordenNoOspan = {
  ...ordenBase,
  IdOrdenMedica: 40010,
  IdHub: null,
  IdCobertura: 2,
  CoberturaNombre: "Particular",
  IdPaciente: 999111,
  PacienteNombre: "Rocco",
  IdTutor: 9002,
  TutorNombre: "Perez, Juan",
  TutorDocumento: 20111222,
  IdEstado: 3,
  EstadoNombre: "Realizada",
};

// Estado mutable simple para poder simular un cambio de estado entre syncs
let estadoActualOrden36988 = 1;

app.get("/api/ordenesmedicas", (req, res) => {
  const idHub = req.query.id_hub;
  if (!idHub) return res.status(400).json({ error: "id_hub requerido" });
  if (idHub !== "pet_a1b2c3d4e5f6789") {
    return res.json({ id_hub: idHub, cantidad: 0, ordenes: [] });
  }
  const orden = { ...ordenBase, IdEstado: estadoActualOrden36988, EstadoNombre: estadoActualOrden36988 === 1 ? "Pendiente de realizacion" : "Realizada" };
  res.json({ id_hub: idHub, cantidad: 1, ordenes: [orden] });
});

app.get("/api/ordenesmedicas/porfecha", (req, res) => {
  const desde = String(req.query.desde ?? "");
  if (!desde) return res.status(400).json({ error: "desde requerido" });
  // "avanza" el estado en cada sync para poder ver el versionado en accion
  estadoActualOrden36988 = estadoActualOrden36988 === 1 ? 3 : 1;
  const orden = { ...ordenBase, IdEstado: estadoActualOrden36988, EstadoNombre: estadoActualOrden36988 === 1 ? "Pendiente de realizacion" : "Realizada" };
  res.json({
    desde,
    hasta: String(req.query.hasta ?? desde),
    cantidad: 2,
    truncado: false,
    ordenes: [orden, ordenNoOspan],
  });
});

app.get("/api/ordenesmedicas/pacientes", (req, res) => {
  const doc = String(req.query.documento_tutor ?? "");
  if (!doc) return res.status(400).json({ error: "documento_tutor requerido" });
  if (doc !== "29317482") {
    return res.json({ documento_tutor: doc, cantidad: 0, truncado: false, pacientes: [] });
  }
  res.json({
    documento_tutor: doc,
    cantidad: 1,
    truncado: false,
    pacientes: [
      {
        IdPaciente: 117823,
        IdHub: "pet_a1b2c3d4e5f6789",
        PacienteNombre: "Bamba guzman",
        PacienteFechaNac: "2021-02-10T00:00:00",
        EspecieNombre: "Felino",
        RazaNombre: "Siames",
        IdCobertura: 1,
        CoberturaNombre: "OSPAN",
        EsOspan: 1,
        IdTutor: 9001,
        TutorNombre: "Galan, Mariana",
        TutorDocumento: 29317482,
        CantidadOrdenes: 1,
        UltimaOrden: "2026-08-31T09:00:00",
      },
    ],
  });
});

app.get("/api/ordenesmedicas/pacientes/:idPaciente/ordenes", (req, res) => {
  const id = Number(req.params.idPaciente);
  if (id === 999111) {
    return res.json({ cantidad: 1, truncado: false, ordenes: [ordenNoOspan] });
  }
  res.json({ cantidad: 0, truncado: false, ordenes: [] });
});

app.get("/api/ordenesmedicas/:id", (req, res) => {
  if (Number(req.params.id) === ordenBase.IdOrdenMedica) {
    return res.json(ordenBase);
  }
  res.status(404).json({ error: "no encontrada" });
});

app.listen(PORT, () => {
  console.log(`Mock Pegasus escuchando en http://localhost:${PORT}`);
});
