// Miniatura estable de un clip público (Fase 4, ROADMAP 6.9 paso 4). La usa la
// vista previa de WhatsApp (og:image): los links firmados vencen, así que esta
// URL no cambia y redirige a un link firmado nuevo cada vez.
//
// GET /api/clips/thumb?id=<clip>  → 302 a la miniatura firmada (1 hora), o a la
//                                   imagen genérica si el clip no es público o no tiene.
import { CLIPS_BUCKET, publicClip, serviceClient } from "../_lib/clips.js";

const THUMB_URL_SEC = 60 * 60;
const FALLBACK = "/og-default.jpg";

export default async function thumb(req, res) {
  let location = FALLBACK;
  try {
    const supabase = serviceClient();
    const clip = await publicClip(supabase, req.query.id);
    if (clip?.thumbPath) {
      const { data } = await supabase.storage.from(CLIPS_BUCKET).createSignedUrl(clip.thumbPath, THUMB_URL_SEC);
      if (data?.signedUrl) location = data.signedUrl;
    }
  } catch {
    // Sin miniatura: la imagen genérica alcanza para la vista previa
  }
  // 5 minutos en la CDN de Vercel: menos que lo que dura el link firmado
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300");
  res.setHeader("Location", location);
  return res.status(302).end();
}
