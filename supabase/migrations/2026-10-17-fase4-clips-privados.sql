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
