import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { usePlan } from "../plan/usePlan";
import { getFeed } from "../services/ClipService";
import ClipList from "./ClipList.jsx";
import "./Clips.css";

// Feed de clips públicos (Fase 4, paso 5): lo publicado por todos, del más
// nuevo al más viejo, con filtro por club. Solo con cuenta real.
export default function Feed() {
  const { user } = useAuth();
  const { plan } = usePlan();
  const [clips, setClips] = useState([]);
  const [clubs, setClubs] = useState([]);
  const [clubId, setClubId] = useState("");
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const guest = !!user?.is_anonymous;

  const load = useCallback(
    async (more) => {
      setLoading(true);
      setError(null);
      try {
        const page = await getFeed({ cursor: more ? cursor : null, clubId: clubId || null });
        setClips((prev) => (more ? [...prev, ...page.clips] : page.clips));
        setClubs(page.clubs);
        setCursor(page.next_cursor);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    },
    [cursor, clubId]
  );

  // Primera página, y otra vez cada vez que cambia el filtro
  useEffect(() => {
    if (!guest) load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId, guest]);

  if (guest) {
    return (
      <div className="page-content clips-page">
        <h2>Feed</h2>
        <p className="clips-empty">
          Creá tu cuenta para ver el feed. <Link to="/login">Entrar con tu celu</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="page-content clips-page">
      <h2>Feed</h2>

      {clubs.length > 0 && (
        <select className="feed-filter" value={clubId} onChange={(e) => setClubId(e.target.value)}>
          <option value="">Todos los clubs</option>
          {clubs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}

      {error && <p className="clips-error">{error}</p>}
      {!error && (clips.length > 0 || !loading) && (
        <ClipList
          key={clubId}
          clips={clips}
          canDownload={!!plan?.can_download}
          canReport
          emptyText="Todavía no hay clips publicados."
        />
      )}
      {loading && <p className="clips-empty">Cargando clips...</p>}
      {!loading && cursor && (
        <button type="button" className="btn feed-more" onClick={() => load(true)}>
          Cargar más
        </button>
      )}
    </div>
  );
}
