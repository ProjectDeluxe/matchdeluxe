import { supabase } from "../supabaseClient";

const CLIP_SELECT = `
  *,
  player1:players!player1_id(id, name, avatar_url),
  player2:players!player2_id(id, name, avatar_url),
  table:tables!table_id(id, label, club:clubs(id, name))
`;

// El bucket 'clips' es privado (Fase 4): para ver un video o su miniatura
// la app pide links firmados que vencen en 1 hora.
const CLIPS_BUCKET = "clips";
const SIGNED_URL_SEC = 60 * 60;
const SIGN_BATCH = 100;

// Ruta dentro del bucket a partir de la URL pública que guarda el agente
// (lo que viene después de /object/public/clips/). La fila trae storage_path
// solo para el video; para la miniatura esta es la única referencia.
function pathFromPublicUrl(url) {
  const marker = `/object/public/${CLIPS_BUCKET}/`;
  const i = url ? url.indexOf(marker) : -1;
  return i === -1 ? null : decodeURI(url.slice(i + marker.length).split("?")[0]);
}

// Reemplaza video_url y thumbnail_url de cada clip por links firmados,
// con una sola llamada al storage por cada SIGN_BATCH archivos.
async function withSignedUrls(clips) {
  const refs = clips.map((c) =>
    c.status === "ready" && !c.expired_at
      ? { video: c.storage_path || pathFromPublicUrl(c.video_url), thumb: pathFromPublicUrl(c.thumbnail_url) }
      : { video: null, thumb: null }
  );

  const paths = [...new Set(refs.flatMap((r) => [r.video, r.thumb]).filter(Boolean))];
  const signed = new Map();
  for (let i = 0; i < paths.length; i += SIGN_BATCH) {
    const { data, error } = await supabase.storage
      .from(CLIPS_BUCKET)
      .createSignedUrls(paths.slice(i, i + SIGN_BATCH), SIGNED_URL_SEC);
    if (error) throw error;
    for (const d of data ?? []) if (d.signedUrl && !d.error) signed.set(d.path, d.signedUrl);
  }

  return clips.map((c, i) => ({
    ...c,
    video_url: signed.get(refs[i].video) ?? null,
    thumbnail_url: signed.get(refs[i].thumb) ?? null,
  }));
}

// Todos los clips, del más nuevo al más viejo (pantalla Clips & Replays)
export async function getClips() {
  const { data, error } = await supabase
    .from("clips")
    .select(CLIP_SELECT)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return withSignedUrls(data ?? []);
}

// Clips donde jugó un jugador (perfil)
export async function getClipsByPlayer(playerId) {
  const { data, error } = await supabase
    .from("clips")
    .select(CLIP_SELECT)
    .or(`player1_id.eq.${playerId},player2_id.eq.${playerId}`)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return withSignedUrls(data ?? []);
}
