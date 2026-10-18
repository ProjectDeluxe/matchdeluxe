-- ============================================================
-- POOL APP DELUXE — Migración Fase 4, paso 3: publicar y despublicar clips
-- Para una base que YA tiene corridas las migraciones de los pasos 1 y 2.
-- Ver ROADMAP 6.9, paso 3.
-- Es idempotente: se puede correr más de una vez sin romper nada
-- y no borra ni modifica archivos ni filas de clips.
-- Pegar en Supabase → SQL Editor → Run
--
-- Qué cambia:
--   - clips.published_at: cuándo se publicó (NULL si no es público).
--   - clips.publish_blocked_by: quién lo despublicó, cuando no fue quien
--     lo guardó (un jugador, el club o el admin). Mientras tenga valor,
--     el dueño no lo puede volver a publicar.
--   - Publicar y despublicar lo hace la función api/clips/publish.js con
--     la service key; la app sigue sin poder escribir la tabla clips (solo
--     tiene la política de lectura "auth_read_all", Fase 3).
--
-- ORDEN: correr esta migración ANTES de desplegar la app nueva. Solo
-- agrega columnas, así que la app actual no se entera; pero las funciones
-- nuevas (api/clips/sign.js y publish.js) leen publish_blocked_by, y si
-- salen antes de que exista, la pantalla Clips da error.
-- ============================================================

ALTER TABLE clips ADD COLUMN IF NOT EXISTS published_at       TIMESTAMPTZ;
ALTER TABLE clips ADD COLUMN IF NOT EXISTS publish_blocked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clips_is_public ON clips(is_public) WHERE is_public;
