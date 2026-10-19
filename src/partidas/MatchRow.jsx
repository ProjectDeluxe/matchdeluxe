import { Link } from "react-router-dom";

function shortDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "hoy";
  if (d.toDateString() === yesterday.toDateString()) return "ayer";
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}

// Una partida en una lista. Con `me` (id de jugador) se muestra desde su lado:
// "vs rival", G/P y su puntaje primero. Sin `me`, "A vs B".
export default function MatchRow({ match: m, nameOf, me = null }) {
  const mine = me && (m.player1_id === me || m.player2_id === me);
  const meFirst = mine && m.player2_id === me ? false : true;
  const [a, b] = meFirst ? [m.score1 ?? 0, m.score2 ?? 0] : [m.score2 ?? 0, m.score1 ?? 0];
  const finished = m.status === "finished";
  const rival = mine ? (m.player1_id === me ? m.player2_id : m.player1_id) : null;
  const won = mine && finished && m.winner_id === me;

  return (
    <li>
      <Link className="list-row" to={!finished && mine ? `/partida/${m.id}/control` : `/partida/${m.id}`}>
        {mine ? (
          <span className={`result${won ? " result-win" : ""}`}>{finished ? (won ? "G" : "P") : <span className="live-dot" title="En curso" />}</span>
        ) : null}
        <span className="list-row-main">
          <span className="list-row-title">
            {mine ? `vs ${nameOf(rival)}` : `${nameOf(m.player1_id)} vs ${nameOf(m.player2_id)}`}
          </span>
          {!finished && <span className="list-row-sub">{!mine && <span className="live-dot" />} En curso</span>}
        </span>
        <span className="score">{a}–{b}</span>
        <span className="list-row-sub match-date">{shortDate(m.started_at)}</span>
      </Link>
    </li>
  );
}
