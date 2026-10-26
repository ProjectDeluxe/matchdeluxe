import { useState } from "react";
import { Link } from "react-router-dom";
import { deleteClip, getClipDownloadUrl, reportClip, setClipPublic } from "../services/ClipService";
import { DownloadIcon, FlagIcon, GlobeIcon, ShareIcon, TrashIcon } from "../components/Icons.jsx";
import "./Clips.css";

function timeAgo(iso) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d < 7) return `hace ${d} ${d === 1 ? "día" : "días"}`;
  return new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

function initial(name) {
  return (name ?? "?").trim().charAt(0).toUpperCase();
}

// Botón de acción de un clip: ícono + texto corto. Muestra el error abajo si lo hay.
function Action({ icon, label, onClick, disabled, to }) {
  if (to) {
    return (
      <Link className="clip-action" to={to}>
        {icon}
        <span>{label}</span>
      </Link>
    );
  }
  return (
    <button type="button" className="clip-action" onClick={onClick} disabled={disabled}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

// El link de descarga lo firma el servidor recién al tocar el botón, después de revisar el plan.
function DownloadButton({ clipId, onError }) {
  const [loading, setLoading] = useState(false);

  async function download() {
    setLoading(true);
    onError(null);
    try {
      window.location.href = await getClipDownloadUrl(clipId);
    } catch (e) {
      onError(e.status === 403 ? "Tu plan no permite descargar" : "No se pudo descargar");
    } finally {
      setLoading(false);
    }
  }

  return <Action icon={<DownloadIcon />} label={loading ? "Preparando…" : "Descargar"} onClick={download} disabled={loading} />;
}

// Publicar / despublicar (Fase 4, paso 3). La función del servidor decide si se
// puede; can_publish / can_unpublish solo dicen qué botón mostrar.
function PublishButton({ clip, onChange, onError }) {
  const [loading, setLoading] = useState(false);
  if (!clip.can_publish && !clip.can_unpublish) return null;
  const publish = !clip.is_public;

  async function toggle() {
    setLoading(true);
    onError(null);
    try {
      onChange(await setClipPublic(clip.id, publish));
    } catch (e) {
      onError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Action
      icon={<GlobeIcon />}
      label={loading ? "Guardando…" : publish ? "Publicar" : "Despublicar"}
      onClick={toggle}
      disabled={loading}
    />
  );
}

// Eliminar (solo el club o el admin; lo decide api/clips/delete.js). Borra el
// clip para todos, también el video.
function DeleteButton({ clip, onChange, onError }) {
  const [loading, setLoading] = useState(false);
  if (!clip.can_delete) return null;

  async function remove() {
    if (!window.confirm("¿Eliminar este clip? Se borra para los dos jugadores y no se puede recuperar.")) return;
    setLoading(true);
    onError(null);
    try {
      onChange(await deleteClip(clip.id));
    } catch (e) {
      onError(e.message);
      setLoading(false);
    }
  }

  return <Action icon={<TrashIcon />} label={loading ? "Eliminando…" : "Eliminar"} onClick={remove} disabled={loading} />;
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

  return <Action icon={<ShareIcon />} label={copied ? "Copiado" : "Compartir"} onClick={share} />;
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

  if (state && state !== "loading") return <span className="clip-action-note">{state}</span>;
  return <Action icon={<FlagIcon />} label="Reportar" onClick={report} disabled={state === "loading"} />;
}

// El video se baja recién cuando alguien toca play: hasta entonces solo se ve la
// miniatura. Así el feed no gasta descarga de Supabase por los clips que se pasan.
function ClipVideo({ clip }) {
  return (
    <video
      className="clip-video"
      src={clip.video_url}
      poster={clip.thumbnail_url ?? undefined}
      controls
      playsInline
      preload="none"
    />
  );
}

function ClipPost({ clip, canDownload, canReport, isMine, onChange }) {
  const [actionError, setActionError] = useState(null);
  const playable = clip.status === "ready" && clip.video_url && !clip.expired_at;
  const place = clip.table && [clip.table.club?.name, clip.table.label].filter(Boolean).join(" · ");

  return (
    <li className="clip-post">
      <div className="clip-head">
        <div className="clip-avatars" aria-hidden="true">
          {[clip.player1, clip.player2].map((p, i) =>
            p?.avatar_url ? (
              <img key={i} src={p.avatar_url} alt="" className="avatar clip-avatar" />
            ) : (
              <span key={i} className="avatar clip-avatar">{initial(p?.name)}</span>
            )
          )}
        </div>
        <div className="clip-head-text">
          <span className="clip-players">
            {clip.player1?.name ?? "Jugador 1"} <span className="muted">vs</span> {clip.player2?.name ?? "Jugador 2"}
          </span>
          <span className="clip-meta">{[place, timeAgo(clip.created_at)].filter(Boolean).join(" · ")}</span>
        </div>
        {clip.is_public && <span className="badge">Público</span>}
      </div>

      {clip.expired_at ? (
        <div className="clip-placeholder">Este clip venció</div>
      ) : playable ? (
        <ClipVideo clip={clip} />
      ) : (
        <div className={`clip-placeholder${clip.status === "error" ? " clip-placeholder-error" : ""}`}>
          {clip.status === "error" ? "No se pudo guardar" : "Procesando…"}
        </div>
      )}

      <div className="clip-actions">
        {clip.is_public && <ShareButton clipId={clip.id} />}
        {playable &&
          (canDownload ? (
            <DownloadButton clipId={clip.id} onError={setActionError} />
          ) : (
            <Action icon={<DownloadIcon />} label="Descargar" to="/plan" />
          ))}
        <PublishButton clip={clip} onChange={onChange} onError={setActionError} />
        <DeleteButton clip={clip} onChange={onChange} onError={setActionError} />
        {canReport && clip.is_public && !isMine && <ReportButton clipId={clip.id} />}
      </div>

      {(actionError || (clip.expires_at && !clip.expired_at) || clip.duration_sec) && (
        <div className="clip-foot">
          {actionError && <span className="error">{actionError}</span>}
          {clip.duration_sec && <span>{clip.duration_sec}s</span>}
          {clip.expires_at && !clip.expired_at && (
            <span>Se borra el {new Date(clip.expires_at).toLocaleDateString("es-AR")}</span>
          )}
        </div>
      )}
    </li>
  );
}

// Clips en una columna, del más nuevo al más viejo (el feed de Inicio, el
// perfil del jugador y la página de un club).
// canDownload: el plan del usuario logueado permite descargar (Fase 3).
// canReport: muestra Reportar en los clips públicos que no son tuyos (Fase 4 paso 5).
// isMine(clip): si el clip es del usuario logueado.
export default function ClipList({
  clips: initialClips,
  canDownload = false,
  canReport = false,
  isMine = () => false,
  emptyText = "Todavía no hay clips guardados.",
}) {
  // Cambios de publicar/despublicar/eliminar hechos en esta pantalla, por id de clip
  const [changes, setChanges] = useState({});
  const clips = initialClips
    .map((c) => (changes[c.id] ? { ...c, ...changes[c.id] } : c))
    .filter((c) => !c.deleted);

  if (clips.length === 0) return <p className="empty">{emptyText}</p>;

  return (
    <ul className="clip-feed">
      {clips.map((c) => (
        <ClipPost
          key={c.id}
          clip={c}
          canDownload={canDownload}
          canReport={canReport}
          isMine={isMine(c)}
          onChange={(change) => setChanges((prev) => ({ ...prev, [c.id]: change }))}
        />
      ))}
    </ul>
  );
}
