-- ============================================================
-- Borrar un jugador que ya jugó (2026-10-19, ROADMAP 6.13)
-- supabase-schema.sql define los jugadores de matches con ON DELETE SET NULL,
-- pero en producción la tabla se había creado antes, sin eso: borrar un
-- jugador con partidas fallaba con matches_player2_id_fkey. Se rehacen las
-- tres claves para que las partidas queden y el jugador borrado salga como
-- "Jugador" (lo que ya prometía el aviso "Sus partidas quedan").
-- ============================================================
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_player1_id_fkey;
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_player2_id_fkey;
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_winner_id_fkey;

ALTER TABLE matches ADD CONSTRAINT matches_player1_id_fkey
  FOREIGN KEY (player1_id) REFERENCES players(id) ON DELETE SET NULL;
ALTER TABLE matches ADD CONSTRAINT matches_player2_id_fkey
  FOREIGN KEY (player2_id) REFERENCES players(id) ON DELETE SET NULL;
ALTER TABLE matches ADD CONSTRAINT matches_winner_id_fkey
  FOREIGN KEY (winner_id) REFERENCES players(id) ON DELETE SET NULL;
