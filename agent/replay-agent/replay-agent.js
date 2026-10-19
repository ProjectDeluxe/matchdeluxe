// Agente de repetición — corre en la PC que tiene la cámara y OBS conectados a la mesa.
//
// Qué hace:
//   1. Escucha en Supabase Realtime la tabla `realtime_commands`.
//   2. Cuando el celu inserta un comando `mark_moment` (botón 20s/40s/1min del control),
//      le pide a OBS por WebSocket que guarde el Replay Buffer.
//   3. Se queda con los últimos N segundos pedidos: en modo "obs" carga el
//      archivo que guardó OBS y salta al final; en modo "navegador" lo recorta con ffmpeg.
//   4. Muestra la tele conectada por HDMI a esta PC: la mesa en vivo todo el
//      tiempo y, cuando hay una repetición nueva, la pasa en esa misma pantalla
//      y vuelve sola al vivo. Dos formas (TELE_MODO en el .env):
//      - "obs" (por defecto, lo más liviano): un proyector de OBS a pantalla
//        completa con una escena "MatchDeluxe Tele" que el agente arma solo. La
//        repetición es una fuente de video de OBS que se prende y se apaga.
//      - "navegador": una página local (replay-display.html) en Chrome que toma
//        el vivo de la cámara virtual de OBS. Más pesado: la PC dibuja el
//        video dos veces (OBS y Chrome).
//   5. Cuando llega un `save_clip` (botón "Guardar clip" del control), hace lo mismo
//      pero en vez de mostrarlo en la tele lo sube a Supabase Storage (bucket `clips`)
//      y crea la fila en la tabla `clips`, así aparece en el perfil de los jugadores.
//
// Si TABLE_ID está configurado en el .env, solo reacciona a partidas de esa mesa
// (para que dos mesas con su propio agente no se pisen).
//
// Ver README.md de esta carpeta para la puesta en marcha paso a paso.

require("dotenv").config();
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFile, spawn } = require("child_process");
const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const OBSWebSocket = require("obs-websocket-js").default;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const MATCH_ID = (process.env.MATCH_ID || "").trim();
const TABLE_ID = (process.env.TABLE_ID || "").trim();
const OBS_WS_URL = process.env.OBS_WS_URL || "ws://127.0.0.1:4455";
const OBS_WS_PASSWORD = process.env.OBS_WS_PASSWORD || undefined;
const PORT = Number(process.env.PORT || 5051);
// Cómo se muestra la tele: "obs" (proyector de OBS) o "navegador" (Chrome + cámara virtual)
const TV_MODE = (process.env.TELE_MODO || "obs").trim().toLowerCase() === "navegador" ? "browser" : "obs";
// Modo obs: escena con la cámara de la mesa (vacío = la que esté en el Programa
// al conectar) y pantalla del proyector (vacío = la última, la tele si hay dos).
const LIVE_SCENE = (process.env.ESCENA_MESA || "").trim();
const TV_MONITOR = (process.env.TELE_MONITOR || "").trim();
const TV_SCENE = "MatchDeluxe Tele";
const REPLAY_INPUT = "MatchDeluxe Repetición";
const REPLAY_LABEL = "MatchDeluxe Cartel repetición";
const LIVE_LABEL = "MatchDeluxe Cartel en vivo";
const REPLAYS_DIR = path.join(os.tmpdir(), "matchdeluxe-replays");
// Modo navegador: abrir la pantalla de la tele al arrancar (solo Windows). ABRIR_TELE=0 lo desactiva.
const OPEN_DISPLAY = (process.env.ABRIR_TELE || "1").trim() !== "0";
// Posición de la ventana de la tele, por ejemplo "1920,0" si la tele es la segunda pantalla.
const DISPLAY_POSITION = (process.env.TELE_POSICION || "").trim();

const PUBLIC_DIR = path.join(__dirname, "public");
const OUTPUT_FILE = path.join(PUBLIC_DIR, "replay-latest.mp4");
// Los clips a subir se arman en una carpeta temporal y se borran después de subirlos.
const CLIPS_TMP_DIR = path.join(os.tmpdir(), "matchdeluxe-clips");
const CLIPS_BUCKET = "clips";

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌ Falta SUPABASE_URL o SUPABASE_SERVICE_KEY en el archivo .env (copiá .env.example a .env y completalo).");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const obs = new OBSWebSocket();

let lastUpdate = 0;
// Pedidos esperando a que OBS termine de guardar el buffer, en orden de llegada.
// Cada uno: { kind: "replay" | "clip", seconds, clipId? }
const pending = [];

let obsConnected = false;

async function connectOBS() {
  try {
    await obs.connect(OBS_WS_URL, OBS_WS_PASSWORD);
    obsConnected = true;
    console.log("✅ Conectado a OBS WebSocket en", OBS_WS_URL);
    await ensureOBSOutputs();
    if (TV_MODE === "obs") {
      try {
        await setupObsTv();
      } catch (err) {
        console.error("⚠️  No pude armar la tele en OBS:", err.message);
      }
    }
  } catch (err) {
    obsConnected = false;
    console.error("❌ No se pudo conectar a OBS (¿está abierto? ¿activaste el WebSocket Server en Herramientas?):", err.message);
    console.log("   Reintentando en 5s...");
    setTimeout(connectOBS, 5000);
  }
}

// Si OBS se cierra o se reinicia, la conexión se cae — antes el agente se
// quedaba "pensando" que seguía conectado y cualquier botón de repetición
// fallaba con "Not connected" hasta reiniciar el agente a mano. Ahora, apenas
// se detecta el corte, reintenta solo cada 5s hasta reconectar.
obs.on("ConnectionClosed", () => {
  if (!obsConnected) return; // ya estábamos reintentando, no dupliques el loop
  obsConnected = false;
  console.log("⚠️  Se perdió la conexión con OBS (¿se cerró o reinició?). Reintentando en 5s...");
  setTimeout(connectOBS, 5000);
});

// La repetición necesita el Replay Buffer corriendo y, en modo navegador, el vivo
// de la tele toma la imagen de la cámara virtual de OBS. Si están apagados, se prenden solos.
async function ensureOBSOutputs() {
  try {
    const { outputActive } = await obs.call("GetReplayBufferStatus");
    if (!outputActive) {
      await obs.call("StartReplayBuffer");
      console.log("✅ Buffer de repetición iniciado");
    }
  } catch (err) {
    console.error("⚠️  No pude iniciar el buffer de repetición de OBS:", err.message);
    console.error("   Revisá: Configuración → Salida → pestaña 'Buffer de repetición' → activado.");
  }
  if (TV_MODE !== "browser") return;
  try {
    const { outputActive } = await obs.call("GetVirtualCamStatus");
    if (!outputActive) {
      await obs.call("StartVirtualCam");
      console.log("✅ Cámara virtual de OBS iniciada (la usa la tele para el vivo)");
    }
  } catch (err) {
    console.error("⚠️  No pude iniciar la cámara virtual de OBS, la tele no va a mostrar el vivo:", err.message);
    console.error("   Probá apretando 'Iniciar cámara virtual' en OBS (hace falta OBS 26.1 o más nuevo).");
  }
}

// ---------- Tele en modo obs ----------
// Escena "MatchDeluxe Tele" (de abajo hacia arriba): la escena de la mesa (el vivo),
// la repetición a pantalla completa y los dos carteles. Se muestra en un
// proyector de OBS a pantalla completa. La grabación sigue saliendo de la escena
// de la mesa, así que las repeticiones no quedan grabadas adentro de los clips.

async function sceneItemId(sourceName) {
  const { sceneItemId } = await obs.call("GetSceneItemId", { sceneName: TV_SCENE, sourceName });
  return sceneItemId;
}

async function setItemEnabled(sourceName, enabled) {
  await obs.call("SetSceneItemEnabled", {
    sceneName: TV_SCENE,
    sceneItemId: await sceneItemId(sourceName),
    sceneItemEnabled: enabled,
  });
}

async function setReplayVisible(visible) {
  await setItemEnabled(REPLAY_INPUT, visible);
  await setItemEnabled(REPLAY_LABEL, visible);
  await setItemEnabled(LIVE_LABEL, !visible);
}

// Crea la fuente si no existe y se asegura de que esté en la escena de la tele
async function ensureTvInput(inputName, inputKind, inputSettings, existingInputs, sceneSources) {
  if (!existingInputs.includes(inputName)) {
    await obs.call("CreateInput", { sceneName: TV_SCENE, inputName, inputKind, inputSettings, sceneItemEnabled: false });
  } else if (!sceneSources.includes(inputName)) {
    await obs.call("CreateSceneItem", { sceneName: TV_SCENE, sourceName: inputName, sceneItemEnabled: false });
  }
}

async function setupObsTv() {
  // Las versiones anteriores dejaban los recortes en esta carpeta; ya no se usa.
  try {
    fs.rmSync(REPLAYS_DIR, { recursive: true, force: true });
  } catch {
    // algún archivo en uso: no pasa nada, es una carpeta temporal
  }

  const { scenes, currentProgramSceneName } = await obs.call("GetSceneList");
  const sceneNames = scenes.map((sc) => sc.sceneName);
  const liveScene = LIVE_SCENE
    || (currentProgramSceneName !== TV_SCENE ? currentProgramSceneName : sceneNames.find((n) => n !== TV_SCENE));
  if (!liveScene || !sceneNames.includes(liveScene)) {
    throw new Error(`no encuentro la escena de la mesa "${liveScene || ""}" (revisá ESCENA_MESA en el .env)`);
  }
  if (!sceneNames.includes(TV_SCENE)) await obs.call("CreateScene", { sceneName: TV_SCENE });

  const { sceneItems } = await obs.call("GetSceneItemList", { sceneName: TV_SCENE });
  const sceneSources = sceneItems.map((i) => i.sourceName);
  const { inputs } = await obs.call("GetInputList");
  const inputNames = inputs.map((i) => i.inputName);

  // El vivo: la escena de la mesa adentro de la de la tele (comparten la cámara)
  if (!sceneSources.includes(liveScene)) {
    await obs.call("CreateSceneItem", { sceneName: TV_SCENE, sourceName: liveScene, sceneItemEnabled: true });
  }

  // La escena de la tele no está en el Programa, así que para OBS esta fuente
  // nunca queda "activa": con "cerrar cuando está inactiva" o "reiniciar al
  // activarse" no abriría el archivo. Se apagan las dos (también en una fuente
  // que ya existía de una versión anterior) y el video arranca al cargarlo.
  const replaySettings = { is_local_file: true, looping: false, restart_on_activate: false, close_when_inactive: false };
  await ensureTvInput(REPLAY_INPUT, "ffmpeg_source", { ...replaySettings, local_file: "" }, inputNames, sceneSources);
  await obs.call("SetInputSettings", { inputName: REPLAY_INPUT, inputSettings: replaySettings });

  const { inputKinds } = await obs.call("GetInputKindList");
  const textKind = inputKinds.find((k) => k.startsWith("text_gdiplus")) || inputKinds.find((k) => k.startsWith("text_ft2"));
  const { baseWidth, baseHeight } = await obs.call("GetVideoSettings");
  const fontSize = Math.round(baseHeight / 18);
  // Colores en formato de OBS (0xAABBGGRR): rojo #e53935 y negro semitransparente
  const label = (text, bg) => ({ text, font: { face: "Arial", size: fontSize, style: "Bold", flags: 1 }, color: 0xffffffff, bk_color: bg, bk_opacity: 85 });
  if (textKind) {
    await ensureTvInput(REPLAY_LABEL, textKind, label(" REPETICIÓN ", 0xff3539e5), inputNames, sceneSources);
    await ensureTvInput(LIVE_LABEL, textKind, label(" ● EN VIVO ", 0xff000000), inputNames, sceneSources);
  }

  // La repetición ocupa toda la pantalla; los carteles van arriba a la izquierda
  await obs.call("SetSceneItemTransform", {
    sceneName: TV_SCENE,
    sceneItemId: await sceneItemId(REPLAY_INPUT),
    sceneItemTransform: {
      positionX: 0, positionY: 0, alignment: 5,
      boundsType: "OBS_BOUNDS_SCALE_INNER", boundsAlignment: 0, boundsWidth: baseWidth, boundsHeight: baseHeight,
    },
  });
  if (textKind) {
    const margin = Math.round(baseHeight * 0.04);
    for (const name of [REPLAY_LABEL, LIVE_LABEL]) {
      await obs.call("SetSceneItemTransform", {
        sceneName: TV_SCENE,
        sceneItemId: await sceneItemId(name),
        sceneItemTransform: { positionX: margin, positionY: margin, alignment: 5 },
      });
    }
  }

  // El sonido de la repetición sale por los parlantes de la PC, sin entrar a la grabación
  try {
    await obs.call("SetInputAudioMonitorType", { inputName: REPLAY_INPUT, monitorType: "OBS_MONITORING_TYPE_MONITOR_ONLY" });
  } catch (err) {
    console.error("⚠️  No pude mandar el sonido de la repetición a los parlantes:", err.message);
  }

  if (textKind) await setReplayVisible(false);
  else await setItemEnabled(REPLAY_INPUT, false);

  const { monitors } = await obs.call("GetMonitorList");
  const monitorIndex = TV_MONITOR !== "" ? Number(TV_MONITOR) : (monitors.length ? monitors[monitors.length - 1].monitorIndex : 0);
  await obs.call("OpenSourceProjector", { sourceName: TV_SCENE, monitorIndex });
  console.log(`📺 Tele lista: proyector de OBS en la pantalla ${monitorIndex}, vivo de la escena "${liveScene}" (para cerrarlo: Esc).`);
}

let replayToken = 0;
// Archivo que se está mostrando en la tele (el que guardó OBS) y los que OBS
// guardó para repeticiones anteriores, que quedan por borrar.
let replayOnTv = null;
const oldReplayFiles = new Set();

// Cuánto esperar a que OBS abra el archivo y diga cuánto dura
const DURATION_WAIT_MS = 3000;
const DURATION_POLL_MS = 100;
// Tope para volver al vivo si no se pudo saltar y pasa el buffer entero
// (el buffer de la mesa es de ~65s, ver ROADMAP 6.5)
const FULL_BUFFER_FALLBACK_MS = 90 * 1000;

// Espera a que OBS sepa la duración del archivo cargado (o se acabe el tope, o
// llegue otra repetición). Devuelve la duración en ms, o null.
async function waitMediaDuration(token) {
  const until = Date.now() + DURATION_WAIT_MS;
  while (Date.now() < until && token === replayToken) {
    try {
      const { mediaDuration } = await obs.call("GetMediaInputStatus", { inputName: REPLAY_INPUT });
      if (mediaDuration > 0) return mediaDuration;
    } catch {
      // OBS todavía está abriendo el archivo
    }
    await new Promise((r) => setTimeout(r, DURATION_POLL_MS));
  }
  return null;
}

// Borra los archivos de repeticiones anteriores que guardó OBS (nunca el que
// está en la tele). Si OBS todavía tiene alguno abierto, queda para la próxima.
function deleteOldReplayFiles() {
  for (const old of oldReplayFiles) {
    if (old === replayOnTv) continue;
    try {
      fs.rmSync(old, { force: true });
      oldReplayFiles.delete(old);
    } catch {
      // archivo en uso
    }
  }
}

// Sin recorte: carga en la tele el archivo que guardó OBS tal cual y salta a
// los últimos N segundos. Recortarlo antes con ffmpeg (aunque sea copiando sin
// reprocesar) tardaba de 1 a 26 segundos en la PC de la mesa, según el disco.
async function showReplayInObs(savedPath, seconds) {
  const token = ++replayToken;
  const startedAt = Date.now();
  if (replayOnTv) oldReplayFiles.add(replayOnTv);

  try {
    await setReplayVisible(true);
    await obs.call("SetInputSettings", { inputName: REPLAY_INPUT, inputSettings: { local_file: savedPath } });
    await obs.call("TriggerMediaInputAction", { inputName: REPLAY_INPUT, mediaAction: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART" });
  } catch (err) {
    console.error("❌ No pude pasar la repetición en OBS:", err.message);
    oldReplayFiles.add(savedPath);
    return;
  }
  replayOnTv = savedPath;

  // Arranca desde el principio del buffer; apenas OBS sabe cuánto dura, salta
  // a los últimos N segundos (puede verse un instante el principio).
  const duration = await waitMediaDuration(token);
  if (token !== replayToken) return; // llegó otra repetición mientras tanto
  let backupMs;
  if (duration) {
    try {
      await obs.call("SetMediaInputCursor", { inputName: REPLAY_INPUT, mediaCursor: Math.max(0, duration - seconds * 1000) });
    } catch (err) {
      console.error("⚠️  No pude adelantar la repetición, pasa desde el principio:", err.message);
    }
    backupMs = (seconds + 5) * 1000;
    console.log(`✅ Repetición en la tele en ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
  } else {
    backupMs = FULL_BUFFER_FALLBACK_MS;
    console.log(`⚠️  OBS no dijo cuánto dura el video en ${DURATION_WAIT_MS / 1000}s: la repetición pasa desde el principio del buffer`);
  }

  // Por si OBS no avisa que terminó: vuelve al vivo un rato después del final
  setTimeout(() => {
    if (token === replayToken) setReplayVisible(false).catch(() => {});
  }, backupMs);

  deleteOldReplayFiles();
}

obs.on("MediaInputPlaybackEnded", ({ inputName }) => {
  if (TV_MODE === "obs" && inputName === REPLAY_INPUT) {
    replayToken++;
    setReplayVisible(false).catch((err) => console.error("⚠️  No pude volver al vivo:", err.message));
  }
});

// ---------- Tele en modo navegador ----------

// Busca Chrome o Edge en las carpetas de instalación habituales de Windows.
function findBrowser() {
  const roots = [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter(Boolean);
  const candidates = [];
  for (const root of roots) candidates.push(path.join(root, "Google", "Chrome", "Application", "chrome.exe"));
  for (const root of roots) candidates.push(path.join(root, "Microsoft", "Edge", "Application", "msedge.exe"));
  return candidates.find((p) => fs.existsSync(p));
}

// Abre la pantalla de la tele en pantalla completa, con un perfil de navegador
// propio para que los permisos de abajo valgan aunque haya otro Chrome abierto:
// autoplay con sonido para las repeticiones y permiso de cámara sin preguntar.
function openDisplay(url) {
  if (TV_MODE !== "browser" || !OPEN_DISPLAY || process.platform !== "win32") return;
  const browser = findBrowser();
  if (!browser) {
    console.log("ℹ️  No encontré Chrome ni Edge para abrir la tele solo; abrí la dirección de arriba a mano.");
    return;
  }
  const args = [
    "--kiosk",
    `--user-data-dir=${path.join(os.homedir(), "AppData", "Local", "MatchDeluxe", "tele")}`,
    "--autoplay-policy=no-user-gesture-required",
    "--use-fake-ui-for-media-stream",
    "--no-first-run",
  ];
  if (DISPLAY_POSITION) args.push(`--window-position=${DISPLAY_POSITION}`);
  args.push(url);
  spawn(browser, args, { detached: true, stdio: "ignore" }).unref();
  console.log("📺 Abrí la pantalla de la tele (para salir de la pantalla completa: Alt+F4).");
}

// ffmpeg corre con prioridad baja: si compite con OBS por la CPU, OBS empieza a
// descartar fotogramas y los clips salen entrecortados.
function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = execFile("ffmpeg", args, (err) => (err ? reject(err) : resolve()));
    try {
      os.setPriority(child.pid, os.constants.priority.PRIORITY_LOW);
    } catch {
      // Si no se puede bajar la prioridad, sigue igual.
    }
  });
}

function trimLastSeconds(inputPath, seconds, outputPath) {
  return new Promise((resolve, reject) => {
    // -sseof: arranca la lectura N segundos antes del final del archivo.
    //
    // OJO: antes usábamos "-c copy" (copiar el video tal cual, sin reprocesar).
    // Eso es rápido pero el corte solo puede empezar en un "keyframe" del video
    // original — si el punto de corte cae entre keyframes (lo más común), el
    // archivo resultante queda sin un keyframe inicial válido y la mayoría de
    // los reproductores (incluido el <video> del navegador) no muestran nada
    // de imagen hasta el próximo keyframe, aunque el audio sí se escucha bien
    // desde el principio. Por eso se oía el audio pero no se veía el video.
    //
    // La solución es reencodear el recorte (quitamos "-c copy" del video) para
    // que el clip arranque siempre con un keyframe propio. Con "ultrafast" el
    // reencode de 20-60s tarda nada más que un par de segundos en cualquier PC.
    execFile(
      "ffmpeg",
      [
        "-y",
        "-sseof", `-${seconds}`,
        "-i", inputPath,
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "23",
        "-c:a", "aac",
        outputPath,
      ],
      (err) => (err ? reject(err) : resolve())
    );
  });
}

// Recorte para un clip que se guarda al perfil. Primero se copia el video tal cual
// sale de OBS (sin recodificar): tarda menos de un segundo y casi no usa CPU, así
// OBS no pierde fotogramas mientras se procesa. Para que el corte arranque limpio,
// OBS tiene que grabar con intervalo de fotogramas clave de 1s. Si la copia pesa
// más de lo que acepta Storage (50 MB por defecto), se recodifica a 720p.
// "+faststart" hace que el navegador pueda empezar a reproducirlo sin bajarlo entero.
const CLIP_MAX_MB = 45;

async function trimClipForUpload(inputPath, seconds, outputPath) {
  await runFfmpeg([
    "-y",
    "-sseof", `-${seconds}`,
    "-i", inputPath,
    "-c", "copy",
    "-movflags", "+faststart",
    outputPath,
  ]);
  if (fs.statSync(outputPath).size / 1024 / 1024 <= CLIP_MAX_MB) return;

  console.log("⚠️  El clip pesa demasiado copiado tal cual, lo recodifico a 720p...");
  await runFfmpeg([
    "-y",
    "-sseof", `-${seconds}`,
    "-i", inputPath,
    "-vf", "scale=-2:720",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "26",
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    outputPath,
  ]);
}

function makeThumbnail(videoPath, outputPath) {
  return runFfmpeg(["-y", "-ss", "1", "-i", videoPath, "-frames:v", "1", "-vf", "scale=-2:360", outputPath]);
}

async function showReplay(savedPath, seconds) {
  try {
    await trimLastSeconds(savedPath, seconds, OUTPUT_FILE);
  } catch (err) {
    console.error("⚠️  No pude recortar con ffmpeg (¿está instalado y en el PATH?), muestro el buffer completo:", err.message);
    fs.copyFileSync(savedPath, OUTPUT_FILE);
  }

  lastUpdate = Date.now();
  console.log("✅ Repetición lista —", OUTPUT_FILE);

  // Acá la tele pasa el recorte, no el archivo de OBS: ese ya se puede borrar.
  oldReplayFiles.add(savedPath);
  deleteOldReplayFiles();
}

async function uploadClip(savedPath, seconds, clipId) {
  const videoFile = path.join(CLIPS_TMP_DIR, `${clipId}.mp4`);
  const thumbFile = path.join(CLIPS_TMP_DIR, `${clipId}.jpg`);

  try {
    await trimClipForUpload(savedPath, seconds, videoFile);

    const { data: clip, error: clipErr } = await supabase
      .from("clips")
      .select("match_id")
      .eq("id", clipId)
      .single();
    if (clipErr) throw clipErr;

    const basePath = `${clip.match_id}/${clipId}`;
    const videoPath = `${basePath}.mp4`;
    const sizeMb = (fs.statSync(videoFile).size / 1024 / 1024).toFixed(1);
    console.log(`⬆️  Subiendo clip (${sizeMb} MB)...`);

    const { error: upErr } = await supabase.storage
      .from(CLIPS_BUCKET)
      .upload(videoPath, fs.readFileSync(videoFile), { contentType: "video/mp4", upsert: true });
    if (upErr) throw upErr;
    const videoUrl = supabase.storage.from(CLIPS_BUCKET).getPublicUrl(videoPath).data.publicUrl;

    // La miniatura es un lujo: si falla, el clip igual queda guardado.
    let thumbnailUrl = null;
    try {
      await makeThumbnail(videoFile, thumbFile);
      const thumbPath = `${basePath}.jpg`;
      const { error: thErr } = await supabase.storage
        .from(CLIPS_BUCKET)
        .upload(thumbPath, fs.readFileSync(thumbFile), { contentType: "image/jpeg", upsert: true });
      if (thErr) throw thErr;
      thumbnailUrl = supabase.storage.from(CLIPS_BUCKET).getPublicUrl(thumbPath).data.publicUrl;
    } catch (err) {
      console.error("⚠️  No pude generar/subir la miniatura (el clip se guarda igual):", err.message);
    }

    const { error: updErr } = await supabase
      .from("clips")
      .update({ status: "ready", video_url: videoUrl, thumbnail_url: thumbnailUrl, storage_path: videoPath })
      .eq("id", clipId);
    if (updErr) throw updErr;

    console.log("✅ Clip guardado en el perfil —", videoUrl);
  } catch (err) {
    console.error("❌ No se pudo guardar el clip:", err.message);
    await supabase
      .from("clips")
      .update({ status: "error", error_message: String(err.message || err).slice(0, 500) })
      .eq("id", clipId);
  } finally {
    fs.rmSync(videoFile, { force: true });
    fs.rmSync(thumbFile, { force: true });
    // El archivo que guardó OBS para este clip ya no hace falta
    if (savedPath !== replayOnTv) {
      try {
        fs.rmSync(savedPath, { force: true });
      } catch (err) {
        console.error("⚠️  No pude borrar el archivo que guardó OBS para el clip:", err.message);
      }
    }
  }
}

let clipQueue = Promise.resolve();

obs.on("ReplayBufferSaved", async (data) => {
  const savedPath = data.savedReplayPath;
  const job = pending.shift() || { kind: "replay", seconds: 20 };
  const took = job.requestedAt ? ` (OBS tardó ${((Date.now() - job.requestedAt) / 1000).toFixed(1)}s en guardarlo)` : "";
  console.log(`🎬 OBS guardó el replay buffer en: ${savedPath} — ${job.kind === "clip" ? "clip" : "repetición"} de ${job.seconds}s${took}`);

  if (job.kind === "clip") {
    // Los clips se procesan de a uno, en fila. La repetición no espera a la fila.
    clipQueue = clipQueue.then(() => uploadClip(savedPath, job.seconds, job.clipId));
  } else if (TV_MODE === "obs") {
    await showReplayInObs(savedPath, job.seconds);
  } else {
    await showReplay(savedPath, job.seconds);
  }
});

// Cache match_id → datos de la partida (mesa y jugadores), para no consultar
// la base en cada botón.
const matchCache = new Map();

async function getMatch(matchId) {
  if (matchCache.has(matchId)) return matchCache.get(matchId);
  const { data, error } = await supabase
    .from("matches")
    .select("id, table_id, club_id, player1_id, player2_id")
    .eq("id", matchId)
    .single();
  if (error) throw error;
  matchCache.set(matchId, data);
  return data;
}

async function markProcessed(row) {
  const { error } = await supabase.from("realtime_commands").update({ processed: true }).eq("id", row.id);
  if (error) console.error("⚠️  No pude marcar el comando como procesado:", error.message);
}

async function requestBufferSave(job) {
  pending.push(job);
  try {
    await obs.call("SaveReplayBuffer");
    return true;
  } catch (err) {
    pending.splice(pending.indexOf(job), 1);
    console.error("❌ OBS no pudo guardar el Replay Buffer:", err.message);
    console.error("   Revisá: Configuración → Salida → pestaña 'Buffer de repetición' → activado.");
    return false;
  }
}

// Ids de comandos ya manejados: un pedido puede llegar dos veces, por Realtime
// y por la búsqueda de pedidos perdidos al reconectar (ver main).
const handledCommandIds = new Set();

async function handleCommand(row) {
  if (row.type !== "mark_moment" && row.type !== "save_clip") return;
  if (handledCommandIds.has(row.id)) return;
  handledCommandIds.add(row.id);
  if (handledCommandIds.size > 500) handledCommandIds.delete(handledCommandIds.values().next().value);
  if (MATCH_ID && row.match_id !== MATCH_ID) return;

  let match;
  try {
    match = await getMatch(row.match_id);
  } catch (err) {
    console.error("⚠️  No encontré la partida del comando:", row.match_id, err.message);
    return;
  }
  // Agente atado a una mesa: ignora las partidas de otras mesas (y las sueltas).
  if (TABLE_ID && match.table_id !== TABLE_ID) return;

  const seconds = (row.payload && row.payload.duration_sec) || 20;

  if (row.type === "mark_moment") {
    console.log(`📲 Pedido de repetición: ${seconds}s (partida ${row.match_id})`);
    await requestBufferSave({ kind: "replay", seconds, requestedAt: Date.now() });
    await markProcessed(row);
    return;
  }

  // save_clip: la fila se crea ya mismo en 'processing' para que el celu/perfil
  // vean que el clip está en camino; pasa a 'ready' o 'error' al terminar.
  console.log(`💾 Pedido de guardar clip: ${seconds}s (partida ${row.match_id})`);
  const { data: clip, error } = await supabase
    .from("clips")
    .insert({
      match_id: match.id,
      player1_id: match.player1_id,
      player2_id: match.player2_id,
      club_id: match.club_id,
      table_id: match.table_id,
      command_id: row.id,
      duration_sec: seconds,
      status: "processing",
    })
    .select("id")
    .single();
  if (error) {
    console.error("❌ No pude crear el clip en la base (¿corriste la migración de la Fase 2?):", error.message);
    return;
  }

  const ok = await requestBufferSave({ kind: "clip", seconds, clipId: clip.id });
  if (!ok) {
    await supabase.from("clips").update({ status: "error", error_message: "OBS no pudo guardar el Replay Buffer" }).eq("id", clip.id);
  }
  await markProcessed(row);
}

// Pedidos que llegaron mientras el canal de Realtime estaba caído (pasa a veces
// con CHANNEL_ERROR): al volver a SUBSCRIBED se buscan los de los últimos 30s
// que nadie procesó y se pasan en orden. Lo que ya se manejó no se repite.
const MISSED_COMMANDS_WINDOW_MS = 30 * 1000;

async function recoverMissedCommands() {
  const since = new Date(Date.now() - MISSED_COMMANDS_WINDOW_MS).toISOString();
  const { data, error } = await supabase
    .from("realtime_commands")
    .select("*")
    .in("type", ["mark_moment", "save_clip"])
    .eq("processed", false)
    .gte("created_at", since)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("⚠️  No pude buscar pedidos perdidos durante el corte de Realtime:", error.message);
    return;
  }
  const missed = data.filter((row) => !handledCommandIds.has(row.id));
  if (missed.length) console.log(`🔁 ${missed.length} pedido(s) llegaron durante el corte de Realtime, los paso ahora`);
  for (const row of missed) await handleCommand(row);
}

async function setTableStatus(status) {
  if (!TABLE_ID) return;
  const { error } = await supabase.from("tables").update({ status }).eq("id", TABLE_ID);
  if (error) console.error(`⚠️  No pude marcar la mesa como ${status}:`, error.message);
}

async function main() {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  fs.mkdirSync(CLIPS_TMP_DIR, { recursive: true });

  if (TABLE_ID) {
    const { data: table, error } = await supabase
      .from("tables")
      .select("label, club:clubs(name)")
      .eq("id", TABLE_ID)
      .single();
    if (error || !table) {
      console.error("❌ TABLE_ID del .env no corresponde a ninguna mesa (copialo de la pantalla Clubs y mesas de la app).");
      process.exit(1);
    }
    console.log(`🎱 Agente de la mesa: ${table.club?.name} · ${table.label}`);
    await setTableStatus("online");
  } else {
    console.log("🎱 Sin TABLE_ID: el agente reacciona a partidas de cualquier mesa.");
  }

  await connectOBS();

  supabase
    .channel("replay-agent")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "realtime_commands" },
      (payload) => handleCommand(payload.new)
    )
    .subscribe((status) => {
      console.log("Supabase Realtime:", status);
      if (status === "SUBSCRIBED") recoverMissedCommands();
    });

  const app = express();
  app.use(express.static(PUBLIC_DIR));
  app.get("/status", (req, res) => res.json({ lastUpdate }));
  const displayUrl = `http://localhost:${PORT}/replay-display.html`;
  app.listen(PORT, () => {
    if (TV_MODE !== "browser") return;
    console.log(`\n🖥  Pantalla de la tele (vivo + repeticiones):\n   ${displayUrl}\n`);
    openDisplay(displayUrl);
  });
}

// Al cerrar el agente (Ctrl+C o cerrar la ventana negra) la mesa vuelve a 'offline'.
// Si la PC se apaga de golpe queda 'online' hasta el próximo arranque: el
// monitoreo de verdad (devices.last_seen_at) es trabajo de la Fase 5.
async function shutdown() {
  await setTableStatus("offline");
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("SIGHUP", shutdown);

main();
