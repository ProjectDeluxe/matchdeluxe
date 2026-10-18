import { Link } from "react-router-dom";
import { useMatches } from "../context/MatchContext";
import { usePlayers } from "../context/PlayerContext";
import { useAuth } from "../context/AuthContext";
import MatchRow from "./MatchRow.jsx";
import "./Partida.css";

// Partida: arrancar una nueva, volver a la que está en curso y el historial.
// Reemplaza a Historial y al acceso suelto a Nueva partida.
export default function Partidas() {
  const { matches, loading } = useMatches();
  const { players } = usePlayers();
  const { account } = useAuth();
  const me = account?.player?.id ?? null;

  const nameOf = (id) => players.find((p) => p.id === id)?.name ?? "Jugador";
  const active = matches.filter((m) => m.status !== "finished");
  const finished = matches.filter((m) => m.status === "finished");

  return (
    <div className="page">
      <h1>Partida</h1>

      <div className="card card-soft">
        <p className="muted">¿Estás en un club? Escaneá el QR de la mesa con la cámara del celu y arrancás ahí mismo.</p>
        <Link className="btn btn-block" to="/partida/nueva">Nueva partida</Link>
      </div>

      {loading ? (
        <p className="loading">Cargando partidas…</p>
      ) : (
        <>
          {active.length > 0 && (
            <section className="section">
              <h2>En curso</h2>
              <ul className="list">
                {active.map((m) => <MatchRow key={m.id} match={m} nameOf={nameOf} me={me} />)}
              </ul>
            </section>
          )}

          <section className="section">
            <h2>Historial</h2>
            {finished.length === 0 ? (
              <p className="empty">Todavía no hay partidas terminadas.</p>
            ) : (
              <ul className="list">
                {finished.map((m) => <MatchRow key={m.id} match={m} nameOf={nameOf} me={me} />)}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
