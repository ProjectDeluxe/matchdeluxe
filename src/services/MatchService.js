import { supabase } from "../supabaseClient";

// Disciplinas (ROADMAP 6.13). Pool se juega a ganador, sin marcador (6.15).
export const DISCIPLINES = { pool: "Pool", ping_pong: "Ping pong" };

// Partido (cuenta para el perfil) o práctica (sin puntos ni ganador), ROADMAP 6.15
export const MODES = { match: "Partido", practice: "Práctica" };

// Trae todas las partidas (para historial), con el resto de cada equipo
export async function getMatches() {
  const { data, error } = await supabase
    .from("matches")
    .select("*, teammates:match_teammates(player_id, side)")
    .order("started_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

// Trae una partida con datos de los jugadores incluidos
export async function getMatchById(id) {
  const { data, error } = await supabase
    .from("matches")
    .select(`
      *,
      player1:players!player1_id(id, name, avatar_url),
      player2:players!player2_id(id, name, avatar_url),
      teammates:match_teammates(side, player:players(id, name, avatar_url)),
      table:tables!table_id(id, label, club:clubs(id, name))
    `)
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}

// Crea una partida nueva (mesa opcional: sin mesa queda como partida suelta).
// En una mesa, la base usa la disciplina de la mesa y no la que viene acá.
// teammates: el resto de cada equipo, [{ player_id, side: 1 | 2 }].
export async function createMatch(player1_id, player2_id, table = null, discipline = "pool", { mode = "match", teammates = [] } = {}) {
  // Solo el ping pong de partido lleva marcador
  const scored = discipline === "ping_pong" && mode === "match";
  const { data, error } = await supabase
    .from("matches")
    .insert({
      player1_id,
      player2_id,
      club_id: table?.club_id ?? null,
      table_id: table?.id ?? null,
      discipline,
      mode,
      score1: scored ? 0 : null,
      score2: scored ? 0 : null,
      status: "active",
    })
    .select()
    .single();

  if (error) throw error;

  if (teammates.length > 0) {
    const { error: teamError } = await supabase
      .from("match_teammates")
      .insert(teammates.map((t) => ({ ...t, match_id: data.id })));
    if (teamError) throw teamError;
  }
  return data;
}

// Actualiza el marcador
export async function updateScore(matchId, score1, score2) {
  const { data, error } = await supabase
    .from("matches")
    .update({ score1, score2 })
    .eq("id", matchId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Finaliza la partida
export async function finishMatchById(matchId, winnerId) {
  const { data, error } = await supabase
    .from("matches")
    .update({
      winner_id: winnerId,
      status: "finished",
      finished_at: new Date().toISOString(),
    })
    .eq("id", matchId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Manda un comando desde el celular hacia la PC
// tipos: 'save_clip' | 'mark_moment' | 'score_update' | 'end_match'
export async function sendCommand(matchId, type, payload = {}) {
  const { data, error } = await supabase
    .from("realtime_commands")
    .insert({ match_id: matchId, type, payload })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Alias legacy para el MatchContext
export async function setMatchWinner(match_id, winner_id) {
  return finishMatchById(match_id, winner_id);
}
