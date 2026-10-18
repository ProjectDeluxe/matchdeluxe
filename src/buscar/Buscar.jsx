import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { usePlayers } from "../context/PlayerContext";
import { useAuth } from "../context/AuthContext";
import { getClubs } from "../services/ClubService";
import { SearchIcon, ChevronIcon } from "../components/Icons.jsx";
import Avatar from "../components/Avatar.jsx";
import "./Buscar.css";

// Sin mayúsculas ni tildes, para que "martin" encuentre a "Martín"
function normalize(text) {
  return (text ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// Buscar jugadores y clubs en un solo lugar. Reemplaza a la pantalla de
// Jugadores y a la lupa de la barra.
export default function Buscar() {
  const { players, loading } = usePlayers();
  const { account } = useAuth();
  const [text, setText] = useState("");
  const [tab, setTab] = useState("players"); // "players" | "clubs"
  const [clubs, setClubs] = useState(null); // null = cargando

  useEffect(() => {
    getClubs().then(setClubs).catch(() => setClubs([]));
  }, []);

  // Desde la Fase 3 solo el admin y las cuentas de club cargan jugadores;
  // cada jugador con cuenta crea el suyo desde el inicio.
  const canCreate = !!account?.is_admin || (account?.clubs ?? []).length > 0;

  const q = normalize(text.trim());
  const foundPlayers = players.filter((p) => normalize(p.name).includes(q));
  const foundClubs = (clubs ?? []).filter((c) => normalize(`${c.name} ${c.address ?? ""}`).includes(q));
  const clubName = (id) => (clubs ?? []).find((c) => c.id === id)?.name;

  return (
    <div className="page">
      <h1>Buscar</h1>

      <label className="search-box">
        <SearchIcon />
        <input
          type="search"
          placeholder={tab === "players" ? "Buscar jugador" : "Buscar club"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Buscar"
        />
      </label>

      <div className="page-head">
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "players"} className={`tab${tab === "players" ? " tab-active" : ""}`} onClick={() => setTab("players")}>
            Jugadores
          </button>
          <button type="button" role="tab" aria-selected={tab === "clubs"} className={`tab${tab === "clubs" ? " tab-active" : ""}`} onClick={() => setTab("clubs")}>
            Clubs
          </button>
        </div>
        {tab === "players" && canCreate && (
          <Link className="btn btn-secondary btn-small" to="/jugadores/nuevo">+ Crear jugador</Link>
        )}
      </div>

      {tab === "players" ? (
        loading ? (
          <p className="loading">Cargando jugadores…</p>
        ) : foundPlayers.length === 0 ? (
          <p className="empty">Nadie con ese nombre.</p>
        ) : (
          <ul className="list">
            {foundPlayers.map((p) => (
              <li key={p.id}>
                <Link className="list-row" to={`/jugadores/${p.id}`}>
                  <Avatar src={p.avatar_url} name={p.name} />
                  <span className="list-row-main">
                    <span className="list-row-title">{p.name}</span>
                    {p.club_id && clubName(p.club_id) && <span className="list-row-sub">{clubName(p.club_id)}</span>}
                  </span>
                  <span className="muted"><ChevronIcon /></span>
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : clubs === null ? (
        <p className="loading">Cargando clubs…</p>
      ) : foundClubs.length === 0 ? (
        <p className="empty">{clubs.length === 0 ? "Todavía no hay clubs." : "Ningún club con ese nombre."}</p>
      ) : (
        <ul className="list">
          {foundClubs.map((c) => (
            <li key={c.id}>
              <Link className="list-row" to={`/club/${c.id}`}>
                <Avatar name={c.name} />
                <span className="list-row-main">
                  <span className="list-row-title">{c.name}</span>
                  <span className="list-row-sub">
                    {[c.address, `${c.tables?.length ?? 0} ${c.tables?.length === 1 ? "mesa" : "mesas"}`].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="muted"><ChevronIcon /></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
