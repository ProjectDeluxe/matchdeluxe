import { useState } from "react";
import { Link } from "react-router-dom";
import { getClipDownloadUrl, reportClip, setClipPublic } from "../services/ClipService";
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

// Publicar / despublicar (Fase 4, paso 3). La función del servidor decide si se
// puede; can_publish / can_unpublish solo dicen qué botón mostrar.
function PublishButton({ clip, onChange }) {
  const [state, setState] = useState(null); // null | "loading" | mensaje de error
  if (!clip.can_publish && !clip.can_unpublish) return null;
  const publish = !clip.is_public;

  async function toggle() {
    setState("loading");
    try {
      onChange(await setClipPublic(clip.id, publish));
      setState(null);
    } catch (e) {
      setState(e.message);
    }
  }

  return (
    <>
      <button type="button" className="clip-download clip-publish" onClick={toggle} disabled={state === "loading"}>
        {state === "loading" ? "Guardando…" : publish ? "🌐 Publicar" : "🔒 Despublicar"}
      </button>
      {state && state !== "loading" && <span className="clip-download-error">{state}</span>}
    </>
  );
}

// Compartir el link de un clip público (Fase 4, paso 4): el menú de compartir
// del celu si existe; si no, copia el link.
function ShareButton({ clipId }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/c/${clipId}`;

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ url });
      } catch {
        // cerró el menú sin compartir
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copiá el link del clip:", url);
    }
  }

  return (
    <button type="button" className="clip-download" onClick={share}>
      {copied ? "Link copiado" : "🔗 Compartir"}
    </button>
  );
}

// Reportar un clip público (Fase 4, paso 5). Solo guarda el reporte; el admin
// lo revisa a mano (la moderación queda para la Fase 5).
export function ReportButton({ clipId }) {
  const [state, setState] = useState(null); // null | "loading" | texto a mostrar

  async function report() {
    const reason = window.prompt("¿Por qué lo reportás? (opcional)");
    if (reason === null) return; // canceló
    setState("loading");
    try {
      const result = await reportClip(clipId, reason);
      setState(result.already ? "Ya lo reportaste" : "Reportado, gracias");
    } catch (e) {
      setState(e.message);
    }
  }

  if (state && state !== "loading") return <span className="clip-meta">{state}</span>;
  return (
    <button type="button" className="clip-download clip-report" onClick={report} disabled={state === "loading"}>
      🚩 Reportar
    </button>
  );
}

// Grilla de clips guardados (la usan la pantalla Clips y el perfil del jugador).
// canDownload: el plan del usuario logueado permite descargar (Fase 3).
// canReport: muestra Reportar en los clips públicos (el feed, Fase 4 paso 5).
export default function ClipList({ clips: initialClips, canDownload = false, canReport = false, emptyText = "Todavía no hay clips guardados." }) {
  // Cambios de publicar/despublicar hechos en esta pantalla, por id de clip
  const [changes, setChanges] = useState({});
  const clips = initialClips.map((c) => (changes[c.id] ? { ...c, ...changes[c.id] } : c));

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
              {c.is_public && <span className="clip-public-badge">Público</span>}
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
            {c.is_public && <ShareButton clipId={c.id} />}
            {canReport && c.is_public && <ReportButton clipId={c.id} />}
            <PublishButton clip={c} onChange={(change) => setChanges((prev) => ({ ...prev, [c.id]: change }))} />
          </div>
        </li>
      ))}
    </ul>
  );
}
