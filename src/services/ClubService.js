import { supabase } from "../supabaseClient";

// Trae todos los clubs con sus mesas
export async function getClubs() {
  const { data, error } = await supabase
    .from("clubs")
    .select("*, tables(*)")
    .order("created_at", { ascending: true })
    .order("label", { referencedTable: "tables", ascending: true });

  if (error) throw error;
  return data ?? [];
}

// Trae todas las mesas con el nombre de su club (para elegir, abrir o cerrar mesa al crear partida)
export async function getTables() {
  const { data, error } = await supabase
    .from("tables")
    .select("id, label, club_id, availability, qr_token, discipline, club:clubs(id, name)")
    .order("label", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function createClub({ name, address = null, contact = null }) {
  const { data, error } = await supabase
    .from("clubs")
    .insert({ name, address, contact })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteClub(id) {
  const { error } = await supabase.from("clubs").delete().eq("id", id);
  if (error) throw error;
}

export async function createTable(club_id, label) {
  const { data, error } = await supabase
    .from("tables")
    .insert({ club_id, label })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Abrir/cerrar la mesa para que se pueda arrancar una partida escaneando su QR
// availability: 'closed' | 'waiting' (la pasa a 'in_match' la base al arrancar)
export async function setTableAvailability(id, availability) {
  const { error } = await supabase.from("tables").update({ availability }).eq("id", id);
  if (error) throw error;
}

// Disciplina que tiene ahora la mesa: la toman las partidas que se arrancan en ella
// discipline: 'pool' | 'ping_pong'
export async function setTableDiscipline(id, discipline) {
  const { error } = await supabase.from("tables").update({ discipline }).eq("id", id);
  if (error) throw error;
}

export async function renameTable(id, label) {
  const { error } = await supabase.from("tables").update({ label }).eq("id", id);
  if (error) throw error;
}

export async function deleteTable(id) {
  const { error } = await supabase.from("tables").delete().eq("id", id);
  if (error) throw error;
}

// Socios del club (ROADMAP 6.14). Ser socio pide permiso de los dos lados:
// el jugador pide y el club aprueba, o el club invita y el jugador acepta.
// Cada fila: { club_id, player_id, status: 'pending' | 'active', requested_by: 'player' | 'club' }
const MEMBERSHIP_FIELDS = "club_id, player_id, status, requested_by, created_at";

// Socios y pendientes de un club (los pendientes solo los ve el club o el propio jugador)
export async function getClubPlayers(clubId) {
  const { data, error } = await supabase
    .from("club_players")
    .select(`${MEMBERSHIP_FIELDS}, player:players(id, name, avatar_url, user_id)`)
    .eq("club_id", clubId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

// Clubs de un jugador, con lo pendiente que vos podés ver
export async function getPlayerMemberships(playerId) {
  const { data, error } = await supabase
    .from("club_players")
    .select(`${MEMBERSHIP_FIELDS}, club:clubs(id, name)`)
    .eq("player_id", playerId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

// El jugador logueado pide sumarse (si el club ya lo había invitado, queda adentro)
export async function requestJoinClub(clubId) {
  const { data, error } = await supabase.rpc("request_join_club", { cid: clubId });
  if (error) throw error;
  return data;
}

// El club invita a un jugador con cuenta (si ya lo había pedido, queda adentro)
export async function inviteToClub(clubId, playerId) {
  const { data, error } = await supabase.rpc("invite_to_club", { cid: clubId, pid: playerId });
  if (error) throw error;
  return data;
}

// Acepta el lado que no arrancó: el jugador su invitación, el club una solicitud
export async function acceptClubMembership(clubId, playerId) {
  const { data, error } = await supabase.rpc("accept_club_membership", { cid: clubId, pid: playerId });
  if (error) throw error;
  return data;
}

// Salir, sacar, rechazar o cancelar: borra la fila
export async function removeClubMembership(clubId, playerId) {
  const { error } = await supabase.rpc("remove_club_membership", { cid: clubId, pid: playerId });
  if (error) throw error;
}
