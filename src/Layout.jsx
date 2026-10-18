import { useLocation } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Nav from "./components/Nav.jsx";
import MiJugador from "./cuenta/MiJugador.jsx";
import "./Layout.css";

// Pantallas sin barra: el login y las que se usan en la mesa (la de la PC con
// el QR y el control desde el celu), que van a pantalla completa.
const FULL_SCREEN = [/^\/login/, /^\/partida\/[^/]+(\/control)?$/];

export default function Layout({ children }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const showNav = !!user && !FULL_SCREEN.some((re) => re.test(pathname));

  return (
    <div className="app">
      {showNav && <Nav />}
      <main className={`app-main${showNav ? " with-nav" : ""}`}>
        {/* Primera vez con celu: crear o reclamar el jugador propio (Fase 3) */}
        <MiJugador />
        {children}
      </main>
    </div>
  );
}
