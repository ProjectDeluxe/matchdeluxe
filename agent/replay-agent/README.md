# Replay Agent — puesta en marcha (probar hoy)

Esto corre en la PC que tiene la cámara y OBS conectados a la mesa de pool — **no** en la misma compu que el resto del código de MatchDeluxe (a menos que sean la misma máquina).

## 1. Preparar OBS

1. Abrí OBS con la cámara de la mesa ya agregada como fuente en una escena.
2. **Activar el Replay Buffer:** Configuración → Salida → pestaña "Buffer de repetición". Activalo, y poné el "Tiempo máximo de repetición" en **65 segundos** (así cubre los tres botones — 20s/40s/1min — con margen). En la pestaña "Grabación" usá el codificador de hardware (QuickSync, NVENC o AMF), salida en 1280x720 a 30 fps e **intervalo de fotogramas clave en 1 s**: el agente corta los clips copiando el video sin recodificar y necesita un fotograma clave por segundo para que el corte arranque limpio. Aplicá.
3. No hace falta iniciar a mano el buffer: el agente lo prende solo al conectarse a OBS. Tampoco hace falta armar nada para la tele: el agente crea en OBS la escena "MatchDeluxe Tele" (ver paso 4). Dejá en el Programa la escena con la cámara de la mesa.
4. **Activar el WebSocket:** Herramientas → "WebSocket Server Settings" (o "Configuración del servidor WebSocket"). Activá el servidor. Anotá el puerto (por defecto `4455`) y, si le pusiste contraseña, anotala también — van al `.env`.

## 2. Preparar esta carpeta en esa PC

1. Necesitás [Node.js](https://nodejs.org) instalado en esa PC (cualquier versión reciente sirve).
2. Necesitás `ffmpeg` instalado y accesible desde la terminal (probá `ffmpeg -version`). En Windows, la forma más fácil es `winget install ffmpeg` desde PowerShell, o descargarlo de ffmpeg.org y agregarlo al PATH.
3. Copiá esta carpeta completa (`replay-agent/`) a esa PC — por USB, por red, como quieras.
4. Abrí una terminal en esa carpeta y corré:
   ```
   npm install
   ```
5. Copiá `.env.example` a `.env` y completalo:
   - `SUPABASE_URL` y `SUPABASE_SERVICE_KEY`: los sacás del dashboard de Supabase del proyecto de MatchDeluxe → Configuración → API. **Ojo:** es la `service_role` key (secreta), no la misma que usa la app. No la subas a git ni la compartas.
   - `OBS_WS_URL` / `OBS_WS_PASSWORD`: lo que anotaste en el paso 1.4 (si no le pusiste contraseña al WebSocket, dejá `OBS_WS_PASSWORD` vacío).
   - `TABLE_ID`: el ID de la mesa donde está esta PC. En la app, entrá a 🏢 Clubs y mesas y tocá "copiar ID" al lado de la mesa. Con esto el agente solo reacciona a partidas creadas en esa mesa y la mesa aparece como `online` mientras el agente corre. Dejalo vacío para probar en casa con cualquier partida.
   - `MATCH_ID`: dejalo vacío para probar con cualquier partida.

## 3. Correrlo

```
npm start
```

Si todo está bien vas a ver algo como:

```
✅ Conectado a OBS WebSocket en ws://127.0.0.1:4455
📺 Tele lista: proyector de OBS en la pantalla 1, vivo de la escena "Mesa" (para cerrarlo: Esc).
Supabase Realtime: SUBSCRIBED
```

## 4. La tele

La tele muestra la mesa **en vivo** todo el tiempo, con el cartel "● EN VIVO". Cuando alguien pide una repetición, la pasa ahí mismo con el cartel "REPETICIÓN" y, al terminar, vuelve sola al vivo.

Por defecto (`TELE_MODO=obs`) la tele es un **proyector de OBS a pantalla completa**, que el agente abre solo al conectarse. Muestra una escena "MatchDeluxe Tele" que el agente arma solo: adentro tiene la escena de la mesa (el vivo), una fuente de video para la repetición y los dos carteles. Es lo más liviano, porque OBS dibuja la imagen una sola vez. Lo que se graba sigue saliendo de la escena de la mesa, así que las repeticiones no quedan grabadas adentro de los clips.
- El proyector va a la última pantalla (la tele, si la PC tiene dos). Para elegir otra, poné su número en `TELE_MONITOR` (0 es la principal). Para cerrarlo: Esc.
- La escena de la mesa es la que esté en el Programa al arrancar el agente. Si querés fijarla, poné su nombre en `ESCENA_MESA`. **No pongas "MatchDeluxe Tele" en el Programa**: se grabarían las repeticiones.
- El sonido de la repetición sale por los parlantes de la PC (monitoreo de OBS), sin entrar a la grabación.

La otra opción (`TELE_MODO=navegador`) es la página `http://localhost:5051/replay-display.html` en Chrome, que toma el vivo de la cámara virtual de OBS y tiene una cortina animada entre el vivo y la repetición. Es bastante más pesada (la PC dibuja el video dos veces): en una notebook común traba OBS. En ese modo el agente prende solo la cámara virtual y abre Chrome a pantalla completa (`ABRIR_TELE=0` lo desactiva, `TELE_POSICION` lo manda a una segunda pantalla).

## 5. Probarlo desde el celu

1. Abrí una partida en MatchDeluxe, entrá al control desde el celu (como ya venís haciendo con el QR).
2. Tocá cualquiera de los tres botones de repetición (20s / 40s / 1min).
3. En la terminal donde corre `npm start` deberías ver los logs del pedido llegando y a OBS guardando el buffer.
4. En la tele, en unos segundos, el vivo corta a la repetición y después vuelve solo al vivo.

## 6. Guardar un clip en el perfil (Fase 2)

Además de la repetición en la tele, el control del celu tiene una segunda fila: **"Guardar clip en el perfil"** (20s / 40s / 1min).

1. Antes de la primera vez, hay que correr `supabase/migrations/2026-10-07-fase2-clips.sql` en el SQL Editor de Supabase (crea/actualiza la tabla `clips` y el bucket `clips`).
2. Tocá un botón de guardar. En la terminal vas a ver `💾 Pedido de guardar clip`, después `⬆️ Subiendo clip (N MB)` y `✅ Clip guardado en el perfil`.
3. El celu muestra "Guardando clip…" y pasa a "✓ Clip guardado en el perfil" cuando termina.
4. El clip aparece en 🎬 Clips & Replays y en el perfil de los dos jugadores de la partida, con botón para descargarlo.

El clip se sube en 720p y algo más comprimido que la repetición de la tele, para que 1 minuto entre holgado en el límite de 50 MB por archivo de Supabase.

## Si algo no funciona

- **"OBS no pudo guardar el Replay Buffer"** → el buffer no está activado en Configuración → Salida (paso 1.2), o el WebSocket está desactivado/con otro puerto o contraseña distinta a la del `.env`.
- **No se abre la tele / "No pude armar la tele en OBS"** → el error exacto está en la ventana negra. Lo más común: OBS tiene en el Programa una escena sin la cámara. Poné la escena de la mesa en el Programa (o su nombre en `ESCENA_MESA`) y reiniciá el agente.
- **OBS se traba** → que grabe con el chip de video y no con el procesador: Configuración → Salida → Codificador "QuickSync" (Intel), "NVENC" (NVIDIA) o "AMF" (AMD), salida en 1280x720 a 30 fps y la cámara en MJPEG. Para cambiar el codificador, cerrá antes el agente y detené el buffer (si no, aparece gris).
- **Modo navegador: la tele dice "No encuentro obs virtual camera"** → la cámara virtual de OBS no está prendida. El agente intenta prenderla solo; si en la ventana negra aparece "No pude iniciar la cámara virtual", apretá "Iniciar cámara virtual" en OBS.
- **Se conecta a Supabase pero nunca llega el comando** → revisá que el celu y esta PC compartan el mismo proyecto de Supabase (misma `SUPABASE_URL`), y que estés tocando el botón en la partida correcta.
- **"No pude crear el clip en la base"** → falta correr la migración de la Fase 2 (paso 6.1).
- **El agente arranca pero no reacciona a ningún botón** → si pusiste `TABLE_ID`, la partida tiene que estar creada en esa mesa (en "Nueva partida", elegí la mesa en vez de "Sin mesa"). Las partidas sueltas se ignoran cuando hay `TABLE_ID`.
- **El clip queda en "No se pudo guardar"** → el error exacto aparece en la terminal. Si dice algo de tamaño ("Payload too large"), bajá a 20s/40s o subí el límite de archivo en Supabase → Storage → Settings.
- **El video no se recorta bien / queda negro** → puede ser el formato de salida configurado en OBS para el Replay Buffer; probá poniéndolo en `.mp4` en Configuración → Salida → "Formato de grabación".
- **Nada de esto anda y necesitás probar rápido** → como fallback, mientras resolvemos algo puntual, siempre podés apretar el hotkey de "Guardar Replay Buffer" que OBS te deja configurar en Configuración → Atajos de teclado, sin pasar por el celu, solo para confirmar que OBS de por sí guarda bien el buffer.

## Por qué funciona con el celu en otra red (no solo por WiFi local)

El celu nunca le habla directo a esta PC. Inserta el pedido en Supabase (en la nube), y este agente lo escucha ahí, sin importar en qué red esté cada uno — solo esta PC necesita tener internet para llegar a Supabase. Es el mismo mecanismo que ya usa el marcador para sincronizarse en vivo entre el celu y la pantalla de la mesa.
