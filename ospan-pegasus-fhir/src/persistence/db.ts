import { Pool } from "pg";
import { env } from "../config/env";

/**
 * Un solo Pool para la base "healthcare" completa. Se usa tanto para leer
 * el schema padron (solo lectura, nunca se escribe ahi desde este backend)
 * como para leer/escribir el schema fhir_repo (el que arma este backend).
 * Cada query referencia su schema explicitamente -- no dependemos de
 * search_path para no arriesgarnos a pisar la tabla equivocada.
 */
let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host: env.db.host,
      port: env.db.port,
      database: env.db.database,
      user: env.db.user,
      password: env.db.password,
      ssl: env.db.ssl ? { rejectUnauthorized: false } : undefined,
      max: 10,
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
