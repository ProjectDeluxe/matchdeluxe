import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { usePlayers } from "../context/PlayerContext";
import { useMatches } from "../context/MatchContext";
import { uploadAvatar } from "../services/PlayerService";
import { getClipsByPlayer } from "../services/ClipService";
import { getPlayerMemberships, inviteToClub, acceptClubMembership, removeClubMembership } from "../services/ClubService";
import ClipList from "../clips/ClipList.jsx";
import MatchRow from "../partidas/MatchRow.jsx";
import { isPractice, sideOf, winnerSide } from "../partidas/sides";
import Avatar from "../components/Avatar.jsx";
import { usePlan } from "../plan/usePlan";
import { useAuth } from "../context/AuthContext";
import { useLiveReload } from "../context/useLiveReload";
import { ClipsIcon, HistoryIcon, SettingsIcon } from "../components/Icons.jsx";
import "./PerfilJugador.css";

const RECENT = 5;

// En el perfil de otro jugador con cuenta, quien maneja un club lo invita a
// ser socio (ROADMAP 6.14). Queda pendiente hasta que el jugador acepte; si
// él ya había pedido sumarse, invitarlo es aprobarlo.
function ClubInvites({ player }) {
  const { account } = useAuth();
  const myClubs = account?.clubs ?? [];
  const [memberships, setMemberships] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const show = !!player.user_id && myClubs.length > 0;

  useEffect(() => {
    if (!show) return;
    getPlayerMemberships(player.id).then(setMemberships).catch(() => setMemberships([]));
  }, [player.id, show]);

  useLiveReload(["club_players"], () => getPlayerMemberships(player.id).then(setMemberships), { enabled: show });

  if (!show) return null;
  if (memberships === null) return <p className="loading">Cargando clubs…</p>;

  async function run(action) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setMemberships(await getPlayerMemberships(player.id));
    } catch (e) {
      setError(e.message.replace(/^PLAN_LIMIT: /, ""));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section">
      <ul className="list">
        {myClubs.map((club) => {
          const m = memberships.find((x) => x.club_id === club.id);
          return (
            <li key={club.id} className="list-row">
              <span className="list-row-main">
                <span className="list-row-title">{club.name}</span>
                <span className="list-row-sub">
                  {!m && "No es socio"}
                  {m?.status === "active" && "Es socio"}
                  {m?.status === "pending" && m.requested_by === "club" && "Invitado, falta que acepte"}
                  {m?.status === "pending" && m.requested_by === "player" && "Pidió sumarse"}
                </span>
              </span>
              {!m && (
                <button type="button" className="btn btn-small" disabled={busy} onClick={() => run(() => inviteToClub(club.id, player.id))}>Invitar</button>
              )}
              {m?.status === "pending" && m.requested_by === "club" && (
                <button type="button" className="btn btn-secondary btn-small" disabled={busy} onClick={() => run(() => removeClubMembership(club.id, player.id))}>Cancelar</button>
              )}
              {m?.status === "pending" && m.requested_by === "player" && (
                <button type="button" className="btn btn-small" disabled={busy} onClick={() => run(() => acceptClubMembership(club.id, player.id))}>Aprobar</button>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

// Perfil de un jugador: foto, estadísticas, últimas partidas y clips. Lo usan
// /jugadores/:id y tu propio perfil (/perfil).
// Debajo de las estadísticas, pestañas como en Instagram: clips, historial y,
// opciones: las tuyas (options) en tu perfil; en el de otro, invitarlo a tu
// club si manejás uno (más adelante: desafiarlo o arreglar un partido).
export function PlayerProfile({ playerId, own = false, options = null }) {
  const { players, editPlayer, removePlayer } = usePlayers();
  const { matches } = useMatches();
  const { plan } = usePlan();
  const { user, account } = useAuth();
  const navigate = useNavigate();
  const [clips, setClips] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [tab, setTab] = useState("clips");
  const [error, setError] = useState(null);

  useEffect(() => {
    getClipsByPlayer(playerId).then(setClips).catch(() => setClips([]));
  }, [playerId]);

  const player = players.find((p) => p.id === playerId);
  if (!player) return <p className="loading">Cargando jugador…</p>;

  const isAdmin = !!account?.is_admin;
  const myClubIds = (account?.clubs ?? []).map((c) => c.id);
  // Quién puede editar o borrar este jugador (lo mismo que permite la base, Fase 3)
  const canEdit =
    isAdmin ||
    (player.user_id && player.user_id === account?.player?.user_id) ||
    (!player.user_id && myClubIds.includes(player.club_id));
  const canDelete = !own && (isAdmin || (!player.user_id && myClubIds.includes(player.club_id)));

  const nameOf = (id) => players.find((p) => p.id === id)?.name ?? "Jugador";
  const myMatches = matches.filter((m) => sideOf(m, playerId) !== null);
  // Las prácticas quedan en el historial pero no cuentan como jugadas ni ganadas
  const finished = myMatches.filter((m) => m.status === "finished" && !isPractice(m));
  const wins = finished.filter((m) => winnerSide(m) === sideOf(m, playerId)).length;
  const winrate = finished.length ? Math.round((wins / finished.length) * 100) : 0;
  const shown = showAll ? myMatches : myMatches.slice(0, RECENT);
  const tabs = [
    { id: "clips", label: "Clips", Icon: ClipsIcon },
    { id: "history", label: "Historial", Icon: HistoryIcon },
    { id: "options", label: "Opciones", Icon: SettingsIcon },
  ];

  async function changeAvatar(event) {
    const file = event.target.files[0];
    if (!file) return;
    setError(null);
    try {
      const publicUrl = await uploadAvatar(file, playerId);
      await editPlayer(player.id, { avatar_url: publicUrl });
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`¿Borrar a ${player.name}? Sus partidas quedan.`)) return;
    try {
      await removePlayer(player.id);
      navigate("/buscar");
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <>
      <div className="profile-head">
        {canEdit ? (
          <label className="profile-avatar-edit" title="Cambiar foto">
            <Avatar src={player.avatar_url} name={player.name} className="avatar avatar-lg" />
            <span className="profile-avatar-hint">Cambiar foto</span>
            <input type="file" accept="image/*" onChange={changeAvatar} hidden />
          </label>
        ) : (
          <Avatar src={player.avatar_url} name={player.name} className="avatar avatar-lg" />
        )}
        <div className="profile-name">
          <h1>{player.name}</h1>
          {own && user?.phone && <span className="muted">+{user.phone.replace(/^\+/, "")}</span>}
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="stats">
        <div className="stat"><span className="stat-value">{finished.length}</span><span className="stat-label">Jugadas</span></div>
        <div className="stat"><span className="stat-value">{wins}</span><span className="stat-label">Ganadas</span></div>
        <div className="stat"><span className="stat-value">{winrate}%</span><span className="stat-label">Victorias</span></div>
      </div>

      <div className="profile-tabs" role="tablist">
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-label={label}
            title={label}
            className={`profile-tab${tab === id ? " profile-tab-active" : ""}`}
            onClick={() => setTab(id)}
          >
            <Icon />
          </button>
        ))}
      </div>

      {tab === "options" && (options ?? (
        <>
          <ClubInvites player={player} />
          <p className="empty">Pronto vas a poder desafiar a este jugador o arreglar un partido desde acá.</p>
        </>
      ))}

      {tab === "history" && (
      <section className="section">
        {myMatches.length === 0 ? (
          <p className="empty">Todavía no jugó ninguna partida.</p>
        ) : (
          <>
            <ul className="list">
              {shown.map((m) => <MatchRow key={m.id} match={m} nameOf={nameOf} me={playerId} />)}
            </ul>
            {myMatches.length > RECENT && !showAll && (
              <button type="button" className="link-btn" onClick={() => setShowAll(true)}>
                Ver las {myMatches.length}
              </button>
            )}
          </>
        )}
      </section>
      )}

      {tab === "clips" && (
      <section className="section">
        {clips === null ? (
          <p className="loading">Cargando clips…</p>
        ) : (
          <ClipList
            clips={clips}
            canDownload={!!plan?.can_download}
            canReport={!!user && !user.is_anonymous && !own}
            emptyText={own ? "Todavía no tenés clips. Se guardan desde el control de la partida." : "Todavía no tiene clips guardados."}
          />
        )}
      </section>
      )}

      {canDelete && (
        <button type="button" className="btn btn-danger btn-small profile-delete" onClick={handleDelete}>
          Borrar jugador
        </button>
      )}
    </>
  );
}

export default function PerfilJugador() {
  const { id } = useParams();
  return (
    <div className="page">
      <Link to="/buscar" className="muted">← Buscar</Link>
      <PlayerProfile playerId={id} />
    </div>
  );
}
