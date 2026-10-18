import { useEffect, useState } from "react";
import { usePlayers } from "../context/PlayerContext";
import { useMatches } from "../context/MatchContext";
import { getTables } from "../services/ClubService";
import { useAuth } from "../context/AuthContext";
import { Link, useNavigate } from "react-router-dom";

export default function NuevaPartida() {
  const { players } = usePlayers();
  const { startMatch } = useMatches();
  const { account } = useAuth();
  const [allTables, setTables] = useState([]);
  // Partidas en mesa: solo en las de tus clubs (o todas si sos admin). En una
  // mesa de otro club se arranca escaneando su QR.
  const myClubIds = (account?.clubs ?? []).map((c) => c.id);
  const tables = account?.is_admin ? allTables : allTables.filter((t) => myClubIds.includes(t.club_id));
  const [p1, setP1] = useState(account?.player?.id ?? "");
  const [p2, setP2] = useState("");
  const [tableId, setTableId] = useState(""); // "" = partida suelta, sin mesa
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    getTables().then(setTables).catch(() => setTables([]));
  }, []);

  async function handleStart(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const table = tables.find((t) => t.id === tableId) ?? null;
      const match = await startMatch(p1, p2, table);
      navigate(`/partida/${match.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="page page-narrow">
      <div className="section">
        <Link to="/partida" className="muted">← Partida</Link>
        <h1>Nueva partida</h1>
      </div>

      <form className="form" onSubmit={handleStart}>
        <label className="field">
          <span>Jugador 1</span>
          <select value={p1} onChange={(e) => setP1(e.target.value)} required>
            <option value="">Elegí un jugador</option>
            {players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>

        <label className="field">
          <span>Jugador 2</span>
          <select value={p2} onChange={(e) => setP2(e.target.value)} required>
            <option value="">Elegí un jugador</option>
            {players.filter((p) => p.id !== p1).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>

        {tables.length > 0 && (
          <label className="field">
            <span>Mesa</span>
            <select value={tableId} onChange={(e) => setTableId(e.target.value)}>
              <option value="">Sin mesa (partida suelta)</option>
              {tables.map((t) => <option key={t.id} value={t.id}>{t.club?.name} · {t.label}</option>)}
            </select>
          </label>
        )}

        {error && <p className="error">{error}</p>}
        <button className="btn btn-block" type="submit" disabled={busy || !p1 || !p2}>
          {busy ? "Arrancando…" : "Arrancar partida"}
        </button>
      </form>
    </div>
  );
}
