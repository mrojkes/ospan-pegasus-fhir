/**
 * Recalcula el `fhir_bundle` guardado de la version ACTUAL de cada orden
 * ya sincronizada, usando el mapper FHIR de HOY (src/fhir/mappers/*)
 * sobre el `raw_pegasus` que ya tenemos persistido -- no vuelve a llamar
 * a Pegasus, no inserta versiones nuevas ni toca el historial.
 *
 * Hace falta correrlo UNA VEZ despues de desplegar un cambio en un mapper
 * de FHIR (por ejemplo, el fix del "&nbsp;" en observation.ts), para que
 * las ordenes que ya estaban sincronizadas de antes tambien queden
 * corregidas -- las que no cambiaron de estado desde entonces nunca
 * vuelven a pasar por el mapper en un sync normal.
 *
 * Es seguro re-ejecutarlo las veces que haga falta: si una orden ya tiene
 * el bundle al dia, no la toca.
 *
 * Uso: npm run reprocesar-bundles
 */
import { assertDbConfigured } from "../src/config/env";
import { closePool } from "../src/persistence/db";
import { reprocesarBundles } from "../src/persistence/ordenMedicaRepo";

async function main() {
  assertDbConfigured();

  try {
    console.log("Reprocesando fhir_bundle de las ordenes ya sincronizadas...");
    const { revisadas, actualizadas } = await reprocesarBundles();

    console.log(
      `\nListo: ${revisadas} orden(es) revisada(s), ${actualizadas} actualizada(s) con el mapper actual.`
    );
    if (actualizadas === 0) {
      console.log(
        "(Ninguna necesitaba cambios -- ya estaban al dia con el mapper actual.)"
      );
    }
  } finally {
    await closePool();
  }
}

main().catch((err) => {
  console.error(
    "\nError reprocesando bundles:",
    err instanceof Error ? err.message : err
  );
  process.exit(1);
});
