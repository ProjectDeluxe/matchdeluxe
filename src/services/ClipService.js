import { supabase } from "../supabaseClient";

const CLIP_SELECT = `
  *,
  player1:players!player1_id(id, name, avatar_url),
  player2:players!player2_id(id, name, avatar_url),
  table:tables!table_id(id, label, club:clubs(id, name))
`;

// El bucket 'clips' es privado (Fase 4) y la app no puede firmar links:
// los pide a api/clips/sign.js, que revisa la sesión y, para descargar, el plan.
// Los links para ver vencen en 1 hora; el de descarga, en 5 minutos.
const SIGN_BATCH = 200;

async function callSign(payload) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch("/api/clips/sign", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token ?? ""}`,
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error ?? `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

// Deja solo los clips que el usuario puede ver (los de sus partidas, los de
// su club, o todos si es admin; la función decide) y reemplaza video_url y
// thumbnail_url por links firmados. Una llamada por cada SIGN_BATCH clips.
async function withSignedUrls(clips) {
  const signed = {};
  for (let i = 0; i < clips.length; i += SIGN_BATCH) {
    const { clips: batch } = await callSign({ clipIds: clips.slice(i, i + SIGN_BATCH).map((c) => c.id) });
    Object.assign(signed, batch);
  }

  return clips
    .filter((c) => signed[c.id])
    .map((c) => ({ ...c, video_url: signed[c.id].video_url, thumbnail_url: signed[c.id].thumbnail_url }));
}

// Link para bajar un clip como archivo. La función lo niega (403) si el plan no permite descargar.
export async function getClipDownloadUrl(clipId) {
  const { download_url } = await callSign({ clipIds: [clipId], download: true });
  return download_url;
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
