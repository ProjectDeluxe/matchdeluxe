import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { usePlan } from "../plan/usePlan";
import { getClips } from "../services/ClipService";
import ClipList from "./ClipList.jsx";
import "./Clips.css";

// Inicio: todos los clips que el usuario puede ver (los de sus partidas, los de
// su club y los públicos), del más nuevo al más viejo, en una columna. Reemplaza
// a las pantallas separadas de Clips y Feed.
export default function Feed() {
  const { user, account } = useAuth();
  const { plan } = usePlan();
  const [clips, setClips] = useState(null); // null = cargando
  const [error, setError] = useState(null);
  const [onlyMine, setOnlyMine] = useState(false);

  useEffect(() => {
    getClips()
      .then(setClips)
      .catch((e) => {
        setError(e.message);
        setClips([]);
      });
  }, []);

  const myPlayerId = account?.player?.id;
  const isMine = (c) =>
    (!!user && c.owner_id === user.id) ||
    (!!myPlayerId && (c.player1?.id === myPlayerId || c.player2?.id === myPlayerId));
  const guest = !!user?.is_anonymous;
  const visible = onlyMine ? (clips ?? []).filter(isMine) : clips ?? [];

  return (
    <div className="page feed-page">
      <div className="page-head">
        <h1>Clips</h1>
        {!guest && (
          <div className="tabs" role="tablist">
            <button type="button" role="tab" aria-selected={!onlyMine} className={`tab${!onlyMine ? " tab-active" : ""}`} onClick={() => setOnlyMine(false)}>
              Todos
            </button>
            <button type="button" role="tab" aria-selected={onlyMine} className={`tab${onlyMine ? " tab-active" : ""}`} onClick={() => setOnlyMine(true)}>
              Míos
            </button>
          </div>
        )}
      </div>

      {error && <p className="error">{error}</p>}
      {clips === null ? (
        <p className="loading">Cargando clips…</p>
      ) : (
        <ClipList
          key={onlyMine ? "mine" : "all"}
          clips={visible}
          canDownload={!!plan?.can_download}
          canReport={!guest}
          isMine={isMine}
          emptyText={onlyMine ? "Todavía no tenés clips. Se guardan desde el control de la partida." : "Todavía no hay clips para ver."}
        />
      )}
    </div>
  );
}
