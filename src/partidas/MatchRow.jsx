import { Link } from "react-router-dom";
import { DISCIPLINES, MODES } from "../services/MatchService";
import { formatLabel, isCut, isPractice, showsScore, sideCount, sideOf, sidesTitle, winnerSide } from "./sides";

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
// "vs rival", G/P y su puntaje primero. Sin `me`, "A vs B". Pool y práctica
// van sin marcador; la práctica tampoco tiene G/P (ROADMAP 6.15).
export default function MatchRow({ match: m, nameOf, me = null }) {
  const mySide = sideOf(m, me);
  const mine = mySide !== null;
  const meFirst = mySide !== 2;
  const [a, b] = meFirst ? [m.score1 ?? 0, m.score2 ?? 0] : [m.score2 ?? 0, m.score1 ?? 0];
  const finished = m.status === "finished";
  const practice = isPractice(m);
  const cut = isCut(m);
  const won = mine && finished && winnerSide(m) === mySide;
  const sub = [
    m.discipline !== "pool" && DISCIPLINES[m.discipline],
    formatLabel(m),
    practice && MODES.practice,
    cut && "Cortada",
    !finished && "En curso",
  ].filter(Boolean);

  return (
    <li>
      <Link className="list-row" to={!finished && mine ? `/partida/${m.id}/control` : `/partida/${m.id}`}>
        {mine ? (
          <span className={`result${won ? " result-win" : ""}`}>
            {!finished ? <span className="live-dot" title="En curso" /> : practice || cut ? "–" : won ? "G" : "P"}
          </span>
        ) : null}
        <span className="list-row-main">
          <span className="list-row-title">
            {mine && sideCount(m) > 1 ? `vs ${sidesTitle(m, nameOf, mySide)}` : sidesTitle(m, nameOf)}
          </span>
          {sub.length > 0 && (
            <span className="list-row-sub">
              {!finished && !mine && <span className="live-dot" />}{" "}
              {sub.join(" · ")}
            </span>
          )}
        </span>
        {showsScore(m) && <span className="score">{a}–{b}</span>}
        <span className="list-row-sub match-date">{shortDate(m.started_at)}</span>
      </Link>
    </li>
  );
}
