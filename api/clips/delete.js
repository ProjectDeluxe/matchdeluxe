// Eliminar un clip (ROADMAP 6.13). La app no puede escribir la tabla clips ni
// el bucket: lo hace esta función con la service key, después de revisar quién
// lo pide.
//
// POST /api/clips/delete  (Authorization: Bearer <access token de Supabase>)
//   { clipId }  → { deleted: true }
//
// Elimina la gente del club de la mesa y el admin (decidido con Agus). Los
// jugadores, incluido quien lo guardó, solo lo publican o despublican.
// Se borran el video y la miniatura del bucket, y después la fila (los
// reportes del clip se van en cascada).
import {
  CLIPS_BUCKET,
  CLIP_SELECT,
  HttpError,
  canDelete,
  readBody,
  serviceAndUser,
  thumbPath,
  videoPath,
  viewerOf,
  withErrors,
} from "../_lib/clips.js";

export default withErrors(async function deleteClip(req, res) {
  const { supabase, user } = await serviceAndUser(req);

  const { clipId } = readBody(req);
  if (typeof clipId !== "string") throw new HttpError(400, "bad request");

  const viewer = await viewerOf(supabase, user);

  const { data: clip, error } = await supabase.from("clips").select(CLIP_SELECT).eq("id", clipId).maybeSingle();
  if (error) throw error;
  if (!clip) return res.status(200).json({ deleted: true });
  if (!canDelete(viewer, clip)) throw new HttpError(403, "Solo el club o el admin pueden eliminar un clip");

  const paths = [videoPath(clip), thumbPath(clip)].filter(Boolean);
  if (paths.length > 0) {
    const { error: rmErr } = await supabase.storage.from(CLIPS_BUCKET).remove(paths);
    if (rmErr) throw rmErr;
  }

  const { error: delErr } = await supabase.from("clips").delete().eq("id", clip.id);
  if (delErr) throw delErr;
  return res.status(200).json({ deleted: true });
});
