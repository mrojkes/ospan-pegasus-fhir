import {
  buscarPacientePorIdHub as buscarEnPadronPorIdHub,
  buscarPacientesPorDocumentoTutor as buscarEnPadronPorDocumento,
  buscarPacientesPorNombre,
} from "../adapters/padron/padronQueries";
import type { PadronPacienteConTutor } from "../adapters/padron/padronTypes";
import {
  fetchPacientesPorDocumentoTutor,
  PegasusApiError,
} from "../adapters/pegasus/pegasusClient";
import type { PegasusPacienteResumen } from "../adapters/pegasus/pegasusTypes";

/**
 * Resultado de buscar un paciente (punto 2.2): puede estar en el padrón
 * OSPAN/OMINT, en Pegasus (aunque no sea afiliado OSPAN), en ambos, o en
 * ninguno de los dos (por ejemplo si Pegasus lo tiene pero todavia no
 * llego al padron, o viceversa).
 */
export interface PacienteEncontrado {
  enPadron: boolean;
  enPegasus: boolean;
  padron?: PadronPacienteConTutor;
  pegasus?: PegasusPacienteResumen;
  // claves resueltas, priorizando lo que haya (para despues pedir estudios)
  idHub?: string | null;
  idPaciente?: number | null;
  identificadorOspan?: string | null;
}

function combinar(
  padron: PadronPacienteConTutor[],
  pegasus: PegasusPacienteResumen[]
): PacienteEncontrado[] {
  const resultados: PacienteEncontrado[] = [];
  const pegasusUsados = new Set<number>();

  for (const p of padron) {
    const match = pegasus.find(
      (pg) => (p.id_hub && pg.IdHub === p.id_hub) || false
    );
    if (match) pegasusUsados.add(match.IdPaciente);
    resultados.push({
      enPadron: true,
      enPegasus: Boolean(match),
      padron: p,
      pegasus: match,
      idHub: match?.IdHub ?? p.id_hub,
      idPaciente: match?.IdPaciente ?? null,
      identificadorOspan: p.identificador_ospan,
    });
  }

  for (const pg of pegasus) {
    if (pegasusUsados.has(pg.IdPaciente)) continue;
    resultados.push({
      enPadron: false,
      enPegasus: true,
      pegasus: pg,
      idHub: pg.IdHub,
      idPaciente: pg.IdPaciente,
      identificadorOspan: pg.IdHub,
    });
  }

  return resultados;
}

/**
 * Busca por documento del tutor, cruzando padron OSPAN (fuente propia) y
 * Pegasus en vivo (fuente externa -- incluye mascotas que no son de OSPAN).
 * Si Pegasus no responde (token vencido, timeout, etc.) no rompe la
 * busqueda: sigue con lo que haya en el padron y lo marca en `avisos`.
 */
export async function buscarPacientePorDocumentoTutor(documento: string): Promise<{
  resultados: PacienteEncontrado[];
  avisos: string[];
}> {
  const avisos: string[] = [];

  const [padronResultados, pegasusResultado] = await Promise.all([
    buscarEnPadronPorDocumento(documento).catch((err) => {
      avisos.push(
        `No se pudo consultar el padrón: ${err instanceof Error ? err.message : err}`
      );
      return [] as PadronPacienteConTutor[];
    }),
    fetchPacientesPorDocumentoTutor({ documento_tutor: documento }).catch(
      (err) => {
        if (err instanceof PegasusApiError) {
          avisos.push(`Pegasus respondió ${err.status} al buscar por documento_tutor.`);
        } else {
          avisos.push(
            `No se pudo consultar Pegasus: ${err instanceof Error ? err.message : err}`
          );
        }
        return null;
      }
    ),
  ]);

  if (pegasusResultado && pegasusResultado.cantidad > 1) {
    avisos.push(
      `El documento ${documento} trae ${pegasusResultado.cantidad} mascota(s) en Pegasus. El documento no identifica a un solo tutor -- revisar IdTutor/TutorNombre de cada resultado antes de elegir.`
    );
  }

  return {
    resultados: combinar(padronResultados, pegasusResultado?.pacientes ?? []),
    avisos,
  };
}

/** Búsqueda directa por id_hub (calculado, solo padrón, es instantánea). */
export async function buscarPacientePorIdHub(
  idHub: string
): Promise<PacienteEncontrado | null> {
  const padron = await buscarEnPadronPorIdHub(idHub);
  if (!padron) return null;
  return {
    enPadron: true,
    enPegasus: false,
    padron,
    idHub: padron.id_hub,
    idPaciente: null,
    identificadorOspan: padron.identificador_ospan,
  };
}

/** Búsqueda libre por nombre de mascota, solo contra el padrón. */
export async function buscarPacientesPorNombreMascota(
  nombre: string
): Promise<PacienteEncontrado[]> {
  const padron = await buscarPacientesPorNombre(nombre);
  return padron.map((p) => ({
    enPadron: true,
    enPegasus: false,
    padron: p,
    idHub: p.id_hub,
    idPaciente: null,
    identificadorOspan: p.identificador_ospan,
  }));
}
