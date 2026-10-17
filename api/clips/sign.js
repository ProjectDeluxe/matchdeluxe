/* global process */
// Links firmados de los clips (Fase 4, ROADMAP 6.9 paso 2). El bucket 'clips'
// no tiene políticas para la app: los links para ver y para descargar los
// firma esta función con la service key, después de revisar la sesión, quién
// puede ver cada clip y, para descargar, el plan del usuario.
//
// POST /api/clips/sign  (Authorization: Bearer <access token de Supabase>)
//   { clipIds: [...] }                    → { clips: { <id>: { video_url, thumbnail_url } } }
//                                           (solo los clips que el usuario puede ver; los
//                                           links son null si el clip no está listo o venció)
//   { clipIds: [<id>], download: true }   → { download_url }
//
// Quién ve un clip: los dos jugadores de la partida (el jugador con user_id del
// usuario), quien lo guardó, la gente del club de la mesa (club_members) y el admin.
// Descargar además exige una cuenta real (no invitado) con un plan con can_download.
//
// Variables de entorno en Vercel, SIN el prefijo VITE_ (las mismas del job de borrado):
//   SUPABASE_URL          misma URL que VITE_SUPABASE_URL
//   SUPABASE_SERVICE_KEY  service role key (secreta)
//
// Ojo: `npm run dev` (Vite) no sirve las funciones de api/; para probar
// en local hace falta `vercel dev`, o probar en producción.
import { createClient } from "@supabase/supabase-js";

const CLIPS_BUCKET = "clips";
const VIEW_URL_SEC = 60 * 60;
const DOWNLOAD_URL_SEC = 5 * 60;
const MAX_CLIPS = 200;

const CLIP_SELECT = `
  id, status, expired_at, storage_path, video_url, thumbnail_url,
  owner_id, club_id, player1_id, player2_id,
  match:matches(player1_id, player2_id, club_id),
  table:tables!table_id(club_id)
`;

// Ruta dentro del bucket a partir de la URL pública que guarda el agente
// (lo que viene después de /object/public/clips/).
function pathFromPublicUrl(url) {
  const marker = `/object/public/${CLIPS_BUCKET}/`;
  const i = url ? url.indexOf(marker) : -1;
  return i === -1 ? null : decodeURI(url.slice(i + marker.length).split("?")[0]);
}

// El agente sube `<match>/<clip>.mp4` y la miniatura al lado, `.jpg`, pero solo
// guarda la ruta del video. Sin miniatura en la fila no se firma ninguna.
function thumbPath(clip) {
  if (!clip.thumbnail_url) return null;
  return pathFromPublicUrl(clip.thumbnail_url) ?? clip.storage_path?.replace(/\.mp4$/, ".jpg") ?? null;
}

// Lo que hace falta saber del usuario para decidir qué clips ve
async function viewerOf(supabase, uid) {
  const [profile, player, members] = await Promise.all([
    supabase.from("profiles").select("is_admin").eq("id", uid).maybeSingle(),
    supabase.from("players").select("id").eq("user_id", uid).maybeSingle(),
    supabase.from("club_members").select("club_id").eq("user_id", uid),
  ]);
  const error = profile.error ?? player.error ?? members.error;
  if (error) throw error;
  return {
    uid,
    isAdmin: !!profile.data?.is_admin,
    playerId: player.data?.id ?? null,
    clubIds: new Set((members.data ?? []).map((m) => m.club_id)),
  };
}

function canView(viewer, clip) {
  if (viewer.isAdmin || clip.owner_id === viewer.uid) return true;
  const players = [clip.player1_id, clip.player2_id, clip.match?.player1_id, clip.match?.player2_id];
  if (viewer.playerId && players.includes(viewer.playerId)) return true;
  const clubId = clip.table?.club_id ?? clip.match?.club_id ?? clip.club_id;
  return !!clubId && viewer.clubIds.has(clubId);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  const jwt = (req.headers.authorization ?? "").replace(/^Bearer /, "");
  if (!jwt) return res.status(401).json({ error: "unauthorized" });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const { data: auth, error: authErr } = await supabase.auth.getUser(jwt);
  const user = auth?.user;
  if (authErr || !user) return res.status(401).json({ error: "unauthorized" });

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};
  } catch {
    return res.status(400).json({ error: "bad request" });
  }
  const download = body.download === true;
  const clipIds = Array.isArray(body.clipIds) ? [...new Set(body.clipIds.filter((id) => typeof id === "string"))] : [];
  if (clipIds.length === 0 || clipIds.length > MAX_CLIPS || (download && clipIds.length !== 1)) {
    return res.status(400).json({ error: "bad request" });
  }

  if (download) {
    if (user.is_anonymous) return res.status(403).json({ error: "download not allowed" });
    const { data: plan, error: planErr } = await supabase.rpc("plan_for_user", { uid: user.id });
    if (planErr) return res.status(500).json({ error: planErr.message });
    if (!(Array.isArray(plan) ? plan[0] : plan)?.can_download) {
      return res.status(403).json({ error: "download not allowed" });
    }
  }

  let viewer;
  try {
    viewer = await viewerOf(supabase, user.id);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  const { data: clips, error } = await supabase.from("clips").select(CLIP_SELECT).in("id", clipIds);
  if (error) return res.status(500).json({ error: error.message });

  const visible = clips.filter((c) => canView(viewer, c));
  const refs = visible.map((c) =>
    c.status === "ready" && !c.expired_at
      ? { id: c.id, video: c.storage_path || pathFromPublicUrl(c.video_url), thumb: thumbPath(c) }
      : { id: c.id, video: null, thumb: null }
  );

  const bucket = supabase.storage.from(CLIPS_BUCKET);

  if (download) {
    const video = refs[0]?.video;
    if (!video) return res.status(404).json({ error: "not found" });
    const { data, error: signErr } = await bucket.createSignedUrl(video, DOWNLOAD_URL_SEC, { download: true });
    if (signErr) return res.status(500).json({ error: signErr.message });
    return res.status(200).json({ download_url: data.signedUrl });
  }

  const paths = [...new Set(refs.flatMap((r) => [r.video, r.thumb]).filter(Boolean))];
  const signed = new Map();
  if (paths.length > 0) {
    const { data, error: signErr } = await bucket.createSignedUrls(paths, VIEW_URL_SEC);
    if (signErr) return res.status(500).json({ error: signErr.message });
    for (const d of data ?? []) if (d.signedUrl && !d.error) signed.set(d.path, d.signedUrl);
  }

  const result = {};
  for (const r of refs) {
    result[r.id] = { video_url: signed.get(r.video) ?? null, thumbnail_url: signed.get(r.thumb) ?? null };
  }
  return res.status(200).json({ clips: result });
}
