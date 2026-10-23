-- ============================================================
-- Socios que arrancan partidas en las mesas del club (2026-10-23, ROADMAP 6.14)
-- Un socio activo del club puede arrancar una partida en una mesa de ese
-- club desde Nueva partida, si en esa mesa no hay otra en curso, aunque la
-- mesa esté cerrada para el QR. Abrir, cerrar y cambiar la disciplina de la
-- mesa sigue siendo del dueño, el staff o el admin (Agus, 2026-10-23: para
-- las pruebas; la forma de abrir la mesa va a cambiar).
-- ============================================================

-- ¿Soy socio activo de este club?
CREATE OR REPLACE FUNCTION is_club_socio(cid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT cid IS NOT NULL AND EXISTS (
    SELECT 1 FROM club_players
    WHERE club_id = cid AND player_id = my_player_id() AND status = 'active'
  )
$$;

-- Crear partida: además de lo de antes, un socio en una mesa de su club
DROP POLICY IF EXISTS "matches_insert" ON matches;
CREATE POLICY "matches_insert" ON matches FOR INSERT WITH CHECK (
  auth.role() = 'authenticated' AND (
    (club_id IS NULL AND table_id IS NULL)
    OR is_admin()
    OR is_club_member(club_id)
    OR (table_id IS NOT NULL AND is_club_socio(club_id))
  )
);

-- Igual que antes, más: fuera del club (dueño/staff) y del admin, no se
-- arranca una partida en una mesa que ya tiene otra en curso (socios y QR).
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
    IF NEW.table_id IS NOT NULL THEN
      NEW.club_id := (SELECT club_id FROM tables WHERE id = NEW.table_id);
      IF NOT (is_admin() OR is_club_member(NEW.club_id))
         AND EXISTS (SELECT 1 FROM matches WHERE table_id = NEW.table_id AND status = 'active') THEN
        RAISE EXCEPTION 'Ya hay una partida en curso en esta mesa' USING ERRCODE = 'P0001';
      END IF;
    END IF;
  ELSIF NOT is_admin() THEN
    NEW.created_by := OLD.created_by;
    NEW.club_id    := OLD.club_id;
    NEW.table_id   := OLD.table_id;
  END IF;
  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION is_club_socio(UUID) TO authenticated;
