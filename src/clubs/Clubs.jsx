import { useEffect, useState } from "react";
import { getClubs, createClub, deleteClub, createTable, renameTable, deleteTable } from "../services/ClubService";
import { addClubMemberByPhone, createMyClub, logMatchResult } from "../services/AccountService";
import { useAuth } from "../context/AuthContext";
import { usePlayers } from "../context/PlayerContext";
import { useMatches } from "../context/MatchContext";
import "./Clubs.css";

// Partido ya jugado, sin mesa ni cámara (solo jugadores del club)
function LogMatchForm({ club, players, onSubmit }) {
  const [form, setForm] = useState({ p1: "", p2: "", score1: "", score2: "", winner: "" });
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const tie = form.score1 !== "" && form.score1 === form.score2;

  async function handleSubmit(e) {
    e.preventDefault();
    const ok = await onSubmit({
      clubId: club.id,
      player1Id: form.p1,
      player2Id: form.p2,
      score1: Number(form.score1),
      score2: Number(form.score2),
      winnerId: tie ? form.winner || null : null,
    });
    if (ok) setForm({ p1: "", p2: "", score1: "", score2: "", winner: "" });
  }

  if (players.length < 2) {
    return <p className="clubs-empty">Para cargar un partido jugado, el club necesita al menos dos jugadores propios.</p>;
  }

  return (
    <form className="table-form log-match-form" onSubmit={handleSubmit}>
      <select value={form.p1} onChange={set("p1")} required>
        <option value="">Jugador 1</option>
        {players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <input type="number" min="0" placeholder="Puntos" value={form.score1} onChange={set("score1")} required />
      <select value={form.p2} onChange={set("p2")} required>
        <option value="">Jugador 2</option>
        {players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <input type="number" min="0" placeholder="Puntos" value={form.score2} onChange={set("score2")} required />
      {tie && (
        <select value={form.winner} onChange={set("winner")} required>
          <option value="">¿Quién ganó?</option>
          {players.filter((p) => p.id === form.p1 || p.id === form.p2).map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      )}
      <button className="btn btn-secondary" type="submit">Cargar partido jugado</button>
    </form>
  );
}

// Clubs y mesas (Fase 1). Desde la Fase 3: el admin ve y maneja todo; una
// cuenta de club ve solo sus clubs y maneja sus mesas. Cualquier cuenta real
// crea su propio club y queda como dueña; el dueño da acceso a otros.
// Abrir/cerrar una mesa y su QR se manejan desde Nueva partida.
export default function Clubs() {
  const { account, refreshAccount } = useAuth();
  const { players } = usePlayers();
  const { reloadMatches } = useMatches();
  const isAdmin = !!account?.is_admin;
  const myClubIds = (account?.clubs ?? []).map((c) => c.id);
  const roleIn = (clubId) => (account?.clubs ?? []).find((c) => c.id === clubId)?.role;
  const canGrantAccess = (clubId) => isAdmin || roleIn(clubId) === "owner";
  const [ownerPhones, setOwnerPhones] = useState({}); // club_id -> celu o mail de quien recibe acceso
  const [memberRoles, setMemberRoles] = useState({}); // club_id -> 'owner' | 'staff'
  const [notice, setNotice] = useState(null);
  const [clubs, setClubs]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [form, setForm]         = useState({ name: "", address: "", contact: "" });
  const [newLabels, setNewLabels] = useState({}); // club_id -> texto del input "nueva mesa"
  const [copiedId, setCopiedId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  async function loadClubs() {
    try {
      setClubs(await getClubs());
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadClubs();
  }, []);

  async function run(action) {
    try {
      await action();
      await loadClubs();
    } catch (e) {
      // 23505 = unique_violation (mesa repetida dentro del mismo club)
      setError(e.code === "23505" ? "Ya existe una mesa con ese nombre en este club." : e.message.replace(/^PLAN_LIMIT: /, ""));
    }
  }

  async function handleCreateClub(e) {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    const fields = { name, address: form.address.trim() || null, contact: form.contact.trim() || null };
    await run(async () => {
      if (isAdmin) {
        await createClub(fields);
      } else {
        await createMyClub(fields);
        await refreshAccount(); // ya figura como dueño del club nuevo
      }
    });
    setForm({ name: "", address: "", contact: "" });
  }

  async function handleCreateTable(e, club) {
    e.preventDefault();
    const label = (newLabels[club.id] ?? "").trim() || `Mesa ${club.tables.length + 1}`;
    await run(() => createTable(club.id, label));
    setNewLabels((l) => ({ ...l, [club.id]: "" }));
  }

  function handleDeleteClub(club) {
    if (!window.confirm(`¿Borrar el club "${club.name}" y todas sus mesas? Las partidas quedan, pero sin club.`)) return;
    run(() => deleteClub(club.id));
  }

  // El ID de la mesa va en el .env del agente de esa PC (TABLE_ID)
  async function handleCopyId(table) {
    try {
      await navigator.clipboard.writeText(table.id);
      setCopiedId(table.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      window.prompt("Copiá el ID de la mesa para el TABLE_ID del agente:", table.id);
    }
  }

  function handleRenameTable(table) {
    const label = window.prompt("Nuevo nombre de la mesa:", table.label)?.trim();
    if (!label || label === table.label) return;
    run(() => renameTable(table.id, label));
  }

  function handleDeleteTable(table) {
    if (!window.confirm(`¿Borrar "${table.label}"? Las partidas quedan, pero sin mesa.`)) return;
    run(() => deleteTable(table.id));
  }

  async function handleAddOwner(e, club) {
    e.preventDefault();
    const phone = (ownerPhones[club.id] ?? "").trim();
    if (!phone) return;
    const role = memberRoles[club.id] ?? (isAdmin ? "owner" : "staff");
    await run(async () => {
      await addClubMemberByPhone(club.id, phone, role);
      setNotice(`Listo: ${phone} ya entra a ${club.name} como ${role === "owner" ? "dueño" : "staff"}.`);
    });
    setOwnerPhones((p) => ({ ...p, [club.id]: "" }));
  }

  async function handleLogMatch(fields) {
    try {
      await logMatchResult(fields);
      await reloadMatches();
      setError(null);
      setNotice("Partido cargado: ya aparece en el historial.");
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    }
  }

  if (loading || !account) return <p className="loading">Cargando clubs…</p>;
  if (account.is_anonymous) {
    return <p className="page empty">Para crear o manejar un club, entrá con tu cuenta.</p>;
  }

  const visibleClubs = isAdmin ? clubs : clubs.filter((c) => myClubIds.includes(c.id));

  return (
    <div className="page clubs-page">
      <h1>{isAdmin ? "Clubs y mesas" : visibleClubs.length > 1 ? "Mis clubs" : "Mi club"}</h1>

      {error && <p className="clubs-error">{error}</p>}
      {notice && <p className="clubs-notice">{notice}</p>}

      {!isAdmin && visibleClubs.length === 0 && (
        <p className="clubs-empty">¿Tenés un club? Crealo acá: vas a poder cargar sus mesas y jugadores, y darle acceso a tu equipo.</p>
      )}

      {/* Quien ya tiene club ve el alta de otro club recién si la pide */}
      {visibleClubs.length > 0 && !showCreate ? (
        <button type="button" className="link-btn" onClick={() => setShowCreate(true)}>+ Crear otro club</button>
      ) : (
      <form className="club-form" onSubmit={handleCreateClub}>
        <input
          type="text"
          placeholder="Nombre del club"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <input
          type="text"
          placeholder="Dirección (opcional)"
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
        />
        <input
          type="text"
          placeholder="Contacto (opcional)"
          value={form.contact}
          onChange={(e) => setForm({ ...form, contact: e.target.value })}
        />
        <button className="btn" type="submit">Crear club</button>
      </form>
      )}

      {isAdmin && visibleClubs.length === 0 && <p className="clubs-empty">Todavía no hay clubs cargados.</p>}

      <ul className="clubs-list">
        {visibleClubs.map((club) => (
          <li key={club.id} className="club-card">
            <div className="club-header">
              <div>
                <h2 className="club-name">{club.name}</h2>
                {(club.address || club.contact) && (
                  <p className="club-meta">
                    {[club.address, club.contact].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
              {isAdmin && <button className="action-danger" onClick={() => handleDeleteClub(club)} title="Borrar club">✕</button>}
            </div>

            <ul className="tables-list">
              {club.tables.map((t) => (
                <li key={t.id} className="table-row">
                  <span>{t.label}</span>
                  <span className={`table-status table-${t.status}`}>{t.status}</span>
                  <button className="table-copy" onClick={() => handleRenameTable(t)}>
                    renombrar
                  </button>
                  <button className="table-copy" onClick={() => handleCopyId(t)} title="Copiar ID para el TABLE_ID del agente">
                    {copiedId === t.id ? "✓ copiado" : "copiar ID"}
                  </button>
                  <button className="action-danger" onClick={() => handleDeleteTable(t)} title="Borrar mesa">✕</button>
                </li>
              ))}
              {club.tables.length === 0 && <li className="clubs-empty">Sin mesas todavía.</li>}
            </ul>

            <form className="table-form" onSubmit={(e) => handleCreateTable(e, club)}>
              <input
                type="text"
                placeholder={`Mesa ${club.tables.length + 1}`}
                value={newLabels[club.id] ?? ""}
                onChange={(e) => setNewLabels((l) => ({ ...l, [club.id]: e.target.value }))}
              />
              <button className="btn btn-secondary" type="submit">Agregar mesa</button>
            </form>

            {canGrantAccess(club.id) && (
              <form className="table-form" onSubmit={(e) => handleAddOwner(e, club)}>
                <input
                  type="text"
                  placeholder="Celu o mail de quien va a manejar el club"
                  value={ownerPhones[club.id] ?? ""}
                  onChange={(e) => setOwnerPhones((p) => ({ ...p, [club.id]: e.target.value }))}
                />
                <select
                  value={memberRoles[club.id] ?? (isAdmin ? "owner" : "staff")}
                  onChange={(e) => setMemberRoles((r) => ({ ...r, [club.id]: e.target.value }))}
                >
                  <option value="staff">Staff</option>
                  <option value="owner">Dueño</option>
                </select>
                <button className="btn btn-secondary" type="submit">Dar acceso</button>
              </form>
            )}

            <LogMatchForm
              club={club}
              players={players.filter((p) => p.club_id === club.id)}
              onSubmit={handleLogMatch}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
