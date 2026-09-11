-- =========================================================
-- DDJJ como FHIR QuestionnaireResponse
--
-- La declaración jurada pasa de un JSON propio ({codigo: {respuesta,
-- detalle}}) a un recurso FHIR completo. Motivo: el formulario se
-- define una sola vez como `Questionnaire` y tanto la pantalla como
-- el repositorio trabajan con el recurso estándar, sin una capa de
-- traducción en el medio.
--
-- Se guarda además con qué versión del cuestionario se respondió: una
-- declaración vieja se sigue interpretando con las preguntas que el
-- tutor efectivamente vio.
--
-- La columna `respuestas` (formato viejo) se conserva: las filas
-- existentes se migran abajo, y tenerla al lado sirve para verificar
-- la conversión antes de descartarla en una migración futura.
-- =========================================================

ALTER TABLE app_asociado.ddjj
  ADD COLUMN IF NOT EXISTS questionnaire_response JSONB,
  ADD COLUMN IF NOT EXISTS questionnaire_url      TEXT,
  ADD COLUMN IF NOT EXISTS questionnaire_version  TEXT;

-- La vista se recrea porque cambió la forma de la tabla.
DROP VIEW IF EXISTS app_asociado.ddjj_actual;
CREATE VIEW app_asociado.ddjj_actual AS
  SELECT DISTINCT ON (id_hub) *
    FROM app_asociado.ddjj
   ORDER BY id_hub, creada_en DESC;

-- ---------------------------------------------------------
-- Migración de lo guardado con el formato viejo.
-- Cada clave {respuesta, detalle} se convierte en un item con su
-- answer booleana y, si hay detalle, un item anidado.
-- ---------------------------------------------------------
UPDATE app_asociado.ddjj d
   SET questionnaire_url     = 'https://ospan.org.ar/fhir/pegasus-panda/Questionnaire/ddjj-mascota',
       questionnaire_version = '1.0.0',
       questionnaire_response = jsonb_build_object(
         'resourceType', 'QuestionnaireResponse',
         'questionnaire', 'https://ospan.org.ar/fhir/pegasus-panda/Questionnaire/ddjj-mascota|1.0.0',
         'status', 'completed',
         'subject', jsonb_build_object('reference', 'Patient/' || d.patient_id::text),
         'source',  jsonb_build_object('reference', 'RelatedPerson/' || d.related_person_id::text),
         'authored', to_char(d.creada_en AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
         'item', COALESCE((
           SELECT jsonb_agg(
                    jsonb_build_object(
                      'linkId', clave,
                      'answer', jsonb_build_array(
                        CASE
                          WHEN COALESCE(valor->>'detalle', '') <> '' THEN
                            jsonb_build_object(
                              'valueBoolean', (valor->>'respuesta') = 'si',
                              'item', jsonb_build_array(jsonb_build_object(
                                'linkId', clave || '-detalle',
                                'answer', jsonb_build_array(jsonb_build_object('valueString', valor->>'detalle'))
                              ))
                            )
                          ELSE
                            jsonb_build_object('valueBoolean', (valor->>'respuesta') = 'si')
                        END
                      )
                    )
                  )
             FROM jsonb_each(d.respuestas) AS r(clave, valor)
         ), '[]'::jsonb)
       )
 WHERE d.questionnaire_response IS NULL
   AND d.respuestas IS NOT NULL
   AND d.respuestas <> '{}'::jsonb;

-- Índice para buscar respuestas por versión del cuestionario, que es
-- lo que se necesita el día que haya que reprocesar una versión vieja.
CREATE INDEX IF NOT EXISTS ddjj_questionnaire_version_idx
  ON app_asociado.ddjj (questionnaire_version, creada_en DESC);
