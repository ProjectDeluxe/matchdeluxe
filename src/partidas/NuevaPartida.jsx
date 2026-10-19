import { useEffect, useState } from "react";
import QRCode from "react-qr-code";
import { usePlayers } from "../context/PlayerContext";
import { useMatches } from "../context/MatchContext";
import { getTables, setTableAvailability } from "../services/ClubService";
import { createGuestPlayer } from "../services/AccountService";
import { useAuth } from "../context/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import "./Partida.css";

const GUEST = "guest"; // Jugador 2 sin cuenta: se crea como invitado al arrancar
const AVAILABILITY_LABEL = { closed: "Cerrada", waiting: "Abierta", in_match: "En partida" };

export default function NuevaPartida() {
  const { players, reloadPlayers } = usePlayers();
  const { startMatch } = useMatches();
  const { account } = useAuth();
  const [allTables, setTables] = useState([]);
  // Partidas en mesa: solo en las de tus clubs (o todas si sos admin). En una
  // mesa de otro club se arranca escaneando su QR. Quien ve la mesa acá es del
  // club, así que también la abre o la cierra.
  const myClubIds = (account?.clubs ?? []).map((c) => c.id);
  const tables = account?.is_admin ? allTables : allTables.filter((t) => myClubIds.includes(t.club_id));
  const [p1, setP1] = useState(account?.player?.id ?? "");
  const [p2, setP2] = useState("");
  const [guestName, setGuestName] = useState("");
  const [tableId, setTableId] = useState(""); // "" = partida suelta, sin mesa
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const table = tables.find((t) => t.id === tableId) ?? null;

  function loadTables() {
    return getTables().then(setTables).catch(() => setTables([]));
  }

  useEffect(() => {
    loadTables();
  }, []);

  async function handleToggleOpen() {
    const next = table.availability === "closed" ? "waiting" : "closed";
    if (table.availability === "in_match" && !window.confirm(`Hay una partida en curso en "${table.label}". ¿Cerrar la mesa igual?`)) return;
    try {
      await setTableAvailability(table.id, next);
      await loadTables();
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleStart(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      let rivalId = p2;
      if (p2 === GUEST) {
        rivalId = (await createGuestPlayer(guestName.trim())).id;
        reloadPlayers();
      }
      const match = await startMatch(p1, rivalId, table);
      navigate(`/partida/${match.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const qrUrl = table ? `${window.location.origin}/mesa/${table.qr_token}` : null;

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
            <option value={GUEST}>Invitado (sin cuenta)</option>
            {players.filter((p) => p.id !== p1).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>

        {p2 === GUEST && (
          <label className="field">
            <span>Nombre del invitado</span>
            <input type="text" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Ej: Juan" required />
          </label>
        )}

        {tables.length > 0 && (
          <label className="field">
            <span>Mesa</span>
            <select value={tableId} onChange={(e) => setTableId(e.target.value)}>
              <option value="">Sin mesa (partida suelta)</option>
              {tables.map((t) => <option key={t.id} value={t.id}>{t.club?.name} · {t.label}</option>)}
            </select>
          </label>
        )}

        {table && (
          <div className="qr-section">
            <p className="qr-label">
              {AVAILABILITY_LABEL[table.availability] ?? table.availability}
              {table.availability === "closed" ? ": nadie puede arrancar una partida escaneando su QR." : ": cualquiera escanea el QR y arranca una partida."}
            </p>
            <button type="button" className="btn btn-secondary" onClick={handleToggleOpen}>
              {table.availability === "closed" ? "Abrir mesa" : "Cerrar mesa"}
            </button>
            {table.availability !== "closed" && (
              <>
                <div className="qr-wrapper">
                  <QRCode value={qrUrl} size={180} bgColor="#ffffff" fgColor="#000000" />
                </div>
                <a className="qr-url" href={qrUrl} target="_blank" rel="noreferrer">{qrUrl}</a>
                <span className="qr-label">Este QR no cambia: se puede imprimir y pegar en {table.label}.</span>
              </>
            )}
          </div>
        )}

        {error && <p className="error">{error}</p>}
        <button className="btn btn-block" type="submit" disabled={busy || !p1 || !p2 || (p2 === GUEST && !guestName.trim())}>
          {busy ? "Arrancando…" : "Arrancar partida"}
        </button>
      </form>
    </div>
  );
}
