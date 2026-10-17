-- ============================================================
-- POOL APP DELUXE — Migración Fase 4, paso 1: bucket 'clips' privado
-- Para una base que YA tiene corridas las migraciones de la Fase 3.
-- Ver ROADMAP 6.9, paso 1.
-- Es idempotente: se puede correr más de una vez sin romper nada
-- y no borra ni modifica archivos ni filas de clips.
-- Pegar en Supabase → SQL Editor → Run
--
-- Qué cambia:
--   - El bucket 'clips' deja de ser público: la URL pública de un video
--     deja de andar y la app pasa a pedir links firmados que vencen en 1 hora.
--   - Se saca "public_read_clips" (cualquiera, sin login, leía el bucket).
--   - Se saca "auth_upload_clips" (cualquier logueado podía subir archivos;
--     los clips los sube el agente de la mesa con la service key, que no
--     necesita políticas).
--   - Nueva "auth_read_clips": firmar un link exige poder leer el archivo,
--     y se permite a cualquier usuario autenticado, igual que la política
--     "auth_read_all" de la tabla clips (Fase 3). Ojo: los invitados
--     (Anonymous sign-ins) también son 'authenticated', como en la tabla.
--   - Se sacan "public_select 1oj01fe_0" y "public_upload 1oj01fe_0",
--     dos políticas armadas a mano desde el panel que dejaban leer y subir
--     archivos en cualquier bucket sin login (ver el bloque del final).
--   - Se recrean "public_read_avatars" y "auth_upload_avatars" tal como
--     están en supabase-schema.sql: subir una foto de perfil pasa a exigir
--     login, como siempre quiso el esquema.
--
-- Hay que desplegar la app nueva (que firma los links) junto con esta
-- migración: con la app vieja los videos dejan de verse.
-- ============================================================

UPDATE storage.buckets SET public = false WHERE id = 'clips';

DROP POLICY IF EXISTS "public_read_clips" ON storage.objects;
DROP POLICY IF EXISTS "auth_upload_clips" ON storage.objects;

DROP POLICY IF EXISTS "auth_read_clips" ON storage.objects;
CREATE POLICY "auth_read_clips" ON storage.objects FOR SELECT USING (
  bucket_id = 'clips' AND auth.role() = 'authenticated'
);

-- ------------------------------------------------------------
-- Políticas de storage hechas a mano desde el panel de Supabase.
-- Encontradas en producción el 2026-10-17, con rol public:
--   "public_select 1oj01fe_0"  FOR SELECT USING (true)
--   "public_upload 1oj01fe_0"  FOR INSERT WITH CHECK (true)
-- No filtraban por bucket: cualquiera, sin login, podía leer y subir
-- archivos en cualquier bucket (también en 'clips', lo que anulaba que
-- fuera privado). Producción tampoco tenía las políticas de avatars del
-- esquema; la subida de fotos de perfil andaba gracias a "public_upload".
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "public_select 1oj01fe_0" ON storage.objects;
DROP POLICY IF EXISTS "public_upload 1oj01fe_0" ON storage.objects;

DROP POLICY IF EXISTS "public_read_avatars" ON storage.objects;
CREATE POLICY "public_read_avatars" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "auth_upload_avatars" ON storage.objects;
CREATE POLICY "auth_upload_avatars" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.role() = 'authenticated');
