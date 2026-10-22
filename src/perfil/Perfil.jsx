import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { usePlan } from "../plan/usePlan";
import { getPlayerMemberships, acceptClubMembership, removeClubMembership } from "../services/ClubService";
import { PlayerProfile } from "../jugadores/PerfilJugador.jsx";
import { ChevronIcon } from "../components/Icons.jsx";
import "./Perfil.css";

// Tu perfil (la cuenta con la que entraste) y, en su pestaña, las opciones:
// club, suscripción y cerrar sesión. Reemplaza a los accesos 🏢, 💳, 📱 y ↩ de la barra.
// Invitaciones de clubs para aceptar o rechazar (ROADMAP 6.14). Un club no te
// suma sin que aceptes acá o en la página del club.
function ClubInvitations({ invitations, playerId, onChange }) {
  const [error, setError] = useState(null);

  async function run(action) {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e.message.replace(/^PLAN_LIMIT: /, ""));
    }
    onChange();
  }

  if (invitations.length === 0) return null;
  return (
    <section className="card card-soft">
      <h2>Te invitaron</h2>
      <ul className="list">
        {invitations.map((m) => (
          <li key={m.club_id} className="list-row">
            <span className="list-row-main">
              <span className="list-row-title">{m.club?.name ?? "Club"}</span>
              <span className="list-row-sub">Te invitó a ser socio</span>
            </span>
            <div className="row-actions">
              <button type="button" className="btn btn-small" onClick={() => run(() => acceptClubMembership(m.club_id, playerId))}>Aceptar</button>
              <button type="button" className="btn btn-secondary btn-small" onClick={() => run(() => removeClubMembership(m.club_id, playerId))}>Rechazar</button>
            </div>
          </li>
        ))}
      </ul>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

export default function Perfil() {
  const { user, account, signOut } = useAuth();
  const { plan } = usePlan();
  const navigate = useNavigate();
  const guest = !!user?.is_anonymous;
  const clubs = account?.clubs ?? [];
  const playerId = account?.player?.id;
  const [memberships, setMemberships] = useState([]);

  function loadMemberships() {
    if (!playerId) return;
    getPlayerMemberships(playerId).then(setMemberships).catch(() => setMemberships([]));
  }

  useEffect(loadMemberships, [playerId]);

  const invitations = memberships.filter((m) => m.status === "pending" && m.requested_by === "club");
  const socioDe = memberships.filter((m) => m.status === "active");

  async function handleSignOut() {
    await signOut();
    navigate("/login");
  }

  const options = (
    <ul className="list options">
        {!guest && (
          <li>
            <Link className="list-row" to="/clubs">
              <span className="list-row-main">
                <span className="list-row-title">{clubs.length > 0 || account?.is_admin ? "Mi club" : "Crear mi club"}</span>
                <span className="list-row-sub">
                  {clubs.length > 0 ? clubs.map((c) => c.name).join(", ") : "Cargá tus mesas y jugadores, y dale acceso a tu equipo"}
                </span>
              </span>
              <span className="muted"><ChevronIcon /></span>
            </Link>
          </li>
        )}
        {socioDe.map((m) => (
          <li key={m.club_id}>
            <Link className="list-row" to={`/club/${m.club_id}`}>
              <span className="list-row-main">
                <span className="list-row-title">{m.club?.name ?? "Club"}</span>
                <span className="list-row-sub">Sos socio</span>
              </span>
              <span className="muted"><ChevronIcon /></span>
            </Link>
          </li>
        ))}
        <li>
          <Link className="list-row" to="/plan">
            <span className="list-row-main">
              <span className="list-row-title">Suscripción</span>
              {plan && <span className="list-row-sub">Plan {plan.name}</span>}
            </span>
            <span className="muted"><ChevronIcon /></span>
          </Link>
        </li>
        <li>
          <button type="button" className="list-row option-danger" onClick={handleSignOut}>
            <span className="list-row-main">
              <span className="list-row-title">Cerrar sesión</span>
            </span>
          </button>
        </li>
    </ul>
  );

  return (
    <div className="page">
      {playerId && <ClubInvitations invitations={invitations} playerId={playerId} onChange={loadMemberships} />}
      {account?.player ? (
        <PlayerProfile playerId={account.player.id} own options={options} />
      ) : guest ? (
        <div className="card card-soft">
          <h1>Estás como invitado</h1>
          <p className="muted">Tus partidas no quedan en un perfil y no podés guardar clips. Entrá con tu celu para tener tu perfil.</p>
          <Link className="btn btn-block" to="/login">Entrar con mi celu</Link>
        </div>
      ) : (
        <h1>Perfil</h1>
      )}

      {!account?.player && (
        <section className="section">
          <h2>Opciones</h2>
          {options}
        </section>
      )}

    </div>
  );
}
