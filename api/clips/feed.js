// Feed de clips públicos (Fase 4, ROADMAP 6.9 paso 5). Solo con cuenta real:
// los invitados no lo ven (decidido con Agus: el link de un clip se ve sin
// login, el feed solo con cuenta).
//
// POST /api/clips/feed  (Authorization: Bearer <access token de Supabase>)
//   { cursor?, clubId? }  → { clips: [...], next_cursor, clubs: [{ id, name }] }
// De a FEED_PAGE, del más nuevo al más viejo por published_at; next_cursor es el
// published_at del último (null si no hay más). clubs son los clubs que tienen
// clips públicos, para el filtro. Video y miniatura firmados por 1 hora.
import {
  CLIPS_BUCKET,
  HttpError,
  canUnpublish,
  readBody,
  serviceAndUser,
  thumbPath,
  videoPath,
  viewerOf,
  withErrors,
} from "../_lib/clips.js";

const FEED_PAGE = 20;
const VIEW_URL_SEC = 60 * 60;

const FEED_SELECT = `
  id, status, expired_at, expires_at, is_public, published_at, created_at, duration_sec,
  storage_path, video_url, thumbnail_url, owner_id, club_id, player1_id, player2_id,
  player1:players!player1_id(name),
  player2:players!player2_id(name),
  match:matches(player1_id, player2_id, club_id),
  table:tables!table_id!inner(label, club_id, club:clubs(id, name))
`;

function publicClips(supabase, select) {
  return supabase
    .from("clips")
    .select(select)
    .eq("is_public", true)
    .eq("status", "ready")
    .is("expired_at", null);
}

export default withErrors(async function feed(req, res) {
  const { supabase, user } = await serviceAndUser(req);
  if (user.is_anonymous) throw new HttpError(403, "Creá tu cuenta para ver el feed");

  const { cursor, clubId } = readBody(req);
  const viewer = await viewerOf(supabase, user);

  let query = publicClips(supabase, FEED_SELECT)
    .order("published_at", { ascending: false })
    .limit(FEED_PAGE + 1);
  if (typeof cursor === "string") query = query.lt("published_at", cursor);
  if (typeof clubId === "string") query = query.eq("table.club_id", clubId);

  const [page, clubRows] = await Promise.all([
    query,
    publicClips(supabase, "table:tables!table_id!inner(club:clubs(id, name))").limit(1000),
  ]);
  if (page.error) throw page.error;
  if (clubRows.error) throw clubRows.error;

  const rows = page.data.slice(0, FEED_PAGE);
  const paths = [...new Set(rows.flatMap((c) => [videoPath(c), thumbPath(c)]).filter(Boolean))];
  const signed = new Map();
  if (paths.length > 0) {
    const { data, error } = await supabase.storage.from(CLIPS_BUCKET).createSignedUrls(paths, VIEW_URL_SEC);
    if (error) throw error;
    for (const d of data ?? []) if (d.signedUrl && !d.error) signed.set(d.path, d.signedUrl);
  }

  // Lo mismo que muestra ClipList, sin ids de usuarios ni de jugadores
  const clips = rows.map((c) => ({
    id: c.id,
    status: c.status,
    expired_at: c.expired_at,
    expires_at: c.expires_at,
    is_public: true,
    created_at: c.created_at,
    duration_sec: c.duration_sec,
    player1: { name: c.player1?.name ?? null },
    player2: { name: c.player2?.name ?? null },
    table: { label: c.table?.label ?? null, club: { name: c.table?.club?.name ?? null } },
    video_url: signed.get(videoPath(c)) ?? null,
    thumbnail_url: signed.get(thumbPath(c)) ?? null,
    can_publish: false,
    can_unpublish: canUnpublish(viewer, c),
  }));

  const clubs = new Map();
  for (const r of clubRows.data ?? []) if (r.table?.club) clubs.set(r.table.club.id, r.table.club.name);

  return res.status(200).json({
    clips,
    next_cursor: page.data.length > FEED_PAGE ? rows[rows.length - 1].published_at : null,
    clubs: [...clubs].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
  });
});
