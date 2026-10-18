// Reportar un clip público (Fase 4, ROADMAP 6.9 paso 5). Es lo mínimo antes de
// abrir el feed: guarda el reporte y nada más. El admin los revisa desde el SQL
// Editor (tabla clip_reports); la moderación de verdad queda para la Fase 5.
//
// POST /api/clips/report  (Authorization: Bearer <access token de Supabase>)
//   { clipId, reason? }  → { reported: true } o { already: true } si ya lo había reportado
import { CLIP_SELECT, HttpError, canView, readBody, serviceAndUser, viewerOf, withErrors } from "../_lib/clips.js";

const MAX_REASON = 300;

export default withErrors(async function report(req, res) {
  const { supabase, user } = await serviceAndUser(req);
  if (user.is_anonymous) throw new HttpError(403, "Creá tu cuenta para reportar");

  const { clipId, reason } = readBody(req);
  if (typeof clipId !== "string") throw new HttpError(400, "bad request");
  const text = typeof reason === "string" ? reason.trim().slice(0, MAX_REASON) || null : null;

  const viewer = await viewerOf(supabase, user);
  const { data: clip, error } = await supabase.from("clips").select(CLIP_SELECT).eq("id", clipId).maybeSingle();
  if (error) throw error;
  if (!clip || !canView(viewer, clip)) throw new HttpError(404, "No se encontró el clip");

  const { error: insErr } = await supabase
    .from("clip_reports")
    .insert({ clip_id: clip.id, reporter_id: user.id, reason: text });
  if (insErr?.code === "23505") return res.status(200).json({ already: true });
  if (insErr) throw insErr;
  return res.status(200).json({ reported: true });
});
