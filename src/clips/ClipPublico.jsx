import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ReportButton } from "./ClipList.jsx";
import "./Clips.css";

// Página pública de un clip (/c/:id), la que se abre desde un link compartido
// (Fase 4, paso 4). No pide login ni ofrece descarga. Los datos los da
// api/clips/public.js solo si el clip es público, está listo y no venció.
export default function ClipPublico() {
  const { id } = useParams();
  const { user } = useAuth();
  const [clip, setClip] = useState(undefined); // undefined = cargando, null = no disponible

  useEffect(() => {
    fetch(`/api/clips/public?id=${encodeURIComponent(id)}`)
      .then((res) => (res.ok ? res.json() : { clip: null }))
      .then((body) => setClip(body.clip ?? null))
      .catch(() => setClip(null));
  }, [id]);

  if (clip === undefined) return <p className="clips-empty">Cargando clip...</p>;

  return (
    <div className="page-content clip-public-page">
      {clip === null ? (
        <p className="clips-empty">Este clip no está disponible.</p>
      ) : (
        <div className="clip-card">
          <video
            className="clip-video"
            src={clip.video_url}
            poster={clip.thumbnail_url ?? undefined}
            controls
            playsInline
            preload="metadata"
            controlsList="nodownload"
          />
          <div className="clip-info">
            <span className="clip-players">
              {clip.player1} vs {clip.player2}
            </span>
            <span className="clip-meta">
              {[
                [clip.club, clip.table].filter(Boolean).join(" · "),
                new Date(clip.created_at).toLocaleDateString("es-AR"),
                clip.duration_sec && `${clip.duration_sec}s`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
            {/* Reportar pide cuenta real (Fase 4, paso 5) */}
            {user && !user.is_anonymous && <ReportButton clipId={id} />}
          </div>
        </div>
      )}
      <Link className="clip-download clip-public-app" to="/">
        Abrir PoolAppDeluxe
      </Link>
    </div>
  );
}
