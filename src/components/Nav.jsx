import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { HomeIcon, SearchIcon, PlusIcon, ClubIcon, UserIcon } from "./Icons.jsx";
import "./Nav.css";

// Navegación principal: barra abajo en el celu, lateral con texto en la PC.
// Inicio es el feed de clips.
// "Mi club" aparece solo si la cuenta maneja algún club (o es admin); si no,
// crear un club queda en Perfil > Opciones.
export default function Nav() {
  const { account } = useAuth();
  const managesClub = !!account?.is_admin || (account?.clubs ?? []).length > 0;

  const items = [
    { to: "/", label: "Inicio", Icon: HomeIcon, end: true },
    { to: "/buscar", label: "Buscar", Icon: SearchIcon },
    { to: "/partida", label: "Partida", Icon: PlusIcon },
    managesClub && { to: "/clubs", label: "Mi club", Icon: ClubIcon },
    { to: "/perfil", label: "Perfil", Icon: UserIcon },
  ].filter(Boolean);

  return (
    <nav className="nav" aria-label="Principal">
      <span className="nav-logo">MatchDeluxe</span>
      <ul className="nav-list" style={{ "--nav-items": items.length }}>
        {items.map((item) => (
          <li key={item.to}>
            <NavLink to={item.to} end={item.end} className={({ isActive }) => `nav-item${isActive ? " nav-item-active" : ""}`}>
              <item.Icon />
              <span>{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
