import { useEffect, useState } from "react";
import QRCode from "react-qr-code";
import { usePlayers } from "../context/PlayerContext";
import { useMatches } from "../context/MatchContext";
import { getTables, setTableAvailability, setTableDiscipline } from "../services/ClubService";
import { DISCIPLINES, MODES } from "../services/MatchService";
import { createGuestPlayer } from "../services/AccountService";
import { useAuth } from "../context/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import "./Partida.css";

const GUEST = "guest"; // Jugador sin cuenta: se crea como invitado al arrancar
const AVAILABILITY_LABEL = { closed: "Cerrada", waiting: "Abierta", in_match: "En partida" };
const MAX_PER_SIDE = 3; // hasta 3 vs 3 (ROADMAP 6.15)
const emptySlot = { id: "", guestName: "" };

// Un lugar de un lado: jugador cargado o invitado con nombre libre
function PlayerSlot({ label, slot, players, onChange }) {
  return (
    <>
      <label className="field">
        <span>{label}</span>
        <select value={slot.id} onChange={(e) => onChange({ ...slot, id: e.target.value })} required>
          <option value="">Elegí un jugador</option>
          <option value={GUEST}>Invitado (sin cuenta)</option>
          {players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      {slot.id === GUEST && (
        <label className="field">
          <span>Nombre del invitado</span>
          <input type="text" value={slot.guestName} onChange={(e) => onChange({ ...slot, guestName: e.target.value })} placeholder="Ej: Juan" required />
        </label>
      )}
    </>
  );
}

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
  // Los dos lados de la partida; con más de uno por lado es por equipos
  const [sides, setSides] = useState([[{ ...emptySlot, id: account?.player?.id ?? "" }], [emptySlot]]);
  const [mode, setMode] = useState("match");
  const [tableId, setTableId] = useState(""); // "" = partida suelta, sin mesa
  const [looseDiscipline, setLooseDiscipline] = useState("pool"); // la de la partida suelta
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const table = tables.find((t) => t.id === tableId) ?? null;
  // En una mesa manda la disciplina de la mesa (también para quien entra por el QR)
  const discipline = table ? table.discipline ?? "pool" : looseDiscipline;

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

  async function handleDiscipline(next) {
    if (!table) return setLooseDiscipline(next);
    try {
      await setTableDiscipline(table.id, next);
      await loadTables();
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }

  const perSide = sides[0].length;
  const chosen = sides.flat().map((slot) => slot.id).filter((id) => id && id !== GUEST);
  const ready =
    sides.flat().every((slot) => slot.id && (slot.id !== GUEST || slot.guestName.trim())) &&
    new Set(chosen).size === chosen.length;

  function setSlot(side, index, slot) {
    setSides((prev) => prev.map((s, i) => (i === side ? s.map((x, j) => (j === index ? slot : x)) : s)));
  }

  // Suma o saca un jugador de cada lado (1 vs 1, 2 vs 2, 3 vs 3)
  function resize(delta) {
    setSides((prev) => prev.map((s) => (delta > 0 ? [...s, emptySlot] : s.slice(0, -1))));
  }

  async function handleStart(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      let createdGuest = false;
      const ids = [];
      for (const side of sides) {
        const sideIds = [];
        for (const slot of side) {
          if (slot.id === GUEST) {
            sideIds.push((await createGuestPlayer(slot.guestName.trim())).id);
            createdGuest = true;
          } else {
            sideIds.push(slot.id);
          }
        }
        ids.push(sideIds);
      }
      if (createdGuest) reloadPlayers();
      const teammates = ids.flatMap((sideIds, i) => sideIds.slice(1).map((player_id) => ({ player_id, side: i + 1 })));
      const match = await startMatch(ids[0][0], ids[1][0], table, discipline, { mode, teammates });
      // Desde el celu vas directo al control. Desde la PC, a la pantalla con el
      // QR para manejar la partida desde un celu.
      const mobile = window.matchMedia("(pointer: coarse)").matches;
      navigate(mobile ? `/partida/${match.id}/control` : `/partida/${match.id}`);
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
        {sides.map((side, i) => (
          <fieldset key={i} className="side-fieldset">
            {perSide > 1 && <legend>Equipo {i + 1}</legend>}
            {side.map((slot, j) => (
              <PlayerSlot
                key={j}
                label={perSide > 1 ? `Jugador ${j + 1}` : `Jugador ${i + 1}`}
                slot={slot}
                players={players.filter((p) => p.id === slot.id || !chosen.includes(p.id))}
                onChange={(next) => setSlot(i, j, next)}
              />
            ))}
          </fieldset>
        ))}

        <div className="side-actions">
          {perSide < MAX_PER_SIDE && (
            <button type="button" className="btn btn-secondary btn-small" onClick={() => resize(1)}>
              + Sumar jugador por lado
            </button>
          )}
          {perSide > 1 && (
            <button type="button" className="link-btn" onClick={() => resize(-1)}>
              Volver a {perSide - 1} vs {perSide - 1}
            </button>
          )}
        </div>

        <label className="field">
          <span>Tipo</span>
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            {Object.entries(MODES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        {mode === "practice" && <p className="muted">Sin puntos ni ganador: queda en el historial pero no suma a las estadísticas.</p>}

        {tables.length > 0 && (
          <label className="field">
            <span>Mesa</span>
            <select value={tableId} onChange={(e) => setTableId(e.target.value)}>
              <option value="">Sin mesa (partida suelta)</option>
              {tables.map((t) => <option key={t.id} value={t.id}>{t.club?.name} · {t.label}</option>)}
            </select>
          </label>
        )}

        <label className="field">
          <span>Disciplina</span>
          <select value={discipline} onChange={(e) => handleDiscipline(e.target.value)}>
            {Object.entries(DISCIPLINES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>

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
        <button className="btn btn-block" type="submit" disabled={busy || !ready}>
          {busy ? "Arrancando…" : "Arrancar partida"}
        </button>
      </form>
    </div>
  );
}
