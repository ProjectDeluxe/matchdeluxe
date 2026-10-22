-- ============================================================
-- Equipos, práctica y pool sin marcador (2026-10-22, ROADMAP 6.15)
-- 1. Pool se juega a ganador, sin marcador: las partidas de pool ya
--    jugadas quedan sin puntos. Si alguna terminó sin ganador, antes se
--    le pone el que tenía más puntos (con empate queda sin ganador).
-- 2. Equipos (2 vs 2, 3 vs 3): player1_id y player2_id siguen siendo el
--    primero de cada lado, así clips, permisos y el agente no cambian.
--    El resto de cada equipo va en match_teammates. El ganador sigue en
--    winner_id (el primero del equipo que ganó): gana todo su equipo.
-- 3. Práctica: matches.mode = 'practice', sin puntos ni ganador, y no
--    cuenta para jugadas ni ganadas.
-- Correr ANTES del push: el código nuevo lee match_teammates y matches.mode.
-- ============================================================

-- 1. Pool sin marcador (partidas ya jugadas)
UPDATE matches
SET winner_id = CASE WHEN score1 > score2 THEN player1_id ELSE player2_id END
WHERE discipline = 'pool' AND status = 'finished' AND winner_id IS NULL
  AND score1 IS NOT NULL AND score2 IS NOT NULL AND score1 <> score2;

UPDATE matches SET score1 = NULL, score2 = NULL WHERE discipline = 'pool';

-- 3. Práctica
ALTER TABLE matches ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'match';
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_mode_check;
ALTER TABLE matches ADD  CONSTRAINT matches_mode_check CHECK (mode IN ('match', 'practice'));

-- 2. Equipos
CREATE TABLE IF NOT EXISTS match_teammates (
  match_id   UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id  UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  side       SMALLINT NOT NULL CHECK (side IN (1, 2)),
  PRIMARY KEY (match_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_match_teammates_player ON match_teammates(player_id);

-- Quién puede tocar una partida: lo mismo que la política matches_update
CREATE OR REPLACE FUNCTION can_edit_match(mid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM matches m
    WHERE m.id = mid AND (
      is_admin()
      OR is_club_member(m.club_id)
      OR m.created_by = auth.uid()
      OR my_player_id() IN (m.player1_id, m.player2_id)
    )
  )
$$;

ALTER TABLE match_teammates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "teammates_read"   ON match_teammates;
DROP POLICY IF EXISTS "teammates_insert" ON match_teammates;
DROP POLICY IF EXISTS "teammates_delete" ON match_teammates;
CREATE POLICY "teammates_read"   ON match_teammates FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "teammates_insert" ON match_teammates FOR INSERT WITH CHECK (can_edit_match(match_id));
CREATE POLICY "teammates_delete" ON match_teammates FOR DELETE USING (can_edit_match(match_id));

GRANT EXECUTE ON FUNCTION can_edit_match(UUID) TO authenticated;
