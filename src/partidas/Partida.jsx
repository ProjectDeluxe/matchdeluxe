import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import QRCode from "react-qr-code";
import { getMatchById, DISCIPLINES, MODES } from "../services/MatchService";
import { formatLabel, isPractice, showsScore, sideName, winnerSide } from "./sides";
import { supabase } from "../supabaseClient";
import "./Partida.css";

export default function Partida() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);

  const controlUrl = `${window.location.origin}/partida/${id}/control`;

  // Carga inicial
  useEffect(() => {
    getMatchById(id)
      .then(setMatch)
      .finally(() => setLoading(false));
  }, [id]);

  // Suscripción Realtime — actualiza marcador y estado automáticamente
  useEffect(() => {
    const channel = supabase
      .channel(`match-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "matches", filter: `id=eq.${id}` },
        (payload) => {
          setMatch((prev) => ({ ...prev, ...payload.new }));
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [id]);

  if (loading) return <p className="loading-text">Cargando partida...</p>;
  if (!match)  return <p className="loading-text">Partida no encontrada.</p>;

  const p1 = match.player1;
  const p2 = match.player2;
  const finished = match.status === "finished";
  const scored = showsScore(match); // pool y práctica van sin marcador (ROADMAP 6.15)
  const people = [p1, p2, ...(match.teammates ?? []).map((t) => t.player)].filter(Boolean);
  const nameOf = (pid) => people.find((p) => p.id === pid)?.name ?? "Jugador";

  return (
    <div className="partida-pc">
      {/* Encabezado */}
      <div className="partida-header">
        <h1 className="partida-title">
          {sideName(match, 1, nameOf)} <span className="vs">vs</span> {sideName(match, 2, nameOf)}
        </h1>
        <span className="partida-mesa">
          {[match.table?.club?.name, match.table?.label, DISCIPLINES[match.discipline] ?? DISCIPLINES.pool, formatLabel(match), isPractice(match) && MODES.practice].filter(Boolean).join(" · ")}
        </span>
        <span className={`partida-status ${finished ? "status-finished" : "status-active"}`}>
          {finished ? "Terminada" : "En curso"}
        </span>
      </div>

      <div className="partida-body">
        {/* Marcador (solo ping pong de partido) */}
        {scored && (
        <div className="score-board">
          <div className="score-side">
            {p1?.avatar_url && (
              <img src={p1.avatar_url} alt={p1.name} className="score-avatar" />
            )}
            <span className="score-name">{p1?.name ?? "J1"}</span>
            <span className="score-number">{match.score1 ?? 0}</span>
          </div>

          <div className="score-divider">:</div>

          <div className="score-side">
            {p2?.avatar_url && (
              <img src={p2.avatar_url} alt={p2.name} className="score-avatar" />
            )}
            <span className="score-name">{p2?.name ?? "J2"}</span>
            <span className="score-number">{match.score2 ?? 0}</span>
          </div>
        </div>
        )}

        {/* QR */}
        {!finished && (
          <div className="qr-section">
            <p className="qr-label">Escaneá para controlar desde el celular</p>
            <div className="qr-wrapper">
              <QRCode
                value={controlUrl}
                size={180}
                bgColor="#ffffff"
                fgColor="#000000"
              />
            </div>
            <p className="qr-url">{controlUrl}</p>
          </div>
        )}

        {/* Ganador */}
        {finished && winnerSide(match) && (
          <div className="winner-banner">
            Ganó {sideName(match, winnerSide(match), nameOf)}
          </div>
        )}
        {finished && isPractice(match) && <div className="winner-banner">Práctica terminada</div>}
      </div>

      <button className="btn btn-secondary back-btn" onClick={() => navigate("/partida")}>
        ← Volver
      </button>
    </div>
  );
}
