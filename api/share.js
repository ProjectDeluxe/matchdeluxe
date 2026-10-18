// Página /c/:id con vista previa para WhatsApp y otras redes (Fase 4, ROADMAP 6.9
// paso 4). Los que arman la vista previa no corren JavaScript, así que vercel.json
// manda /c/:id acá: esta función toma el index.html de la app, le agrega las
// etiquetas og:* del clip y lo devuelve. En el navegador la app arranca igual
// que siempre y muestra la página del clip (src/clips/ClipPublico.jsx).
//
// El index.html se pide al mismo deploy (https://<host>/index.html) en vez de
// incluirlo en la función: lo genera `vite build` con los nombres de los
// archivos de cada deploy, y así siempre es el que corresponde.
import { publicClip, serviceClient } from "./_lib/clips.js";

const APP_NAME = "PoolAppDeluxe";

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function metaTags({ title, description, image, url }) {
  const tags = [
    ["property", "og:site_name", APP_NAME],
    ["property", "og:title", title],
    ["property", "og:description", description],
    ["property", "og:image", image],
    ["property", "og:url", url],
    ["property", "og:type", "video.other"],
    ["name", "twitter:card", "summary_large_image"],
    ["name", "twitter:title", title],
    ["name", "twitter:description", description],
    ["name", "twitter:image", image],
    ["name", "description", description],
  ];
  return tags.map(([attr, key, value]) => `<meta ${attr}="${key}" content="${escapeHtml(value)}" />`).join("\n    ");
}

export default async function share(req, res) {
  const host = req.headers["x-forwarded-host"] ?? req.headers.host;
  const origin = `https://${host}`;
  const id = req.query.id;

  let preview = {
    title: APP_NAME,
    description: "Clips de pool en vivo, guardados desde la mesa.",
    image: `${origin}/og-default.jpg`,
    url: `${origin}/c/${encodeURIComponent(id ?? "")}`,
  };

  try {
    const clip = await publicClip(serviceClient(), id);
    if (clip) {
      const where = [clip.club, clip.table].filter(Boolean).join(" · ");
      const date = new Date(clip.created_at).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
      preview = {
        ...preview,
        title: `${clip.player1} vs ${clip.player2}`,
        description: [where, date, clip.duration_sec && `${clip.duration_sec} s`, APP_NAME].filter(Boolean).join(" · "),
        image: clip.thumbPath ? `${origin}/api/clips/thumb?id=${clip.id}` : preview.image,
      };
    }
  } catch {
    // Sin datos del clip: va la vista previa genérica, la página igual carga
  }

  const tags = metaTags(preview);
  let html;
  try {
    const page = await fetch(`${origin}/index.html`);
    if (!page.ok) throw new Error(`index.html ${page.status}`);
    html = (await page.text())
      .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(preview.title)}</title>`)
      .replace("</head>", `    ${tags}\n  </head>`);
  } catch {
    // Si no se pudo leer la app, al menos la vista previa y un link al clip
    html = `<!doctype html><html lang="es"><head><meta charset="UTF-8" /><title>${escapeHtml(preview.title)}</title>
    ${tags}</head><body><a href="${escapeHtml(preview.url)}">Ver el clip en ${APP_NAME}</a></body></html>`;
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300");
  return res.status(200).send(html);
}
