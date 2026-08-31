/**
 * Corre las migraciones de `db/*.sql` (solo los archivos numerados, tipo
 * `001-...sql`) contra la base configurada en las variables HEALTHCARE_DB_*
 * (o Secrets, en Replit), en orden y de una sola vez.
 *
 * Es seguro re-ejecutarlo: todas las migraciones de este repo estan
 * escritas con IF NOT EXISTS / CREATE OR REPLACE.
 *
 * Uso: npm run migrate
 *
 * NO toca nada fuera del schema `fhir_repo` -- las migraciones de este
 * repo nunca crean ni alteran nada en `padron` (solo lectura para este
 * backend).
 */
import { promises as fs } from "fs";
import path from "path";
import { assertDbConfigured } from "../src/config/env";
import { getPool, closePool } from "../src/persistence/db";

async function main() {
  assertDbConfigured();

  const dbDir = path.join(__dirname, "..", "db");
  const archivos = (await fs.readdir(dbDir))
    .filter((f) => /^\d+.*\.sql$/.test(f))
    .sort();

  if (archivos.length === 0) {
    console.log("No hay migraciones numeradas en db/ (nada para correr).");
    return;
  }

  const pool = getPool();
  try {
    for (const archivo of archivos) {
      const ruta = path.join(dbDir, archivo);
      const sql = await fs.readFile(ruta, "utf-8");
      console.log(`\n=== Corriendo ${archivo} ===`);
      await pool.query(sql);
      console.log(`OK: ${archivo}`);
    }
    console.log("\nListo: todas las migraciones corrieron sin error.");
  } finally {
    await closePool();
  }
}

main().catch((err) => {
  console.error(
    "\nError corriendo migraciones:",
    err instanceof Error ? err.message : err
  );
  process.exit(1);
});
