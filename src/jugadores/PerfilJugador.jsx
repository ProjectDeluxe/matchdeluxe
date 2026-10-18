import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { usePlayers } from "../context/PlayerContext";
import { useMatches } from "../context/MatchContext";
import { uploadAvatar } from "../services/PlayerService";
import { getClipsByPlayer } from "../services/ClipService";
import ClipList from "../clips/ClipList.jsx";
import MatchRow from "../partidas/MatchRow.jsx";
import Avatar from "../components/Avatar.jsx";
import { usePlan } from "../plan/usePlan";
import { useAuth } from "../context/AuthContext";
import "./PerfilJugador.css";

const RECENT = 5;

// Perfil de un jugador: foto, estadísticas, últimas partidas y clips. Lo usan
// /jugadores/:id y tu propio perfil (/perfil).
// options: lo que va debajo de las estadísticas (las opciones de tu perfil).
export function PlayerProfile({ playerId, own = false, options = null }) {
  const { players, editPlayer, removePlayer } = usePlayers();
  const { matches } = useMatches();
  const { plan } = usePlan();
  const { user, account } = useAuth();
  const navigate = useNavigate();
  const [clips, setClips] = useState(null);
  const [showAll, setShowAll] = useState(false);
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
  const myMatches = matches.filter((m) => m.player1_id === playerId || m.player2_id === playerId);
  const finished = myMatches.filter((m) => m.status === "finished");
  const wins = finished.filter((m) => m.winner_id === playerId).length;
  const winrate = finished.length ? Math.round((wins / finished.length) * 100) : 0;
  const shown = showAll ? myMatches : myMatches.slice(0, RECENT);

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

      {options}

      <section className="section">
        <h2>Partidas</h2>
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

      <section className="section">
        <h2>Clips</h2>
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
