-- ============================================================
-- Socios del club (2026-10-22, ROADMAP 6.14)
-- Hasta ahora "ser del club" era players.club_id, que solo tenían los
-- jugadores que cargó el club: para sumar a alguien con cuenta propia había
-- que darle staff, que es acceso para administrar el club.
-- Ahora ser socio es una fila en club_players, con doble consentimiento:
--   * el jugador pide sumarse y el club (dueño o staff) lo aprueba, o
--   * el club lo invita y el jugador acepta.
-- Los jugadores que carga el club (gente sin app) son socios directo.
-- Cualquiera de los dos lados puede cortar: el socio se va o el club lo saca.
-- players.club_id sigue siendo "el club que lo cargó" (quién lo edita).
-- club_members (dueño/staff) queda solo para quien administra el club.
-- Nadie escribe club_players directo: todo pasa por las funciones de abajo.
-- ============================================================
CREATE TABLE IF NOT EXISTS club_players (
  club_id       UUID NOT NULL REFERENCES clubs(id)   ON DELETE CASCADE,
  player_id     UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active')),
  requested_by  TEXT NOT NULL CHECK (requested_by IN ('player', 'club')),  -- quién arrancó
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (club_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_club_players_player_id ON club_players(player_id);

-- Los jugadores que ya cargó cada club pasan a ser sus socios
INSERT INTO club_players (club_id, player_id, status, requested_by)
SELECT club_id, id, 'active', 'club' FROM players WHERE club_id IS NOT NULL
ON CONFLICT (club_id, player_id) DO NOTHING;

-- Socios activos ve cualquiera (la página del club los lista). Lo pendiente
-- lo ven solo el jugador, la gente del club y el admin.
ALTER TABLE club_players ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "club_players_read" ON club_players;
CREATE POLICY "club_players_read" ON club_players FOR SELECT USING (
  status = 'active' OR is_admin() OR is_club_member(club_id) OR player_id = my_player_id()
);
GRANT SELECT ON club_players TO authenticated;

-- ============================================================
-- Límite de jugadores del plan del club: ahora cuenta socios activos
-- ============================================================
CREATE OR REPLACE FUNCTION check_club_players_limit(cid UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  p plans;
  n INT;
BEGIN
  p := plan_for_club(cid);
  IF p.max_club_players IS NULL THEN
    RETURN;
  END IF;
  SELECT COUNT(*) INTO n FROM club_players WHERE club_id = cid AND status = 'active';
  IF n >= p.max_club_players THEN
    RAISE EXCEPTION 'PLAN_LIMIT: el plan del club permite hasta % jugadores', p.max_club_players
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

-- Igual que antes, salvo el límite del plan, que ahora usa club_players
CREATE OR REPLACE FUNCTION guard_players()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Solo aplica a la app (usuarios logueados); SQL Editor y service key pasan
  IF auth.uid() IS NULL OR is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
    IF NEW.user_id IS NOT NULL AND current_setting('app.claiming_player', TRUE) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'No se puede crear un jugador a nombre de otra cuenta' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.club_id IS NOT NULL THEN
      PERFORM check_club_players_limit(NEW.club_id);
    END IF;
  ELSE
    IF NEW.user_id IS DISTINCT FROM OLD.user_id
       AND current_setting('app.claiming_player', TRUE) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'No se puede cambiar de quién es un jugador' USING ERRCODE = 'P0001';
    END IF;
    NEW.club_id    := OLD.club_id;
    NEW.created_by := OLD.created_by;
  END IF;
  RETURN NEW;
END;
$$;

-- El jugador que carga un club queda socio de ese club, sin pedir nada
CREATE OR REPLACE FUNCTION add_club_creator_membership()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.club_id IS NOT NULL THEN
    INSERT INTO club_players (club_id, player_id, status, requested_by)
    VALUES (NEW.club_id, NEW.id, 'active', 'club')
    ON CONFLICT (club_id, player_id) DO UPDATE SET status = 'active';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_add_club_creator_membership ON players;
CREATE TRIGGER trg_add_club_creator_membership
  AFTER INSERT ON players
  FOR EACH ROW EXECUTE FUNCTION add_club_creator_membership();

-- ============================================================
-- Pedir, invitar, aceptar y cortar
-- ============================================================

-- El jugador pide sumarse. Si el club ya lo había invitado, es aceptar.
CREATE OR REPLACE FUNCTION request_join_club(cid UUID)
RETURNS club_players
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  pid UUID := my_player_id();
  cur club_players;
BEGIN
  IF pid IS NULL OR is_anonymous_user() THEN
    RAISE EXCEPTION 'Para sumarte a un club necesitás tu perfil de jugador' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM clubs WHERE id = cid) THEN
    RAISE EXCEPTION 'Ese club no existe' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO cur FROM club_players WHERE club_id = cid AND player_id = pid;
  IF FOUND THEN
    IF cur.status = 'active' THEN
      RAISE EXCEPTION 'Ya sos socio de este club' USING ERRCODE = 'P0001';
    ELSIF cur.requested_by = 'player' THEN
      RAISE EXCEPTION 'Ya pediste sumarte: falta que el club te apruebe' USING ERRCODE = 'P0001';
    END IF;
    RETURN accept_club_membership(cid, pid);
  END IF;
  INSERT INTO club_players (club_id, player_id, status, requested_by)
  VALUES (cid, pid, 'pending', 'player')
  RETURNING * INTO cur;
  RETURN cur;
END;
$$;

-- El club (dueño o staff) invita a un jugador con cuenta. Si el jugador ya
-- había pedido sumarse, es aprobarlo. A un jugador sin cuenta no se lo
-- invita: no hay nadie que pueda aceptar (el club carga los suyos).
CREATE OR REPLACE FUNCTION invite_to_club(cid UUID, pid UUID)
RETURNS club_players
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  cur club_players;
BEGIN
  IF NOT (is_admin() OR is_club_member(cid)) THEN
    RAISE EXCEPTION 'Solo la gente del club puede invitar' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM players WHERE id = pid AND user_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Solo se puede invitar a un jugador que tenga su cuenta' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO cur FROM club_players WHERE club_id = cid AND player_id = pid;
  IF FOUND THEN
    IF cur.status = 'active' THEN
      RAISE EXCEPTION 'Ya es socio del club' USING ERRCODE = 'P0001';
    ELSIF cur.requested_by = 'club' THEN
      RAISE EXCEPTION 'Ya lo invitaste: falta que acepte' USING ERRCODE = 'P0001';
    END IF;
    RETURN accept_club_membership(cid, pid);
  END IF;
  INSERT INTO club_players (club_id, player_id, status, requested_by)
  VALUES (cid, pid, 'pending', 'club')
  RETURNING * INTO cur;
  RETURN cur;
END;
$$;

-- Acepta el lado que NO arrancó: la invitación la acepta el jugador; la
-- solicitud la aprueba el club. Así nadie entra ni es sumado sin permiso.
CREATE OR REPLACE FUNCTION accept_club_membership(cid UUID, pid UUID)
RETURNS club_players
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  cur club_players;
BEGIN
  SELECT * INTO cur FROM club_players WHERE club_id = cid AND player_id = pid AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No hay nada pendiente para aceptar' USING ERRCODE = 'P0001';
  END IF;
  IF cur.requested_by = 'club' AND NOT (is_admin() OR pid IS NOT DISTINCT FROM my_player_id()) THEN
    RAISE EXCEPTION 'La invitación la tiene que aceptar el jugador' USING ERRCODE = 'P0001';
  END IF;
  IF cur.requested_by = 'player' AND NOT (is_admin() OR is_club_member(cid)) THEN
    RAISE EXCEPTION 'La solicitud la tiene que aprobar el club' USING ERRCODE = 'P0001';
  END IF;
  PERFORM check_club_players_limit(cid);
  UPDATE club_players SET status = 'active'
  WHERE club_id = cid AND player_id = pid
  RETURNING * INTO cur;
  RETURN cur;
END;
$$;

-- Cortar: el jugador se va, rechaza o cancela su pedido; el club lo saca,
-- rechaza o cancela su invitación.
CREATE OR REPLACE FUNCTION remove_club_membership(cid UUID, pid UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (is_admin() OR is_club_member(cid) OR pid IS NOT DISTINCT FROM my_player_id()) THEN
    RAISE EXCEPTION 'No podés sacar a este jugador del club' USING ERRCODE = 'P0001';
  END IF;
  DELETE FROM club_players WHERE club_id = cid AND player_id = pid;
END;
$$;

-- ============================================================
-- Partido ya jugado: los dos jugadores tienen que ser socios activos
-- (antes: cargados por el club). Resto igual.
-- ============================================================
CREATE OR REPLACE FUNCTION log_match_result(club_id UUID, p1 UUID, p2 UUID, score1 INT, score2 INT,
                                            winner_id UUID DEFAULT NULL, played_at TIMESTAMPTZ DEFAULT NULL)
RETURNS matches
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  cid    UUID := log_match_result.club_id;
  s1     INT  := log_match_result.score1;
  s2     INT  := log_match_result.score2;
  winner UUID := log_match_result.winner_id;
  result matches;
  n      INT;
BEGIN
  IF NOT (is_admin() OR is_club_member(cid)) THEN
    RAISE EXCEPTION 'Solo el club o el admin pueden cargar partidos' USING ERRCODE = 'P0001';
  END IF;
  IF p1 IS NULL OR p2 IS NULL OR p1 = p2 THEN
    RAISE EXCEPTION 'Elegí dos jugadores distintos' USING ERRCODE = 'P0001';
  END IF;
  SELECT COUNT(*) INTO n FROM club_players cp
  WHERE cp.player_id IN (p1, p2) AND cp.club_id = cid AND cp.status = 'active';
  IF n <> 2 THEN
    RAISE EXCEPTION 'Los dos jugadores tienen que ser socios del club' USING ERRCODE = 'P0001';
  END IF;
  IF s1 IS NULL OR s2 IS NULL OR s1 < 0 OR s2 < 0 THEN
    RAISE EXCEPTION 'Cargá el resultado de los dos jugadores' USING ERRCODE = 'P0001';
  END IF;
  IF winner IS NULL THEN
    IF s1 = s2 THEN
      RAISE EXCEPTION 'Con empate en puntos, indicá quién ganó' USING ERRCODE = 'P0001';
    END IF;
    winner := CASE WHEN s1 > s2 THEN p1 ELSE p2 END;
  ELSIF winner NOT IN (p1, p2) THEN
    RAISE EXCEPTION 'El ganador tiene que ser uno de los dos jugadores' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO matches (player1_id, player2_id, club_id, table_id, score1, score2, winner_id,
                       status, started_at, finished_at)
  VALUES (p1, p2, cid, NULL, s1, s2, winner,
          'finished', COALESCE(played_at, NOW()), COALESCE(played_at, NOW()))
  RETURNING * INTO result;
  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION check_club_players_limit(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION request_join_club(UUID), invite_to_club(UUID, UUID),
  accept_club_membership(UUID, UUID), remove_club_membership(UUID, UUID) TO authenticated;
