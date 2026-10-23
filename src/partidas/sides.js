// Lados de una partida (ROADMAP 6.15 y 6.16). player1_id y player2_id son el
// primero de los lados 1 y 2; el resto de cada equipo, y los lados 3 en
// adelante (1 vs 1 vs 1, juegos de mesa), vienen en match.teammates
// ({ player_id, side } en las listas, { side, player } en getMatchById).

// Cantidad de lados: al menos 2, salvo la práctica en solitario (sin lado 2, ROADMAP 6.17)
export function sideCount(match) {
  const count = Math.max(2, ...(match.teammates ?? []).map((t) => t.side));
  return count === 2 && isSolo(match) ? 1 : count;
}

// Práctica de una sola persona o un solo equipo: sin rival
export function isSolo(match) {
  return isPractice(match) && !match.player2_id && !(match.teammates ?? []).some((t) => t.side >= 2);
}

// Números de lado: [1, 2, ...]
export function sideNumbers(match) {
  return Array.from({ length: sideCount(match) }, (_, i) => i + 1);
}

// Ids de los jugadores de un lado, el primero adelante
export function sideIds(match, side) {
  const first = side === 1 ? match.player1_id : side === 2 ? match.player2_id : null;
  const rest = (match.teammates ?? []).filter((t) => t.side === side).map((t) => t.player_id ?? t.player?.id);
  return first ? [first, ...rest] : rest;
}

// Lado de un jugador en la partida, o null si no jugó
export function sideOf(match, playerId) {
  if (!playerId) return null;
  return sideNumbers(match).find((side) => sideIds(match, side).includes(playerId)) ?? null;
}

// Lado que ganó (el ganador guardado es el primero de su equipo)
export function winnerSide(match) {
  return sideOf(match, match.winner_id);
}

export const isPractice = (match) => match.mode === "practice";

// Solo el ping pong de partido y de dos lados lleva marcador; el resto va a ganador
export const showsScore = (match) => match.discipline === "ping_pong" && !isPractice(match) && sideCount(match) === 2;

// "Ana y Beto" con la función que da el nombre de cada id
export function sideName(match, side, nameOf) {
  const names = sideIds(match, side).map(nameOf);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}` : names[0];
}

// "A vs B vs C", salteando un lado (el tuyo) si se pasa `except`
export function sidesTitle(match, nameOf, except = null) {
  return sideNumbers(match).filter((side) => side !== except).map((side) => sideName(match, side, nameOf)).join(" vs ");
}

// "2 vs 1", "1 vs 1 vs 1" o "Solo"; null en el 1 vs 1 de siempre
export function formatLabel(match) {
  if (sideCount(match) === 1) return "Solo";
  const sizes = sideNumbers(match).map((side) => sideIds(match, side).length);
  return sizes.length > 2 || sizes.some((n) => n > 1) ? sizes.join(" vs ") : null;
}
