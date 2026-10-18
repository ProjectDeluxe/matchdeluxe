import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { usePlayers } from "../context/PlayerContext";
import { useAuth } from "../context/AuthContext";

// Alta de jugador por el admin o una cuenta de club (Fase 3). El celu sirve
// para que la persona, cuando entre a la app, reclame este jugador como suyo.
export default function NuevoJugador() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const { account } = useAuth();
  const clubs = account?.clubs ?? [];
  const [clubId, setClubId] = useState("");
  const [error, setError] = useState(null);
  const { addPlayer } = usePlayers();
  const navigate = useNavigate();
  const selectedClubId = clubId || (account?.is_admin ? "" : clubs[0]?.id ?? "");

  async function handleSubmit(e) {
  e.preventDefault();

  if (!name.trim()) return; // no dejar vacío

  // evitar doble submit
  if (window.__creatingPlayer) return;
  window.__creatingPlayer = true;

  try {
    await addPlayer(name, null, { club_id: selectedClubId || null, phone: phone.trim() || null });
    navigate("/buscar");
  } catch (err) {
    setError(err.message.replace(/^PLAN_LIMIT: /, ""));
  } finally {
    window.__creatingPlayer = false;
  }
}

  return (
    <div className="page page-narrow">
      <div className="section">
        <Link to="/buscar" className="muted">← Buscar</Link>
        <h1>Nuevo jugador</h1>
      </div>

      <form className="form" onSubmit={handleSubmit}>
        <label className="field">
          <span>Nombre</span>
          <input type="text" placeholder="Nombre del jugador" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>

        <label className="field">
          <span>Celu (opcional, para que después reclame su historial)</span>
          <input type="tel" placeholder="Ej: 1134567890" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>

        {(clubs.length > 1 || account?.is_admin) && (
          <label className="field">
            <span>Club</span>
            <select value={selectedClubId} onChange={(e) => setClubId(e.target.value)}>
              {account?.is_admin && <option value="">Sin club</option>}
              {clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}

        {error && <p className="error">{error}</p>}
        <button className="btn btn-block" type="submit">
          Crear jugador
        </button>
      </form>
    </div>
  );
}
