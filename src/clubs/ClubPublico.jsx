import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getClubs, getClubPlayers, requestJoinClub, acceptClubMembership, removeClubMembership } from "../services/ClubService";
import { getFeed } from "../services/ClipService";
import { useAuth } from "../context/AuthContext";
import { usePlan } from "../plan/usePlan";
import Avatar from "../components/Avatar.jsx";
import ClipList from "../clips/ClipList.jsx";
import { ChevronIcon } from "../components/Icons.jsx";

const AVAILABILITY = { closed: "Cerrada", waiting: "Libre", in_match: "Jugando" };

// Página de un club (se llega desde Buscar): mesas, socios y clips públicos.
// Quien lo maneja tiene el acceso a administrarlo. Un jugador con cuenta
// pide sumarse acá, o acepta la invitación del club (ROADMAP 6.14).
export default function ClubPublico() {
  const { id } = useParams();
  const { user, account } = useAuth();
  const { plan } = usePlan();
  const [club, setClub] = useState(undefined); // undefined = cargando, null = no existe
  const [clips, setClips] = useState(null);
  const [memberships, setMemberships] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const guest = !!user?.is_anonymous;

  useEffect(() => {
    getClubs()
      .then((all) => setClub(all.find((c) => c.id === id) ?? null))
      .catch(() => setClub(null));
  }, [id]);

  useEffect(() => {
    getClubPlayers(id).then(setMemberships).catch(() => setMemberships([]));
  }, [id]);

  useEffect(() => {
    // El feed de clips públicos pide cuenta real (Fase 4, paso 5)
    if (guest) return;
    getFeed({ clubId: id })
      .then((page) => setClips(page.clips))
      .catch(() => setClips([]));
  }, [id, guest]);

  if (club === undefined) return <p className="loading">Cargando club…</p>;
  if (club === null) return <p className="empty">Este club no existe.</p>;

  const manages = !!account?.is_admin || (account?.clubs ?? []).some((c) => c.id === id);
  const clubPlayers = memberships.filter((m) => m.status === "active").map((m) => m.player).filter(Boolean);
  const myPlayerId = account?.player?.id;
  const mine = memberships.find((m) => m.player_id === myPlayerId);

  async function membershipAction(action) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setMemberships(await getClubPlayers(id));
    } catch (e) {
      setError(e.message.replace(/^PLAN_LIMIT: /, ""));
    } finally {
      setBusy(false);
    }
  }

  function handleLeave() {
    if (!window.confirm(`¿Salir de ${club.name}?`)) return;
    membershipAction(() => removeClubMembership(id, myPlayerId));
  }

  return (
    <div className="page">
      <Link to="/buscar" className="muted">← Buscar</Link>

      <div className="page-head">
        <div className="section">
          <h1>{club.name}</h1>
          {(club.address || club.contact) && <p className="muted">{[club.address, club.contact].filter(Boolean).join(" · ")}</p>}
        </div>
        {manages && <Link className="btn btn-secondary btn-small" to="/clubs">Administrar</Link>}
      </div>

      {myPlayerId && !guest && (
        <section className="card card-soft club-membership">
          {!mine && (
            <>
              <p className="muted">¿Jugás en este club? Pedí sumarte y el club te aprueba.</p>
              <button type="button" className="btn btn-small" disabled={busy} onClick={() => membershipAction(() => requestJoinClub(id))}>Pedir sumarme</button>
            </>
          )}
          {mine?.status === "pending" && mine.requested_by === "player" && (
            <>
              <p className="muted">Pediste sumarte. Falta que el club te apruebe.</p>
              <button type="button" className="btn btn-secondary btn-small" disabled={busy} onClick={() => membershipAction(() => removeClubMembership(id, myPlayerId))}>Cancelar solicitud</button>
            </>
          )}
          {mine?.status === "pending" && mine.requested_by === "club" && (
            <>
              <p>{club.name} te invitó a ser socio.</p>
              <div className="row-actions">
                <button type="button" className="btn btn-small" disabled={busy} onClick={() => membershipAction(() => acceptClubMembership(id, myPlayerId))}>Aceptar</button>
                <button type="button" className="btn btn-secondary btn-small" disabled={busy} onClick={() => membershipAction(() => removeClubMembership(id, myPlayerId))}>Rechazar</button>
              </div>
            </>
          )}
          {mine?.status === "active" && (
            <>
              <p className="muted">Sos socio de este club.</p>
              <button type="button" className="btn btn-danger btn-small" disabled={busy} onClick={handleLeave}>Salir del club</button>
            </>
          )}
          {error && <p className="error">{error}</p>}
        </section>
      )}

      <section className="section">
        <h2>Mesas</h2>
        {club.tables.length === 0 ? (
          <p className="empty">Todavía no cargó mesas.</p>
        ) : (
          <ul className="list">
            {club.tables.map((t) => (
              <li key={t.id} className="list-row">
                <span className="list-row-main"><span className="list-row-title">{t.label}</span></span>
                <span className="badge">
                  {t.availability === "waiting" && <span className="dot" />}
                  {AVAILABILITY[t.availability] ?? t.availability}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {clubPlayers.length > 0 && (
        <section className="section">
          <h2>Socios</h2>
          <ul className="list">
            {clubPlayers.map((p) => (
              <li key={p.id}>
                <Link className="list-row" to={`/jugadores/${p.id}`}>
                  <Avatar src={p.avatar_url} name={p.name} />
                  <span className="list-row-main"><span className="list-row-title">{p.name}</span></span>
                  <span className="muted"><ChevronIcon /></span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!guest && (
        <section className="section">
          <h2>Clips públicos</h2>
          {clips === null ? (
            <p className="loading">Cargando clips…</p>
          ) : (
            <ClipList clips={clips} canDownload={!!plan?.can_download} canReport emptyText="Este club todavía no tiene clips públicos." />
          )}
        </section>
      )}
    </div>
  );
}
