// Datos de un clip público para la página /c/:id (Fase 4, ROADMAP 6.9 paso 4).
// No pide sesión: es lo que ve quien abre un link compartido.
//
// GET /api/clips/public?id=<clip>  → { clip: { player1, player2, club, table, created_at,
//                                              duration_sec, video_url, thumbnail_url } }
//                                    404 si no existe, no es público, no está listo o venció.
// Los links del video y la miniatura vencen en 1 hora. Sin botón ni link de descarga.
import { CLIPS_BUCKET, HttpError, publicClip, serviceClient, withErrors } from "../_lib/clips.js";

const VIEW_URL_SEC = 60 * 60;

export default withErrors(async function publicClipData(req, res) {
  if (req.method !== "GET") throw new HttpError(405, "method not allowed");

  const supabase = serviceClient();
  const clip = await publicClip(supabase, req.query.id);
  if (!clip) throw new HttpError(404, "Este clip no está disponible");

  const paths = [clip.videoPath, clip.thumbPath].filter(Boolean);
  const { data, error } = await supabase.storage.from(CLIPS_BUCKET).createSignedUrls(paths, VIEW_URL_SEC);
  if (error) throw error;
  const signed = new Map((data ?? []).filter((d) => d.signedUrl && !d.error).map((d) => [d.path, d.signedUrl]));
  if (!signed.get(clip.videoPath)) throw new HttpError(404, "Este clip no está disponible");

  const { videoPath, thumbPath, ...shown } = clip;
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    clip: { ...shown, video_url: signed.get(videoPath), thumbnail_url: signed.get(thumbPath) ?? null },
  });
});
