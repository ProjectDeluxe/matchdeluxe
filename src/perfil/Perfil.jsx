import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { usePlan } from "../plan/usePlan";
import { PlayerProfile } from "../jugadores/PerfilJugador.jsx";
import { ChevronIcon } from "../components/Icons.jsx";
import "./Perfil.css";

// Tu perfil (la cuenta con la que entraste) y, abajo, las opciones: club,
// suscripción y cerrar sesión. Reemplaza a los accesos 🏢, 💳, 📱 y ↩ de la barra.
export default function Perfil() {
  const { user, account, signOut } = useAuth();
  const { plan } = usePlan();
  const navigate = useNavigate();
  const guest = !!user?.is_anonymous;
  const clubs = account?.clubs ?? [];

  async function handleSignOut() {
    await signOut();
    navigate("/login");
  }

  const options = (
    <section className="section">
      <h2>Opciones</h2>
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
    </section>
  );

  return (
    <div className="page">
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

      {!account?.player && options}

    </div>
  );
}
