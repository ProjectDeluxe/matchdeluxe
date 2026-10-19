// Links firmados de los clips (Fase 4, ROADMAP 6.9 paso 2). El bucket 'clips'
// no tiene políticas para la app: los links para ver y para descargar los
// firma esta función con la service key, después de revisar la sesión, quién
// puede ver cada clip y, para descargar, el plan del usuario.
//
// POST /api/clips/sign  (Authorization: Bearer <access token de Supabase>)
//   { clipIds: [...] }                    → { clips: { <id>: { video_url, thumbnail_url, can_publish, can_unpublish, can_delete } } }
//                                           (solo los clips que el usuario puede ver; los
//                                           links son null si el clip no está listo o venció)
//   { clipIds: [<id>], download: true }   → { download_url }
//
// Quién ve un clip: los dos jugadores de la partida (el jugador con user_id del
// usuario), quien lo guardó, la gente del club de la mesa (club_members) y el
// admin; un clip público, cualquiera con sesión (paso 3). Descargar además exige
// una cuenta real (no invitado) con un plan con can_download.
// can_publish / can_unpublish le dicen a la app qué botón mostrar (paso 3);
// la decisión de verdad la toma api/clips/publish.js. can_delete, el botón
// Eliminar (api/clips/delete.js).
//
// Ojo: `npm run dev` (Vite) no sirve las funciones de api/; para probar
// en local hace falta `vercel dev`, o probar en producción.
import {
  CLIPS_BUCKET,
  CLIP_SELECT,
  HttpError,
  canPublish,
  canUnpublish,
  canDelete,
  canView,
  planOf,
  readBody,
  serviceAndUser,
  thumbPath,
  videoPath,
  viewerOf,
  withErrors,
} from "../_lib/clips.js";

const VIEW_URL_SEC = 60 * 60;
const DOWNLOAD_URL_SEC = 5 * 60;
const MAX_CLIPS = 200;

export default withErrors(async function sign(req, res) {
  const { supabase, user } = await serviceAndUser(req);

  const body = readBody(req);
  const download = body.download === true;
  const clipIds = Array.isArray(body.clipIds) ? [...new Set(body.clipIds.filter((id) => typeof id === "string"))] : [];
  if (clipIds.length === 0 || clipIds.length > MAX_CLIPS || (download && clipIds.length !== 1)) {
    throw new HttpError(400, "bad request");
  }

  const plan = user.is_anonymous ? null : await planOf(supabase, user.id);
  if (download && !plan?.can_download) throw new HttpError(403, "download not allowed");

  const viewer = await viewerOf(supabase, user);

  const { data: clips, error } = await supabase.from("clips").select(CLIP_SELECT).in("id", clipIds);
  if (error) throw error;

  const refs = clips
    .filter((c) => canView(viewer, c))
    .map((c) => {
      const playable = c.status === "ready" && !c.expired_at;
      return {
        id: c.id,
        video: playable ? videoPath(c) : null,
        thumb: playable ? thumbPath(c) : null,
        can_publish: playable && !c.is_public && !c.publish_blocked_by && !!plan?.can_publish && canPublish(viewer, c),
        can_unpublish: !!c.is_public && canUnpublish(viewer, c),
        can_delete: canDelete(viewer, c),
      };
    });

  const bucket = supabase.storage.from(CLIPS_BUCKET);

  if (download) {
    const video = refs[0]?.video;
    if (!video) throw new HttpError(404, "not found");
    const { data, error: signErr } = await bucket.createSignedUrl(video, DOWNLOAD_URL_SEC, { download: true });
    if (signErr) throw signErr;
    return res.status(200).json({ download_url: data.signedUrl });
  }

  const paths = [...new Set(refs.flatMap((r) => [r.video, r.thumb]).filter(Boolean))];
  const signed = new Map();
  if (paths.length > 0) {
    const { data, error: signErr } = await bucket.createSignedUrls(paths, VIEW_URL_SEC);
    if (signErr) throw signErr;
    for (const d of data ?? []) if (d.signedUrl && !d.error) signed.set(d.path, d.signedUrl);
  }

  const result = {};
  for (const r of refs) {
    result[r.id] = {
      video_url: signed.get(r.video) ?? null,
      thumbnail_url: signed.get(r.thumb) ?? null,
      can_publish: r.can_publish,
      can_unpublish: r.can_unpublish,
      can_delete: r.can_delete,
    };
  }
  return res.status(200).json({ clips: result });
});
