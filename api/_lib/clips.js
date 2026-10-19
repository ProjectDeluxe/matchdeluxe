/* global process */
// Lógica compartida por las funciones de clips (api/clips/*). Vercel no
// publica como función nada de una carpeta que empieza con "_".
//
// Variables de entorno en Vercel, SIN el prefijo VITE_:
//   SUPABASE_URL          misma URL que VITE_SUPABASE_URL
//   SUPABASE_SERVICE_KEY  service role key (secreta)
import { createClient } from "@supabase/supabase-js";

export const CLIPS_BUCKET = "clips";

export const CLIP_SELECT = `
  id, status, expired_at, storage_path, video_url, thumbnail_url,
  owner_id, club_id, player1_id, player2_id, is_public, publish_blocked_by,
  match:matches(player1_id, player2_id, club_id),
  table:tables!table_id(club_id)
`;

// Error con código HTTP: el handler lo devuelve tal cual como { error }.
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Envuelve un handler: cualquier error vuelve como JSON, así la app muestra
// el motivo y no un 500 sin detalle.
export function withErrors(fn) {
  return async function handler(req, res) {
    try {
      return await fn(req, res);
    } catch (e) {
      return res.status(e instanceof HttpError ? e.status : 500).json({ error: e.message });
    }
  };
}

// Cliente con la service key
export function serviceClient() {
  const missing = ["SUPABASE_URL", "SUPABASE_SERVICE_KEY"].filter((name) => !process.env[name]);
  if (missing.length > 0) throw new HttpError(500, `Falta ${missing.join(" y ")} en Vercel`);

  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

// Cliente con la service key y el usuario de la sesión (Authorization: Bearer <token>).
export async function serviceAndUser(req) {
  if (req.method !== "POST") throw new HttpError(405, "method not allowed");

  const jwt = (req.headers.authorization ?? "").replace(/^Bearer /, "");
  if (!jwt) throw new HttpError(401, "unauthorized");

  const supabase = serviceClient();

  const { data: auth, error } = await supabase.auth.getUser(jwt);
  if (error || !auth?.user) throw new HttpError(401, "unauthorized");
  return { supabase, user: auth.user };
}

export function readBody(req) {
  try {
    return typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};
  } catch {
    throw new HttpError(400, "bad request");
  }
}

// Plan vigente del usuario (la misma función que usa la base para los límites)
export async function planOf(supabase, uid) {
  const { data, error } = await supabase.rpc("plan_for_user", { uid });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) ?? null;
}

// Lo que hace falta saber del usuario para decidir qué puede hacer con cada clip
export async function viewerOf(supabase, user) {
  const [profile, player, members] = await Promise.all([
    supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle(),
    supabase.from("players").select("id").eq("user_id", user.id).maybeSingle(),
    supabase.from("club_members").select("club_id").eq("user_id", user.id),
  ]);
  const error = profile.error ?? player.error ?? members.error;
  if (error) throw error;
  return {
    uid: user.id,
    isAnonymous: !!user.is_anonymous,
    isAdmin: !!profile.data?.is_admin,
    playerId: player.data?.id ?? null,
    clubIds: new Set((members.data ?? []).map((m) => m.club_id)),
  };
}

// Jugó la partida del clip
export function isPlayerOf(viewer, clip) {
  const players = [clip.player1_id, clip.player2_id, clip.match?.player1_id, clip.match?.player2_id];
  return !!viewer.playerId && players.includes(viewer.playerId);
}

// Es gente del club de la mesa donde se jugó
export function isClubStaffOf(viewer, clip) {
  const clubId = clip.table?.club_id ?? clip.match?.club_id ?? clip.club_id;
  return !!clubId && viewer.clubIds.has(clubId);
}

// Ver un clip: los jugadores, quien lo guardó, el club y el admin; un clip
// público, cualquiera con sesión (invitados incluidos).
export function canView(viewer, clip) {
  return (
    clip.is_public ||
    viewer.isAdmin ||
    clip.owner_id === viewer.uid ||
    isPlayerOf(viewer, clip) ||
    isClubStaffOf(viewer, clip)
  );
}

// Publicar (además del plan, que se revisa aparte): quien lo guardó, con cuenta real.
export function canPublish(viewer, clip) {
  return !viewer.isAnonymous && clip.owner_id === viewer.uid;
}

// Despublicar: quien lo guardó, los jugadores, el club y el admin, sin importar el plan.
export function canUnpublish(viewer, clip) {
  return (
    viewer.isAdmin ||
    clip.owner_id === viewer.uid ||
    isPlayerOf(viewer, clip) ||
    isClubStaffOf(viewer, clip)
  );
}

// Eliminar: solo la gente del club de la mesa y el admin. Los jugadores lo
// publican o despublican, pero no lo borran.
export function canDelete(viewer, clip) {
  return viewer.isAdmin || isClubStaffOf(viewer, clip);
}

// Ruta dentro del bucket a partir de la URL pública que guarda el agente
// (lo que viene después de /object/public/clips/).
export function pathFromPublicUrl(url) {
  const marker = `/object/public/${CLIPS_BUCKET}/`;
  const i = url ? url.indexOf(marker) : -1;
  return i === -1 ? null : decodeURI(url.slice(i + marker.length).split("?")[0]);
}

// El agente sube `<match>/<clip>.mp4` y la miniatura al lado, `.jpg`, pero solo
// guarda la ruta del video. Sin miniatura en la fila no se firma ninguna.
export function thumbPath(clip) {
  if (!clip.thumbnail_url) return null;
  return pathFromPublicUrl(clip.thumbnail_url) ?? clip.storage_path?.replace(/\.mp4$/, ".jpg") ?? null;
}

export function videoPath(clip) {
  return clip.storage_path || pathFromPublicUrl(clip.video_url);
}

// Clip público para la página /c/:id, la vista previa y la miniatura (paso 4).
// Devuelve null si no existe, no es público, no está listo o venció, así quien
// tenga el link de un clip despublicado no ve nada. Solo los datos que se
// muestran: nada de ids de usuarios ni de jugadores.
const PUBLIC_SELECT = `
  id, status, expired_at, is_public, storage_path, video_url, thumbnail_url, duration_sec, created_at,
  player1:players!player1_id(name),
  player2:players!player2_id(name),
  table:tables!table_id(label, club:clubs(name))
`;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function publicClip(supabase, id) {
  if (typeof id !== "string" || !UUID_RE.test(id)) return null;
  const { data: clip, error } = await supabase.from("clips").select(PUBLIC_SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!clip || !clip.is_public || clip.status !== "ready" || clip.expired_at) return null;
  return {
    id: clip.id,
    player1: clip.player1?.name ?? "Jugador 1",
    player2: clip.player2?.name ?? "Jugador 2",
    club: clip.table?.club?.name ?? null,
    table: clip.table?.label ?? null,
    created_at: clip.created_at,
    duration_sec: clip.duration_sec,
    videoPath: videoPath(clip),
    thumbPath: thumbPath(clip),
  };
}
