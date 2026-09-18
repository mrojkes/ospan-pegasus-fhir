-- =========================================================
-- Los ids del padrón dejan de asumirse UUID
--
-- Las tablas de la app guardaban `related_person_id` y `patient_id`
-- como UUID, porque el padrón con el que se desarrolló usaba uuids.
-- El padrón real usa otro tipo de id (numérico), así que CUALQUIER
-- escritura desde la app fallaba con:
--
--     invalid input syntax for type uuid: "1"
--
-- El primer lugar donde la app escribe es el login (el desafío del
-- código de acceso), así que el síntoma era no poder entrar con un
-- DNI nuevo. El back office no se veía afectado porque solo lee.
--
-- Pasan a TEXT: este backend no controla el padrón y no debería
-- imponerle un tipo de clave. TEXT acepta uuid, entero o código, y
-- si el padrón vuelve a cambiar no hay que migrar de nuevo.
--
-- Los uuid ya guardados se conservan como texto (mismo valor), así
-- que no se pierde nada de lo cargado durante las pruebas.
-- =========================================================

-- La vista depende de la tabla ddjj: se recrea al final.
DROP VIEW IF EXISTS app_asociado.ddjj_actual;

ALTER TABLE app_asociado.otp_challenge
  ALTER COLUMN related_person_id TYPE TEXT USING related_person_id::text;

ALTER TABLE app_asociado.token_atencion
  ALTER COLUMN related_person_id TYPE TEXT USING related_person_id::text,
  ALTER COLUMN patient_id        TYPE TEXT USING patient_id::text;

ALTER TABLE app_asociado.contrato
  ALTER COLUMN related_person_id TYPE TEXT USING related_person_id::text;

ALTER TABLE app_asociado.solicitud_autorizacion
  ALTER COLUMN related_person_id TYPE TEXT USING related_person_id::text,
  ALTER COLUMN patient_id        TYPE TEXT USING patient_id::text;

ALTER TABLE app_asociado.turno
  ALTER COLUMN related_person_id TYPE TEXT USING related_person_id::text,
  ALTER COLUMN patient_id        TYPE TEXT USING patient_id::text;

ALTER TABLE app_asociado.reintegro
  ALTER COLUMN related_person_id TYPE TEXT USING related_person_id::text,
  ALTER COLUMN patient_id        TYPE TEXT USING patient_id::text;

ALTER TABLE app_asociado.ddjj
  ALTER COLUMN related_person_id TYPE TEXT USING related_person_id::text,
  ALTER COLUMN patient_id        TYPE TEXT USING patient_id::text;

CREATE VIEW app_asociado.ddjj_actual AS
  SELECT DISTINCT ON (id_hub) *
    FROM app_asociado.ddjj
   ORDER BY id_hub, creada_en DESC;
