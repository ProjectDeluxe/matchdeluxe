-- ROADMAP 6.18: la app se actualiza sola.
-- Suma players y club_players a la publicación de Realtime (matches ya estaba).
-- Realtime respeta la RLS: cada uno recibe solo los cambios de filas que ya puede leer.
-- Idempotente: se puede correr más de una vez.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['players', 'club_players'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
