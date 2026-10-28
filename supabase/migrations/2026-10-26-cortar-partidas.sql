-- ROADMAP 6.21: el dueño o el staff del club cortan una partida que quedó abierta.
-- Una partida cortada queda terminada, sin ganador, y no cuenta en jugadas ni ganadas.
-- cut_reason: 'club' (la cortó el dueño o el staff) | 'auto' (más adelante, por tiempo).
-- Idempotente: se puede correr más de una vez.
ALTER TABLE matches ADD COLUMN IF NOT EXISTS cut_reason TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS cut_by UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'matches_cut_reason_check') THEN
    ALTER TABLE matches ADD CONSTRAINT matches_cut_reason_check CHECK (cut_reason IN ('club', 'auto'));
  END IF;
END $$;

-- Igual que antes, más: solo el club de la partida (o el admin) la corta, y la
-- base anota quién fue.
CREATE OR REPLACE FUNCTION guard_matches()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- SQL Editor y service key (el agente) pasan sin tocar nada
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
    NEW.cut_reason := NULL;
    NEW.cut_by     := NULL;
    IF NEW.table_id IS NOT NULL THEN
      NEW.club_id := (SELECT club_id FROM tables WHERE id = NEW.table_id);
      IF NOT (is_admin() OR is_club_member(NEW.club_id))
         AND EXISTS (SELECT 1 FROM matches WHERE table_id = NEW.table_id AND status = 'active') THEN
        RAISE EXCEPTION 'Ya hay una partida en curso en esta mesa' USING ERRCODE = 'P0001';
      END IF;
    END IF;
  ELSE
    IF NEW.cut_reason IS DISTINCT FROM OLD.cut_reason THEN
      IF NOT (is_admin() OR is_club_member(OLD.club_id)) THEN
        RAISE EXCEPTION 'Solo el dueño o el staff del club pueden cortar una partida' USING ERRCODE = 'P0001';
      END IF;
      NEW.cut_by := CASE WHEN NEW.cut_reason IS NULL THEN NULL ELSE auth.uid() END;
    ELSE
      NEW.cut_by := OLD.cut_by;
    END IF;
    IF NOT is_admin() THEN
      NEW.created_by := OLD.created_by;
      NEW.club_id    := OLD.club_id;
      NEW.table_id   := OLD.table_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
