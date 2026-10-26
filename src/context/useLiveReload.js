import { useEffect, useRef } from "react";
import { supabase } from "../supabaseClient";

const POLL_MS = 60_000;
let channelSeq = 0;

// Mantiene una lista al día sin cerrar y abrir la app (ROADMAP 6.18):
// 1) Realtime: si cambia alguna de las tablas, recarga (junta los cambios seguidos en uno).
//    Con `patch`, un UPDATE se aplica sobre la fila que ya está en pantalla sin volver a pedir todo
//    (así los puntos de una partida en curso no recargan la lista entera).
// 2) Al volver a la app o cuando vuelve internet, recarga: el celu corta la conexión en segundo plano.
// 3) Respaldo: cada 60 s mientras la app está en pantalla, por si se cae Realtime.
export function useLiveReload(tables, reload, { enabled = true, patch = null } = {}) {
  const reloadRef = useRef(reload);
  const patchRef = useRef(patch);
  useEffect(() => {
    reloadRef.current = reload;
    patchRef.current = patch;
  });

  const key = tables.join(",");

  useEffect(() => {
    if (!enabled) return;
    let timer = null;
    const run = () => Promise.resolve(reloadRef.current()).catch(() => {});
    const schedule = (ms = 1500) => {
      clearTimeout(timer);
      timer = setTimeout(run, ms);
    };
    const onChange = (payload) => {
      if (payload.eventType === "UPDATE" && patchRef.current) patchRef.current(payload.new);
      else schedule();
    };

    const channel = supabase.channel(`live-${key}-${++channelSeq}`);
    key.split(",").forEach((table) =>
      channel.on("postgres_changes", { event: "*", schema: "public", table }, onChange)
    );
    channel.subscribe();

    const onVisible = () => {
      if (document.visibilityState === "visible") schedule(300);
    };
    const onOnline = () => schedule(300);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") run();
    }, POLL_MS);

    return () => {
      clearTimeout(timer);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      supabase.removeChannel(channel);
    };
  }, [key, enabled]);
}
