-- ============================================================
-- Login con Google (2026-10-18, ROADMAP 6.11)
-- Una cuenta de Google no tiene celu, así que para darle acceso a un club
-- ahora se acepta el celu o el mail con el que entró.
-- Mismo nombre y parámetros que antes: la app no cambia de llamada.
-- ============================================================
CREATE OR REPLACE FUNCTION add_club_member_by_phone(cid UUID, member_phone TEXT, member_role TEXT DEFAULT 'owner')
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  uid UUID;
BEGIN
  IF NOT (is_admin() OR is_club_owner(cid)) THEN
    RAISE EXCEPTION 'Solo el dueño del club o el admin pueden dar acceso' USING ERRCODE = 'P0001';
  END IF;
  IF member_role NOT IN ('owner', 'staff') THEN
    RAISE EXCEPTION 'El rol tiene que ser dueño o staff' USING ERRCODE = 'P0001';
  END IF;
  IF position('@' IN member_phone) > 0 THEN
    SELECT id INTO uid FROM auth.users
    WHERE lower(email) = lower(trim(member_phone))
    LIMIT 1;
  ELSE
    SELECT id INTO uid FROM auth.users
    WHERE phone_key(phone) = phone_key(member_phone) AND phone_key(member_phone) IS NOT NULL
    LIMIT 1;
  END IF;
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Nadie entró todavía a la app con ese celu o mail' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO club_members (club_id, user_id, role) VALUES (cid, uid, member_role)
  ON CONFLICT (club_id, user_id) DO UPDATE SET role = EXCLUDED.role;
END;
$$;
