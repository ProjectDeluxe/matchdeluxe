-- ============================================================
-- POOL APP DELUXE — Migración Fase 4, paso 5: feed de clips públicos y reportes
-- Para una base que YA tiene corridas las migraciones de los pasos 1 a 3.
-- Ver ROADMAP 6.9, paso 5.
-- Es idempotente: se puede correr más de una vez sin romper nada
-- y no borra ni modifica filas existentes.
-- Pegar en Supabase → SQL Editor → Run
--
-- Qué cambia:
--   - Tabla nueva clip_reports: un reporte por usuario y clip, con un
--     motivo opcional (hasta 300 letras). La app no la puede leer ni
--     escribir (RLS sin políticas): escribe api/clips/report.js con la
--     service key y el admin la revisa desde el SQL Editor. Todavía no
--     hay acción automática: la moderación queda para la Fase 5.
--   - Índice para listar el feed (clips públicos por published_at).
--
-- ORDEN: correr esta migración ANTES de desplegar la app nueva: el botón
-- Reportar escribe en clip_reports y sin la tabla da error.
-- ============================================================

CREATE TABLE IF NOT EXISTS clip_reports (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clip_id      UUID NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
  reporter_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason       TEXT CHECK (reason IS NULL OR char_length(reason) <= 300),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (clip_id, reporter_id)
);
CREATE INDEX IF NOT EXISTS idx_clip_reports_clip_id ON clip_reports(clip_id);

-- Sin políticas: la app no lee ni escribe reportes. Escribe api/clips/report.js
-- con la service key; el admin los revisa desde el SQL Editor.
ALTER TABLE clip_reports ENABLE ROW LEVEL SECURITY;

-- Para el feed: los públicos, del más nuevo al más viejo
CREATE INDEX IF NOT EXISTS idx_clips_published_at ON clips(published_at DESC) WHERE is_public;
