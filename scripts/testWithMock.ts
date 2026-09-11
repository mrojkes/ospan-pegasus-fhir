/**
 * Prueba rapida de los mappers SIN llamar a Pegasus: toma un JSON de
 * ejemplo (con la forma documentada) y corre mapOrdenToBundle / bundle para
 * ver que el resultado sea razonable. No pega la red.
 */
import { mapOrdenToBundle, mapOrdenesToBundle } from "../src/fhir/mappers/bundle";
import type { PegasusOrdenMedica } from "../src/adapters/pegasus/pegasusTypes";

const ordenEjemplo: PegasusOrdenMedica = {
  IdOrdenMedica: 36988,
  Fecha: "2026-06-06T11:13:00",
  IdEstado: 1,
  EstadoNombre: "Pendiente de realizacion",
  SucursalNombre: "Ruiz Huidobro",
  IdSucursal: 3,
  IdMedico: 55,
  MedicoNombre: "Gianoni Laura",
  MedicoMatricula: null,
  IdServicio: 6,
  ServicioNombre: "Diagnostico x imagenes",
  IdCobertura: 1,
  CoberturaNombre: "OSPAN",
  NroAfiliado: "29317482",
  IdPaciente: 117823,
  IdHub: "pet_a1b2c3",
  PacienteNombre: "Bamba guzman",
  PacienteFechaNac: "2021-02-10",
  EspecieNombre: "Felino",
  RazaNombre: "Siames",
  IdTutor: 9001,
  TutorNombre: "Galan, Mariana",
  TutorDocumento: 29317482,
  Diagnostico: "control",
  Notas: null,
  EvoOrdenMedica: null,
  EvoOrdenMedicaResultados: null,
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
      Valor: null,
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

const detailBundle = mapOrdenToBundle(ordenEjemplo);
console.log("=== Bundle de UNA orden (detalle) ===");
console.log(JSON.stringify(detailBundle, null, 2));
console.log(`\nTotal de recursos: ${detailBundle.total}`);
console.log(
  "Tipos:",
  detailBundle.entry.map((e) => e.resource.resourceType).join(", ")
);

const ordenEjemplo2: PegasusOrdenMedica = {
  ...ordenEjemplo,
  IdOrdenMedica: 36989,
  Items: [],
  Adjuntos: [],
  CantidadItems: 0,
  IdEstado: 3,
  EstadoNombre: "Realizada",
};

const listBundle = mapOrdenesToBundle([ordenEjemplo, ordenEjemplo2]);
console.log("\n=== Bundle de LISTADO (2 ordenes, mismo paciente) ===");
console.log(`Total de recursos (deduplicado): ${listBundle.total}`);
const patients = listBundle.entry.filter(
  (e) => e.resource.resourceType === "Patient"
);
console.log(`Patients en el bundle (debe ser 1, deduplicado): ${patients.length}`);

if (patients.length !== 1) {
  console.error("FALLO: se esperaba 1 solo Patient deduplicado");
  process.exit(1);
}

console.log("\nOK: mappers corrieron sin excepciones y la dedup funciona.");
