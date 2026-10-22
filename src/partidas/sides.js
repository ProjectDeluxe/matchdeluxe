// Lados de una partida (ROADMAP 6.15). player1_id y player2_id son el primero
// de cada lado; el resto de cada equipo viene en match.teammates
// ({ player_id, side } en las listas, { side, player } en getMatchById).

// Ids de los jugadores de un lado (1 o 2), el primero adelante
export function sideIds(match, side) {
  const first = side === 1 ? match.player1_id : match.player2_id;
  const rest = (match.teammates ?? []).filter((t) => t.side === side).map((t) => t.player_id ?? t.player?.id);
  return [first, ...rest];
}

// Lado de un jugador en la partida, o null si no jugó
export function sideOf(match, playerId) {
  if (!playerId) return null;
  if (sideIds(match, 1).includes(playerId)) return 1;
  if (sideIds(match, 2).includes(playerId)) return 2;
  return null;
}

// Lado que ganó (el ganador guardado es el primero de su equipo)
export function winnerSide(match) {
  if (!match.winner_id) return null;
  if (match.winner_id === match.player1_id) return 1;
  if (match.winner_id === match.player2_id) return 2;
  return null;
}

export const isPractice = (match) => match.mode === "practice";

// Solo el ping pong de partido lleva marcador; pool va a ganador
export const showsScore = (match) => match.discipline === "ping_pong" && !isPractice(match);

// "Ana y Beto" con la función que da el nombre de cada id
export function sideName(match, side, nameOf) {
  const names = sideIds(match, side).map(nameOf);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}` : names[0];
}

// "2 vs 2" en partidas por equipos, null en 1 vs 1
export function formatLabel(match) {
  const a = sideIds(match, 1).length;
  const b = sideIds(match, 2).length;
  return a > 1 || b > 1 ? `${a} vs ${b}` : null;
}
