// Publicar y despublicar un clip (Fase 4, ROADMAP 6.9 paso 3). La app no puede
// escribir la tabla clips (solo la lee): el cambio lo hace esta función con la
// service key, después de revisar quién lo pide.
//
// POST /api/clips/publish  (Authorization: Bearer <access token de Supabase>)
//   { clipId, publish: true | false }  → { is_public, can_publish, can_unpublish }
//   (los dos últimos le dicen a la app qué botón mostrar después del cambio)
//
// Publicar: quien guardó el clip, con cuenta real y un plan con can_publish;
// el clip tiene que estar listo y sin vencer. No hace falta el OK del rival.
// Despublicar: quien lo guardó, cualquiera de los dos jugadores, la gente del
// club de la mesa y el admin, sin importar el plan. Si lo despublica alguien
// que no lo guardó, queda trabado (publish_blocked_by) y su dueño no lo puede
// volver a publicar: así el rival no tiene que despublicarlo una y otra vez.
import {
  CLIP_SELECT,
  HttpError,
  canPublish,
  canUnpublish,
  canView,
  planOf,
  readBody,
  serviceAndUser,
  viewerOf,
  withErrors,
} from "../_lib/clips.js";

// Recién publicado: quien lo publicó (su dueño) lo puede despublicar
const PUBLISHED = { is_public: true, can_publish: false, can_unpublish: true };

export default withErrors(async function publish(req, res) {
  const { supabase, user } = await serviceAndUser(req);

  const { clipId, publish } = readBody(req);
  if (typeof clipId !== "string" || typeof publish !== "boolean") throw new HttpError(400, "bad request");

  const viewer = await viewerOf(supabase, user);

  const { data: clip, error } = await supabase.from("clips").select(CLIP_SELECT).eq("id", clipId).maybeSingle();
  if (error) throw error;
  if (!clip || !canView(viewer, clip)) throw new HttpError(404, "No se encontró el clip");

  if (publish) {
    if (clip.is_public) return res.status(200).json(PUBLISHED);
    if (!canPublish(viewer, clip)) throw new HttpError(403, "Solo quien guardó el clip lo puede publicar");
    if (clip.status !== "ready" || clip.expired_at) throw new HttpError(409, "El clip no está disponible");
    if (clip.publish_blocked_by) throw new HttpError(403, "Uno de los jugadores lo despublicó");
    if (!(await planOf(supabase, user.id))?.can_publish) throw new HttpError(403, "Tu plan no permite publicar");

    const { error: updErr } = await supabase
      .from("clips")
      .update({ is_public: true, published_at: new Date().toISOString() })
      .eq("id", clip.id);
    if (updErr) throw updErr;
    return res.status(200).json(PUBLISHED);
  }

  // Después de despublicar, su dueño lo puede volver a publicar si su plan lo permite
  const owner = canPublish(viewer, clip);
  const unpublished = async (blocked) => ({
    is_public: false,
    can_publish:
      owner && !blocked && clip.status === "ready" && !clip.expired_at && !!(await planOf(supabase, user.id))?.can_publish,
    can_unpublish: false,
  });

  if (!clip.is_public) return res.status(200).json(await unpublished(clip.publish_blocked_by));
  if (!canUnpublish(viewer, clip)) throw new HttpError(403, "No podés despublicar este clip");

  const blockedBy = clip.owner_id === viewer.uid ? null : viewer.uid;
  const { error: updErr } = await supabase
    .from("clips")
    .update({ is_public: false, published_at: null, publish_blocked_by: blockedBy })
    .eq("id", clip.id);
  if (updErr) throw updErr;
  return res.status(200).json(await unpublished(blockedBy));
});
