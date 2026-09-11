import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}`);
  }
  return value;
}

export const env = {
  pegasusBaseUrl: required(
    "PEGASUS_BASE_URL",
    "https://api-panda.aplicacionmedica.site"
  ).replace(/\/+$/, ""),
  pegasusToken: process.env.PEGASUS_TOKEN ?? "",
  port: Number(process.env.PORT ?? 3000),
  fhirSourceSystemBase: (
    process.env.FHIR_SOURCE_SYSTEM_BASE ??
    "https://ospan.org.ar/fhir/pegasus-panda"
  ).replace(/\/+$/, ""),

  // Base "healthcare" en Postgres/AWS: un solo host, varios schemas
  // (padron = padrón OSPAN/OMINT, ya existente; fhir_repo = lo que arma
  // este backend). Mismo Pool para los dos, cada query referencia su
  // schema explícitamente (nunca dependemos de search_path).
  db: {
    host: process.env.HEALTHCARE_DB_HOST ?? "",
    port: Number(process.env.HEALTHCARE_DB_PORT ?? 5432),
    database: process.env.HEALTHCARE_DB_NAME ?? "",
    user: process.env.HEALTHCARE_DB_USER ?? "",
    password: process.env.HEALTHCARE_DB_PASSWORD ?? "",
    ssl: (process.env.HEALTHCARE_DB_SSL ?? "true") === "true",
  },
};

export function assertDbConfigured() {
  const { host, database, user } = env.db;
  if (!host || !database || !user) {
    throw new Error(
      "Faltan variables HEALTHCARE_DB_* (host/database/user) -- ver .env.example"
    );
  }
}
