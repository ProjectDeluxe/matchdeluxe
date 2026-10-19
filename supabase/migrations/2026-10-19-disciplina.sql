-- ============================================================
-- Disciplina de la mesa y de la partida (2026-10-19, ROADMAP 6.13)
-- Una misma mesa física (misma cámara y misma PC con su TABLE_ID) puede ser
-- de pool o de ping pong. La mesa guarda la disciplina que tiene ahora; la
-- cambia la gente del club desde Nueva partida, antes de arrancar.
-- Cada partida guarda con qué disciplina se jugó. Si es en una mesa, la toma
-- de la mesa (así también la que se arranca escaneando el QR); sin mesa, la
-- elige quien la crea. El marcador sigue igual (puntos enteros).
-- ============================================================
ALTER TABLE tables  ADD COLUMN IF NOT EXISTS discipline TEXT NOT NULL DEFAULT 'pool';
ALTER TABLE matches ADD COLUMN IF NOT EXISTS discipline TEXT NOT NULL DEFAULT 'pool';

ALTER TABLE tables  DROP CONSTRAINT IF EXISTS tables_discipline_check;
ALTER TABLE tables  ADD  CONSTRAINT tables_discipline_check  CHECK (discipline IN ('pool', 'ping_pong'));
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_discipline_check;
ALTER TABLE matches ADD  CONSTRAINT matches_discipline_check CHECK (discipline IN ('pool', 'ping_pong'));

CREATE OR REPLACE FUNCTION set_match_discipline_from_table()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.table_id IS NOT NULL THEN
    SELECT discipline INTO NEW.discipline FROM tables WHERE id = NEW.table_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_match_discipline ON matches;
CREATE TRIGGER trg_set_match_discipline
  BEFORE INSERT ON matches
  FOR EACH ROW EXECUTE FUNCTION set_match_discipline_from_table();
