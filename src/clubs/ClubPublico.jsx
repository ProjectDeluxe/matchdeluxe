import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getClubs } from "../services/ClubService";
import { getFeed } from "../services/ClipService";
import { usePlayers } from "../context/PlayerContext";
import { useAuth } from "../context/AuthContext";
import { usePlan } from "../plan/usePlan";
import Avatar from "../components/Avatar.jsx";
import ClipList from "../clips/ClipList.jsx";
import { ChevronIcon } from "../components/Icons.jsx";

const AVAILABILITY = { closed: "Cerrada", waiting: "Libre", in_match: "Jugando" };

// Página de un club (se llega desde Buscar): mesas, jugadores y clips públicos.
// Quien lo maneja tiene el acceso a administrarlo.
export default function ClubPublico() {
  const { id } = useParams();
  const { user, account } = useAuth();
  const { players } = usePlayers();
  const { plan } = usePlan();
  const [club, setClub] = useState(undefined); // undefined = cargando, null = no existe
  const [clips, setClips] = useState(null);
  const guest = !!user?.is_anonymous;

  useEffect(() => {
    getClubs()
      .then((all) => setClub(all.find((c) => c.id === id) ?? null))
      .catch(() => setClub(null));
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
  const clubPlayers = players.filter((p) => p.club_id === id);

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
          <h2>Jugadores</h2>
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
