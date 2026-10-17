import { useState } from "react";
import { Link } from "react-router-dom";
import { getClipDownloadUrl } from "../services/ClipService";
import "./Clips.css";

function formatDate(iso) {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// El link de descarga lo firma el servidor recién al tocar el botón, después de revisar el plan.
function DownloadButton({ clipId }) {
  const [state, setState] = useState(null); // null | "loading" | mensaje de error

  async function download() {
    setState("loading");
    try {
      window.location.href = await getClipDownloadUrl(clipId);
      setState(null);
    } catch (e) {
      setState(e.status === 403 ? "Tu plan no permite descargar" : "No se pudo descargar");
    }
  }

  return (
    <>
      <button type="button" className="clip-download" onClick={download} disabled={state === "loading"}>
        {state === "loading" ? "Preparando…" : "⬇ Descargar"}
      </button>
      {state && state !== "loading" && <span className="clip-download-error">{state}</span>}
    </>
  );
}

// Grilla de clips guardados (la usan la pantalla Clips y el perfil del jugador).
// canDownload: el plan del usuario logueado permite descargar (Fase 3).
export default function ClipList({ clips, canDownload = false, emptyText = "Todavía no hay clips guardados." }) {
  if (clips.length === 0) return <p className="clips-empty">{emptyText}</p>;

  return (
    <ul className="clips-grid">
      {clips.map((c) => (
        <li key={c.id} className="clip-card">
          {c.expired_at ? (
            <div className="clip-placeholder clip-expired">Vencido</div>
          ) : c.status === "ready" && c.video_url ? (
            <video
              className="clip-video"
              src={c.video_url}
              poster={c.thumbnail_url ?? undefined}
              controls
              playsInline
              preload="none"
            />
          ) : (
            <div className={`clip-placeholder clip-${c.status}`}>
              {c.status === "error" ? "No se pudo guardar" : "Procesando…"}
            </div>
          )}

          <div className="clip-info">
            <span className="clip-players">
              {c.player1?.name ?? "Jugador 1"} vs {c.player2?.name ?? "Jugador 2"}
            </span>
            <span className="clip-meta">
              {[c.table && `${c.table.club?.name} · ${c.table.label}`, formatDate(c.created_at), c.duration_sec && `${c.duration_sec}s`]
                .filter(Boolean)
                .join(" · ")}
            </span>
            {c.expires_at && !c.expired_at && (
              <span className="clip-meta">Se borra el {new Date(c.expires_at).toLocaleDateString("es-AR")}</span>
            )}
            {c.status === "ready" && c.video_url && !c.expired_at && (
              canDownload ? (
                <DownloadButton clipId={c.id} />
              ) : (
                <Link className="clip-download clip-download-locked" to="/plan">
                  🔒 Descargar con un plan pago
                </Link>
              )
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
