# PoolAppDeluxe — Roadmap y arquitectura (v1)

Documento vivo. Última actualización: 2026-10-18 (Fases 3 y 4 cerradas; rediseño visual y de navegación, 6.10; login con Google, 6.11), a partir de la revisión del código existente y la definición de producto con Agus.

> **Actualización 2026-10-17:** Fase 3 cerrada. Agus probó en la mesa la repetición sin recorte con OBS real, probó las cuentas (crear un club con una cuenta que no es admin, darle acceso a un staff, cargar un partido jugado, el límite del plan gratis y el reclamo por celu; del invitado por QR se probó la página, falta una partida entera) y confirmó Anonymous sign-ins en Supabase. Las variables de Vercel del job de borrado se habían dado por confirmadas pero no estaban: se cargaron el 2026-10-17 al desplegar el paso 2 de la Fase 4 (6.3, 6.9). El cobro (proveedor y precios) no bloquea el piloto: mientras tanto los planes pagos se activan a mano. Lo que queda abierto de la Fase 3 está en 6.8 y el plan de la Fase 4 en 6.9.

> **Actualización 2026-10-15:** pruebas en la PC de la mesa de la tele como proyector de OBS (6.5). La segunda (2026-10-11) arregló que la repetición no apareciera y pasó a un recorte sin reprocesar. La tercera (2026-10-12) mostró tiempos muy variables del disco (OBS 2–10 s en guardar, recorte hasta 25,7 s) y cortes de Supabase Realtime. Ahora el agente no recorta: carga el archivo de OBS y salta a los últimos segundos, borra los .mp4 que guarda OBS y recupera los pedidos que llegaron durante un corte de Realtime. Probado con OBS simulado; falta probarlo en la mesa.

> **Actualización 2026-10-11:** antes de pasar a la Fase 4, Agus pidió dos bloques más de Fase 3. (1) La tele de la mesa muestra la cámara **en vivo** todo el tiempo y la repetición aparece en esa misma pantalla, con un corte tipo canal deportivo, y vuelve sola al vivo; es lo que bloquea salir a probar y ya está hecho en el agente (sección 6.5). (2) Cuentas de club autogestionadas: cualquier cuenta real crea su club, el dueño suma gente, carga de partidos ya jugados sin mesa y RLS de `matches` acotada (sección 6.6; migración corrida en producción el 2026-10-11 y en main desde `1b76ad0`). La primera prueba del vivo en la notebook de Agus trabó OBS: la tele pasó a ser un proyector de OBS en vez de Chrome (6.5). El backlog que dejó Agus está en 6.7. Fase 3 cuentas en main desde `cb0a269`, con las dos migraciones corridas en producción.
>
> **Actualización 2026-10-08:** antes de seguir con el cobro, se define el modelo de cuentas: club, jugador e invitado sobre un solo sistema de permisos. Implementado en código (migración, mesas abiertas con QR fijo, reclamo de jugador por celu con confirmación, panel del club) — ver sección 6.4. Planes y límites (6.3) en main desde el commit `5787987`.
>
> **Actualización 2026-10-08:** dos ajustes de UI fuera de las fases. Se sacó la pantalla de inicio (repetía los accesos de la barra lateral) y `/` ahora lleva a 📊 Historial; cuando exista "mi jugador" (modelo de cuentas, 6.4) se puede reconsiderar llevar al perfil propio. Además, 🔍 en la barra busca jugadores por nombre (sin distinguir mayúsculas) y lleva a su perfil. La búsqueda de clubs queda afuera a propósito: no hay todavía una página pública de club a la que llevar.
>
> **Actualización 2026-10-07 (noche):** Fase 3 arrancada. Hecha la parte que no depende del proveedor de pago: planes (free/plus/pro) con sus límites en la base, límite de clips aplicado por la base al tocar "Guardar clip", pantalla 💳 Mi plan, descarga solo con plan pago, y job diario que borra los clips vencidos del plan free. Medido: un clip de 1 minuto pesa ~2,6 MB. Falta elegir proveedor de pago (Stripe no opera con comercios argentinos) y los precios — ver sección 6.3.
>
> **Actualización 2026-10-07 (tarde):** Fase 1 probada por Agus en producción (ok). Fase 2 implementada en código: botón "Guardar clip" en el celu → el agente de la mesa recorta, sube a Supabase Storage y crea el clip → se ve en 🎬 Clips & Replays y en el perfil de los jugadores. El agente ahora se ata a su mesa (`TABLE_ID`). Migración corrida en producción y prueba real con cámara ok: Fase 2 cerrada — ver sección 6.2.
>
> **Actualización 2026-10-07:** Fase 1 implementada en código (clubs, mesas, dispositivos, partidas vinculadas a una mesa, pantalla admin `/clubs`). La migración ya se corrió en Supabase de producción y el código está en main; falta la prueba de punta a punta en producción — ver sección 6.1.
>
> **Actualización 2026-10-06 (noche):** primera prueba end-to-end real en producción — login, partida, y repetición en la tele funcionando de punta a punta por primera vez. Se descubrió y arregló que la base de datos de producción nunca había recibido el esquema completo (le faltaban tablas, columnas y permisos que el código ya daba por existentes) — ver sección 3.1 para el detalle completo de lo que se encontró y se arregló.
>
> **Actualización 2026-10-06:** veredicto de escalabilidad del esquema actual (Supabase/Vercel/OBS) para producción masiva — ver sección 9.
>
> **Actualización 2026-09-27:** se define la estrategia de expansión a otros deportes (no solo pool) — ver sección 8.
>
> **Actualización 2026-09-01:** se agregó la funcionalidad de repetición en una tele por mesa (opcional, a criterio de cada club) — ver sección 5.1.

## 1. Visión del producto

PoolAppDeluxe deja de ser un simple marcador de pool para convertirse en un producto comercializable para clubes reales: los jugadores registran sus partidas, quedan grabadas en su perfil, y pueden publicarlas dentro de la app o descargarlas. El modelo de negocio combina tres capas:

- **Jugador free**: entra y juega gratis, sin fricción. Esto es lo que hace atractiva la instalación para el club (adopción).
- **Jugador suscripto**: paga para guardar clips más allá del límite gratuito, descargarlos en calidad completa, y publicarlos.
- **Club (B2B)**: paga una mensualidad por mesa instalada, con el costo del hardware (cámara + mini-PC) amortizado en esa cuota en vez de cobrado aparte.

Además de grabar, cada club puede optar por poner **una tele por mesa mostrando la partida en vivo mientras se juega** (no solo el clip después) — es una decisión de cada club, no algo que la app le imponga.

La ambición de fondo no se limita al pool: la misma idea (cámara fija sobre el terreno de juego + grabación + repetición + guardado en el perfil) aplica a cualquier deporte filmable — tenis, pádel, básquet, lo que sea. La estrategia elegida para eso es vender **una app personalizada por club/cliente** en vez de un único producto multi-tenant compartido (ver sección 8).

## 2. Decisiones de producto tomadas

| Tema | Decisión |
|---|---|
| Captura de video | Cámara fija apuntando a la mesa, conectada a un mini-PC dedicado por mesa |
| Topología en el club | **Un mini-PC + cámara por mesa** (no una PC central manejando varias mesas) — cada mesa es independiente, el club escala agregando hardware mesa por mesa |
| Modelo de negocio | Híbrido: jugar es gratis siempre; descargar/guardar clips requiere suscripción a partir de cierto uso; el club paga una mensualidad por mesa con instalación bonificada |
| Qué limita la suscripción | Cantidad/duración de clips guardados **y** publicar/compartir públicamente. Propuesta de arranque: plan free = 1 clip corto guardado por mes, y va creciendo con el nivel de suscripción |
| Prioridad actual | Diseñar la arquitectura completa antes de escribir código nuevo |
| Repetición en tele | Feature opcional por club: tele por mesa que muestra la mesa en vivo todo el tiempo y, bajo pedido, la repetición de la última jugada en esa misma pantalla, volviendo sola al vivo (redefinido 2026-10-11, ver 6.5) — delay de un par de segundos en la repetición es aceptable |
| Cámara | Fija, cenital (desde arriba), siempre encuadrando la mesa — sin zoom ni movimiento |
| Hardware sugerido | Mini-PC tipo Intel N100 (no Raspberry Pi) por el decodificador/codificador de video por hardware — necesario porque el mismo equipo tiene que mostrar el video en vivo, mantener el buffer para clips, y codificar/subir clips a demanda |
| Expansión a otros deportes | Vender una **app personalizada por cliente/club** (no un SaaS multi-tenant único) — cada deporte/club es esencialmente una instancia propia derivada de la misma base de código |
| Orden de trabajo | Primero terminar y validar PoolAppDeluxe (pruebas de cámara en casa, luego un club de pool real); recién cuando el sistema esté andando, portarlo para un club de tenis (el profe de tenis de Agus) como segundo caso de venta |

### Pendiente de definir con Agus
- Presupuesto/target de costo por mesa para el hardware (mini-PC + cámara + tele si aplica).
- Precio de los planes (jugador y club). La estructura de planes ya está (sección 6.3); faltan los montos.
- Proveedor de pago: Mercado Pago vs. Stripe (sección 6.3).
- Límites de los planes de club: cuántas mesas y cuántos jugadores propios (sección 6.4; por ahora un solo plan sin límites).
- Si el club tiene un panel de administración propio (ver mesas activas, jugadores frecuentes) como parte del plan pago del club.
- Moderación de contenido publicado públicamente (¿alguien revisa antes de publicar? ¿reporte de usuarios?).
- Altura/ángulo de montaje de la cámara cenital según la altura típica de techo en un club (define el lente/campo de visión necesario para cubrir la mesa completa).

## 3. Estado actual del código (auditoría 2026-09-01, corregida 2026-10-06)

**Funciona de punta a punta, confirmado con una prueba real recién hoy:** login por SMS/OTP (Supabase Auth, con número y OTP de prueba configurados en Supabase mientras no haya proveedor de SMS real), CRUD de jugadores con avatar, flujo de partida completo (crear → QR → control desde el celu → marcador en tiempo real vía Supabase Realtime → finalizar con ganador, reflejado en vivo tanto en el celu como en la pantalla de la mesa), historial, repetición en la tele (ver 3.1 y 5.1), y estadísticas de winrate por jugador.

**No implementado:**
- ~~`Clips.jsx` es un placeholder vacío / `save_clip` no tiene a nadie escuchando~~ → resuelto en la Fase 2 (2026-10-07, ver 6.2): guardado permanente al perfil vía el agente de la mesa.
- `score_update` está en el schema de `realtime_commands` pero no se usa en ningún lado del código.
- ~~No existe el concepto de club ni de mesa en el modelo de datos~~ → resuelto en la Fase 1 (2026-10-07, ver 6.1). Las partidas pueden seguir siendo "sueltas" (sin mesa) a propósito.
- No hay cobro online integrado. Desde la Fase 3 (ver 6.3) existen los planes y sus límites; el plan pago se activa a mano mientras no haya proveedor de pago.

**Deuda técnica menor:** `src/storage/jugadores.js` es código muerto (versión vieja con localStorage, previa a Supabase). Varios `console.log` de debug en `PlayerService.js` y `NuevoJugador.jsx`. Falta validar que Jugador 1 ≠ Jugador 2 al crear partida. Las políticas RLS eran permisivas a propósito para el MVP ("se endurece en v2", según el propio comentario del schema); desde la Fase 3 ya no lo son en `players`, `clubs`, `tables`, `clips`, `realtime_commands` y `matches` (2026-10-11, ver 6.6), y sigue abierta `interactions` (Fase 5).

### 3.1 Lo que se encontró y se arregló en la primera puesta en marcha real (2026-10-06)

Hasta hoy, el código nunca se había probado de punta a punta contra la base de datos de producción real con un login de verdad activo. Al hacerlo, aparecieron varios problemas — ninguno de diseño, todos de puesta en marcha — que vale la pena dejar anotados porque seguramente se repitan en la próxima instalación (un club nuevo) si no se automatizan:

- **Mismatch de nombre de variable de entorno en Vercel:** el código espera `VITE_SUPABASE_KEY`, pero en Vercel la variable estaba cargada como `VITE_SUPABASE_ANON_KEY` — la app en producción corría sin key de Supabase sin que se notara a simple vista. Arreglado renombrando la variable en Vercel.
- **Faltaba `vercel.json`:** sin la regla de reescritura de rutas para SPA, cualquier URL que no fuera la raíz (`/login`, `/partida/:id/control`, el link del QR) tiraba un 404 de Vercel al abrirse directo (por link o QR), aunque navegando con clicks dentro de la app funcionara bien. Se agregó `vercel.json` con el rewrite a `index.html`.
- **La base de datos de producción nunca había recibido el `supabase-schema.sql` completo** — quedó claro que ese archivo se escribió y se subió a git, pero nadie lo corrió nunca contra el proyecto real de Supabase. Por tabla, lo que faltaba:
  - `matches`: le faltaban las columnas `score1`, `score2`, `status`, `winner_id`, `started_at`, `finished_at`, `qr_token`, `notes` — se agregaron con `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
  - `realtime_commands`: la tabla no existía — se creó entera, se le activó RLS, y se agregó a la publicación de Realtime (sin este último paso el agente de OBS nunca se entera de los comandos nuevos).
  - `players` y `matches`: tenían RLS activado pero sin política de escritura — se agregó una política permisiva (`auth.role() = 'authenticated'`) a cada una, acorde a la decisión ya tomada de mantener el MVP permisivo.
  - Importante: nada de esto borró datos existentes — los jugadores y partidas de prueba que parecían "perdidos" en el camino siempre estuvieron ahí, solo ocultos por la falta de política de lectura/escritura para esa sesión.
- **Pipeline de video, dos bugs separados:**
  - El recorte con `ffmpeg -c copy` cortaba en un punto del video que no coincidía con un keyframe, así que el clip resultante tenía audio pero no video (problema clásico de `-sseof` + stream copy). Se cambió a reencodear el recorte (`libx264` + `aac`, preset `ultrafast`) para garantizar que cada clip arranque con una imagen válida.
  - Una vez resuelto eso, seguía sin verse imagen — resultó ser el **Modo de Estudio de OBS** activado: la Vista Previa mostraba la cámara bien, pero el Programa (lo único que realmente se graba) estaba en negro porque nunca se había hecho la transición. Se resolvió desactivando el Modo de Estudio (no hace falta para este caso de uso).
  - Separado de eso, la Xbox Game Bar de Windows interfería con la captura de OBS — hay que desactivarla en cualquier PC nueva que se use para esto.
  - El agente (`replay-agent.js`) no se reconectaba solo a OBS si la conexión se cortaba (por ejemplo, al reiniciar OBS durante una sesión) — quedaba "pensando" que seguía conectado y fallaba con `Not connected`. Se le agregó reconexión automática.
- **Bug de sincronización en el cliente:** `PartidaControl.jsx` finalizaba la partida llamando directo a `finishMatchById` del service, sin pasar por `MatchContext` — la base de datos quedaba bien actualizada, pero la lista de partidas en memoria que usa `Historial.jsx` nunca se refrescaba, así que la partida seguía viéndose "en curso" hasta recargar la página entera. Se corrigió usando `finishMatch` del contexto (que sí dispara el refresco) en vez del service directo.

**Conclusión práctica para la próxima mesa/club:** antes de dar por "lista" una instalación nueva, hay que confirmar explícitamente que (a) las variables de entorno en Vercel se llaman exactamente como el código las espera, (b) el `supabase-schema.sql` completo se corrió contra ESE proyecto de Supabase puntual, y (c) el Modo de Estudio y la Game Bar están apagados en la PC de cada mesa. Vale la pena, en algún momento, convertir el punto (b) en un script o checklist único en vez de ir tabla por tabla a mano como se hizo hoy.

## 4. Modelo de datos — qué hay que agregar

Además de lo que ya existe (`players`, `matches`, `clips`, `interactions`, `realtime_commands`):

- **`clubs`**: id, name, address, contact, subscription_status/plan, stripe_customer_id, created_at.
- **`tables`**: id, club_id, label (ej "Mesa 3"), device_id (identifica al mini-PC/cámara asignado), status (online/offline), created_at.
- **`devices`**: id, table_id, auth_token (para que el mini-PC se autentique contra Supabase con permisos acotados, distinto de la anon key que usa la app de los jugadores), last_seen_at.
- **`matches`**: agregar `club_id` y `table_id` (FK).
- **`user_subscriptions`**: user_id, plan, status, stripe_subscription_id, current_period_end.
- **`club_subscriptions`**: club_id, plan, status, stripe_subscription_id, tables_included.
- **`clips`**: agregar `is_public` (bool), `expires_at` (para el borrado automático del plan free), `downloaded_at`.

## 5. Pipeline de video (mini-PC por mesa)

**Actualización 2026-09-28 — piloto con OBS:** para probar hoy, en vez de escribir un agente de captura desde cero, usamos **OBS** (que Agus ya tiene corriendo con la cámara de su mesa de casa) y su función nativa de **Replay Buffer**, más un agente chico (`agent/replay-agent/` en este repo) que hace de puente entre Supabase y OBS. Esto probablemente alcance también para el piloto en un club real, no solo para la prueba de hoy — se decide si conviene reemplazarlo por un agente propio más adelante, cuando haya datos reales de uso (por ahora no hace falta).

Además, se sacó el botón de "guardar clip" del control del celu: por ahora la única acción es pedir una **repetición** (20s / 40s / 1min), sin generar todavía un clip permanente guardado al perfil. La edición/recorte automático con IA que Agus quiere agregar después va a trabajar sobre este mismo mecanismo, así que no hacía falta resolver las dos cosas (repetición + guardado permanente) al mismo tiempo.

1. El agente (`agent/replay-agent/`) corre en la PC de la mesa (la que tiene OBS y la cámara — **no** es necesariamente la misma PC donde se desarrolla el resto de la app) y se suscribe vía Supabase Realtime a `realtime_commands`, igual que ya hace `PartidaControl.jsx` para el marcador.
2. Cuando el celu manda un comando `mark_moment` con `payload.duration_sec` (20, 40 o 60), el agente le pide a OBS por WebSocket (`SaveReplayBuffer`) que vuelque el buffer a un archivo.
3. El agente recorta con `ffmpeg` los últimos N segundos pedidos y lo deja disponible en una página local (`replay-display.html`) que se abre en pantalla completa en el navegador de la tele conectada por HDMI a esa PC.
4. Como el celu nunca le habla directo a la PC de la mesa (todo pasa por Supabase, que es la nube), esto funciona aunque el celu esté en otra red distinta a la de esa PC — solo la PC de la mesa necesita tener internet para llegar a Supabase. Ver el `README.md` de esa carpeta para la puesta en marcha paso a paso.
5. `save_clip`: desde la Fase 2 (ver 6.2) lo manda el botón "Guardar clip en el perfil" del celu; el agente recorta, sube a Supabase Storage y crea la fila en `clips`. La edición/recorte con IA va a trabajar sobre esto mismo.
6. Cuando llega `end_match`: cierra la grabación de esa mesa (hoy `PartidaControl` ya llama directo a `finishMatchById`; conviene unificarlo para que sea el agente el que reacciona al comando realtime, y sacar la llamada duplicada del cliente) — pendiente, no bloquea la prueba de hoy.
7. **Storage** (para cuando se agregue el guardado permanente): evaluar Supabase Storage vs. algo más barato para video a escala como Cloudflare R2 o Backblaze B2 — con muchos clubes y clips esto es el costo variable más grande del negocio, vale la pena decidirlo antes de escalar, no después.
8. **Borrado automático plan free**: hecho en la Fase 3 (ver 6.3) — `api/cron/expire-clips.js`, una vez por día vía Vercel Cron.

### 5.1 Repetición en la tele (por mesa, opcional para el club)

**Redefinido:** no es una transmisión en vivo continua — Agus aclaró que el objetivo real es poder ver la repetición de una jugada, no mirar la mesa como si fuera un stream. Esto simplifica el diseño y confirma que un delay de un par de segundos es aceptable.

**Redefinido otra vez (2026-10-11):** la tele sí muestra la cámara en vivo todo el tiempo mientras graba, y la repetición entra en esa misma pantalla como el corte de un canal deportivo, volviendo sola al vivo. Sigue sin ser un stream a internet: el vivo es local, de la PC de la mesa a su tele. Cómo se hizo: sección 6.5.

- **Cámara cenital fija**, siempre encuadrando la mesa desde arriba. Sin zoom ni movimiento (nada de PTZ) — más simple y barata, y de paso todos los clips quedan con el mismo encuadre consistente, lo cual ayuda a que se vean prolijos si después se publican.
- **Flujo de repetición**: el mini-PC mantiene el buffer rotativo local (el mismo que ya se necesita para los clips). Desde el control del celu, un botón "repetición" manda un comando `mark_moment` por Realtime (hoy definido en el schema pero sin usar) — distinto de `save_clip`. El mini-PC reacciona reproduciendo en la tele los últimos N segundos del buffer, una vez, sin necesariamente subirlo a storage. Si el jugador después quiere guardarlo, ahí sí dispara `save_clip`.
- **Conexión a la tele**: al no ser tiempo real estricto, no hace falta cable HDMI obligatorio — una tele inalámbrica (Chromecast, smart TV en la red local) funciona bien, aunque el cable directo sigue siendo la opción más simple y confiable para instalar.
- **Hardware**: se mantiene la recomendación de mini-PC tipo Intel N100 — de sobra para mantener el buffer, reproducir la repetición, y codificar/subir un clip ocasional, todo en el mismo equipo.

### 5.2 Distribución del agente a clubes reales (futuro — no para el piloto de hoy)

**Idea de Agus (2026-10-06):** en vez de que cada club configure el agente a mano, que el panel del club (todavía no existe) tenga un botón de "descargar agente para esta mesa" después de loguearse y pasar una verificación — les llega la carpeta ya lista para esa mesa puntual, sin que el club tenga que copiar y pegar claves de Supabase.

La idea es correcta y de hecho es justo lo que la tabla `devices` de la sección 4 ya estaba pensada para resolver — ahí falta conectar una pieza:

- **No se puede embeber la `SUPABASE_SERVICE_KEY`** (la llave maestra que usa el agente de hoy) en un archivo que se descarga a la computadora de un cliente — esa key da acceso a la base completa, de todos los clubes. Si la PC de un club se compromete, se expone la información de todos los demás clubes, no solo el suyo.
- En su lugar, el botón de descarga tiene que llamar a un backend propio (una función serverless, no el navegador directo a Supabase) que: valida que el club está verificado, crea una fila nueva en `devices` con un token propio y acotado para esa mesa (vía políticas RLS que solo le dejen leer/escribir lo de su `club_id`/`table_id`, no el resto de la base), arma el `.env` con ESE token (nunca con la service key), empaqueta la carpeta del agente al vuelo, y la entrega para descargar.
- Con eso, perder o filtrar la carpeta de una mesa solo compromete esa mesa, no la plataforma entera.

Esto depende de cosas que todavía no existen (login/panel de club, Fase 1 del modelo de datos) — no es para construir ahora, pero queda el criterio de seguridad anotado para no tener que rehacerlo más adelante bajo presión.

## 6. Roadmap por fases

**Fase 1 — Modelo de datos club/mesa.** Agregar `clubs`, `tables`, `devices` y vincular `matches` a una mesa. Pantalla mínima para dar de alta un club y sus mesas (puede ser interna/admin, no hace falta que sea linda todavía).

### 6.1 Fase 1 — qué se hizo (2026-10-07)

**Hecho en código:**
- `supabase/migrations/2026-10-07-fase1-clubs-mesas.sql`: migración para la base que ya existe (producción). Crea `clubs`, `tables` y `devices`, y agrega `club_id`/`table_id` a `matches`. Es idempotente (se puede correr dos veces) y no toca datos existentes — probada contra un Postgres local simulando producción (schema v1.0 + datos, migración corrida dos veces, datos intactos).
- `supabase-schema.sql` actualizado a v1.1 con lo mismo, para que una instalación nueva desde cero ya quede completa (lección de la sección 3.1). Probado desde cero en Postgres local.
- `src/services/ClubService.js` + pantalla interna `/clubs` (ícono 🏢 en la barra lateral): alta/baja de clubs y de mesas por club. Sin diseño fino, como pedía la fase.
- Nueva partida: selector opcional de mesa ("Club · Mesa N"); por defecto "Sin mesa (partida suelta)", así nada del flujo actual cambia si no se elige mesa. La pantalla de la partida muestra club y mesa cuando la tiene.

**Decisiones tomadas en el camino (cambiables):**
- Las partidas existentes quedan con `club_id`/`table_id` en NULL; la mesa es opcional también en partidas nuevas.
- Borrar un club borra sus mesas (cascade); borrar un club o una mesa NO borra partidas, solo las desvincula (`ON DELETE SET NULL`).
- `devices` guarda `auth_token_hash` (solo el hash, nunca el token en claro) y tiene RLS activado **sin políticas**: la app de los jugadores no puede leer ni escribir esa tabla, solo el service role. Es la base para el backend de la sección 5.2. Todavía no hay UI ni flujo para crear dispositivos — no hace falta hasta la Fase 2 / 5.2.
- `clubs` todavía no tiene columnas de suscripción/Stripe (`subscription_status`, `stripe_customer_id`) de la sección 4: se agregan en la Fase 3, cuando se integre el cobro, para no adivinar el modelo antes.
- `tables.device_id` de la sección 4 se invirtió: es `devices.table_id` (único), así una mesa tiene a lo sumo un dispositivo y reemplazar el mini-PC es solo crear otra fila.

**Pendiente para cerrar la Fase 1:**
- ~~Correr `supabase/migrations/2026-10-07-fase1-clubs-mesas.sql` en Supabase de producción~~ → hecho por Agus el 2026-10-07 (SQL Editor). Commit `25ff630` pusheado a main.
- ~~Probar en producción: crear un club, una mesa, una partida en esa mesa, y ver que aparece "Club · Mesa" en la pantalla de la partida.~~ → probado por Agus el 2026-10-07, ok.
- ~~El agente de repetición todavía no sabe a qué mesa pertenece~~ → resuelto en la Fase 2 con `TABLE_ID` (ver 6.2); el token propio vía `devices` sigue pendiente para la sección 5.2.

**Fase 2 — Piloto de grabación y repetición en una sola mesa.** Construir el agente del mini-PC y probar el flujo completo (grabar → repetición en tele bajo pedido vía `mark_moment` → recortar/guardar vía `save_clip` → subir → ver el clip en el perfil) con un club/mesa de prueba, cámara cenital fija, sin todavía meter pagos ni límites. El objetivo es validar que la parte técnica más riesgosa (captura continua + repetición + recorte + upload, todo en el mismo mini-PC) funciona antes de invertir en escalarla.

### 6.2 Fase 2 — qué se hizo (2026-10-07)

**Hecho en código:**
- `supabase/migrations/2026-10-07-fase2-clips.sql`: crea `clips` si producción no la tiene (posible, ver 3.1) y le agrega `club_id`, `table_id`, `command_id`, `storage_path`, `error_message`, y ya de paso `is_public`, `expires_at`, `downloaded_at` de la sección 4 para no migrar dos veces. Agrega `clips` a Realtime, asegura el bucket `clips` y su política de lectura. Idempotente; probada en Postgres local en tres casos (base con schema completo + datos, base tipo producción sin `clips` ni bucket, y desde cero), corrida dos veces, datos intactos.
- `supabase-schema.sql` actualizado a v1.2 con lo mismo.
- **Encontrado al correrla en producción (2026-10-07):** falló con `column "status" does not exist`. Producción ya tenía una tabla `clips` creada a medias (otra vez lo de la sección 3.1), así que `CREATE TABLE IF NOT EXISTS` no la tocaba y el índice sobre `status` rompía. Se corrigió la migración para asegurar también cada columna del schema original con `ADD COLUMN IF NOT EXISTS`; probada contra una `clips` a medias con datos.
- Agente (`agent/replay-agent/replay-agent.js`):
  - Nuevo `save_clip`: crea el clip en `processing`, le pide a OBS el buffer, recorta los últimos N segundos en 720p (CRF 26, `+faststart` para que el navegador lo reproduzca sin bajarlo entero), genera miniatura, sube los dos a Storage (`clips/<match_id>/<clip_id>.mp4|.jpg`) y pasa el clip a `ready` (o `error` con el motivo).
  - Nuevo `TABLE_ID` en el `.env`: si está, el agente solo reacciona a partidas de esa mesa y la marca `online` al arrancar / `offline` al cerrarse. Vacío = comportamiento de antes (cualquier partida).
  - Marca los comandos que procesa como `processed = true`.
  - Cola de pedidos en vez de una sola variable: si llegan repetición y clip seguidos, cada uno se resuelve en orden.
- App:
  - Control del celu: segunda fila "Guardar clip en el perfil" (20s / 40s / 1 min) con estado en vivo ("Guardando clip…" → "✓ Clip guardado").
  - 🎬 Clips & Replays deja de ser placeholder: grilla de clips con reproductor, jugadores, club/mesa, fecha y botón de descarga.
  - Perfil del jugador: sección "Clips" con los clips donde jugó.
  - Clubs y mesas: botón "copiar ID" por mesa, para el `TABLE_ID` del agente.

**Decisiones tomadas en el camino (cambiables):**
- **Storage: Supabase Storage para el piloto** (sección 5, punto 7). Cambiar a R2/B2 se decide con datos reales de uso; el agente guarda `storage_path`, así migrar es mover archivos y reescribir URLs.
- **Bucket público para el piloto:** los links son imposibles de adivinar pero quien tenga uno lo ve. Pasar a privado + links firmados cuando entre el paywall (Fase 3/4).
- **Clip en 720p**: Supabase limita a 50 MB por archivo por defecto; 1 minuto en 720p CRF 26 debería quedar bastante por debajo (a confirmar con la cámara real).
- **El clip es de la partida, no de un jugador**: aparece en el perfil de los dos. Quién "es dueño" (para límites del plan free) se define en la Fase 3.
- **El agente sigue usando la service key** en la PC de Agus. El token propio por mesa (sección 5.2, tabla `devices`) queda para cuando haya agentes en PCs de clubes: `TABLE_ID` ya prepara el terreno.
- **`end_match` sin cambios**: el cliente sigue finalizando la partida (ver sección 5, punto 6); no hacía falta para el piloto.

**Pendiente para cerrar la Fase 2:**
- ~~Correr `supabase/migrations/2026-10-07-fase2-clips.sql` en Supabase de producción (SQL Editor).~~ → hecho por Agus el 2026-10-07, con la versión corregida (ver arriba). Código en main desde el commit `41b054d`.
- Actualizar la carpeta del agente en la PC de la mesa y poner `TABLE_ID` en su `.env` (opcional para probar en casa).
- ~~Prueba real: partida en una mesa → repetición en la tele → "Guardar clip" → verlo y descargarlo en Clips y en el perfil.~~ → probado por Agus el 2026-10-07 con la cámara real: los clips se guardan desde el celu y quedan vinculados a la mesa y a los perfiles. Medido: un clip de 1 minuto (720p, CRF 26) pesa **2.611 KB ≈ 2,6 MB**, muy lejos del límite de 50 MB por archivo de Supabase.
- Si el estado de la mesa queda `online` después de apagar la PC de golpe, es esperado: el monitoreo con `devices.last_seen_at` es de la Fase 5.

**Fase 3 — Suscripciones y paywall.** Integrar Stripe (jugador y club), guardar el estado de suscripción en Supabase, aplicar los límites (cantidad de clips, descarga, publicar) en el cliente y reforzarlos con RLS. Sumar el job de borrado automático del plan free.

### 6.3 Fase 3 — qué se hizo (2026-10-07)

**Dato de partida (de la Fase 2):** un clip de 1 minuto pesa ~2,6 MB (uno de 20 s, ~0,9 MB). Con los precios de lista de Supabase Pro (aprox., a confirmar al contratar: 100 GB de storage incluidos y después ~US$0,021 por GB al mes; 250 GB de transferencia incluidos y después ~US$0,09 por GB):
- 100 GB alcanzan para ~38.000 clips de 1 minuto. Guardar un clip cuesta, fuera de lo incluido, del orden de US$0,00005 por mes.
- Cada reproducción completa de un clip de 1 minuto son 2,6 MB de transferencia: 250 GB son ~96.000 reproducciones por mes.
- Conclusión: **el storage no es lo que limita los planes**; lo que más va a costar es la transferencia cuando haya clips públicos (Fase 4). Los límites del plan free se definen por valor de producto (que den ganas de pagar), no por costo.

**Hecho en código:**
- `supabase/migrations/2026-10-07-fase3-planes.sql` (idempotente, tolera tablas a medias como pasó con `clips`; probada en Postgres local en tres casos: base con schema completo + datos, base tipo producción con tablas a medias y una `plans` a medias, y desde cero; corrida dos veces, datos intactos):
  - `plans`: catálogo con los límites de cada plan. Los límites viven en la base, no en el código: cambiar un precio o un límite es editar la fila. Volver a correr la migración no pisa lo editado.
  - `user_subscriptions`: una fila por usuario con plan pago (sin fila o vencida = free). La app solo puede leer la propia; escribirla es solo del backend de cobro o del SQL Editor.
  - `club_subscriptions`: mensualidad por mesa del club, carga manual por ahora (no hay login ni panel de club).
  - `realtime_commands.requested_by` (quién tocó "Guardar clip", lo pone la base) y `clips.owner_id` (a quién le cuenta el clip). Un trigger copia el dueño del comando al clip y calcula `expires_at` según su plan: **el agente de la mesa no necesita actualizarse**.
  - Trigger que rechaza el pedido de clip si el plan no alcanza (cantidad por mes o duración), con un mensaje que el celu muestra. Los clips que terminan en error devuelven el cupo.
  - Trigger que impide marcar un clip como público si el plan no lo permite (publicar llega en la Fase 4; la regla ya queda).
  - RLS más estricto en `realtime_commands` (la app solo lee e inserta) y `clips` (la app solo lee), para que el límite no se esquive borrando pedidos o clips. El agente usa la service key, así que no le cambia nada.
- `supabase-schema.sql` actualizado a v1.3 con lo mismo.
- `api/cron/expire-clips.js` + `crons` en `vercel.json`: todos los días a las 7 UTC borra del bucket el video y la miniatura de los clips vencidos y los marca con `expired_at` (la fila queda). `vercel.json` ahora excluye `/api/` del rewrite al `index.html`.
- App: pantalla 💳 **Mi plan** (plan actual, clips usados en el mes, catálogo de planes); el control del celu muestra cuántos clips quedan en el mes, deshabilita las duraciones que el plan no permite y avisa con link a planes si la base rechaza el pedido; en Clips y en el perfil, "Descargar" solo con plan pago, aviso de "Se borra el dd/mm" y clips vencidos como "Vencido".

**Valores de arranque de los planes (cambiables editando `plans`):**

| Plan | Clips por mes | Duración máx. | Se borran | Descarga | Publicar | Precio |
|---|---|---|---|---|---|---|
| Free | 1 | 20 s | a los 30 días | no | no | gratis |
| Plus | 20 | 1 min | nunca | sí | sí | a definir |
| Pro | ilimitado | 1 min | nunca | sí | sí | a definir |

**Decisiones tomadas en el camino (cambiables):**
- **El clip cuenta para quien tocó "Guardar clip"** (el usuario logueado en el celu), no para los dos jugadores. Lo sigue viendo cualquiera de los dos en su perfil.
- **El límite lo aplica la base** (trigger), no solo la pantalla: no se saltea tocando el cliente. Es más simple y más claro que hacerlo con políticas RLS, y da un mensaje de error entendible.
- **El vencimiento se fija al guardar el clip**: si alguien de plan free se pasa a pago después, sus clips viejos siguen venciendo; si alguien pago se da de baja, sus clips ya guardados se quedan.
- **Los clips de la Fase 2 (sin dueño) no vencen ni cuentan** para ningún límite.
- **La descarga se oculta en la app pero el bucket sigue público**: quien tenga el link del video lo puede bajar igual. Pasar el bucket a privado con links firmados queda para la Fase 4, junto con compartir por link.
- **Activación manual mientras no haya cobro online:** desde el SQL Editor, `INSERT INTO user_subscriptions (user_id, plan_id, provider) VALUES ('<id de auth.users>', 'plus', 'manual');` (con `current_period_end` si tiene vencimiento).

**Pendiente para cerrar la Fase 3:** (estado al cierre, 2026-10-17; lo que sigue abierto está en 6.8)
- Elegir proveedor de pago. Stripe (lo que decía este documento) no abre cuentas a comercios de Argentina sin una empresa en el exterior; la alternativa natural es Mercado Pago (suscripciones con débito automático en pesos). Con eso: botón "Suscribirme" en Mi plan → checkout del proveedor → webhook (función en `api/`) que escribe `user_subscriptions`.
- Poner precios a Plus y Pro (columna `price_ars` de `plans`). Este punto y el anterior pasan a 6.8: no bloquean el piloto.
- ~~Correr `supabase/migrations/2026-10-07-fase3-planes.sql` en Supabase de producción~~ → hecho el 2026-10-08, junto con la de cuentas (6.4).
- ~~En Vercel, agregar `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` y `CRON_SECRET` (sin prefijo `VITE_`, así nunca llegan al navegador) para el job de borrado~~ → **corrección 2026-10-17:** se había dado por confirmado, pero en Vercel solo estaban `VITE_SUPABASE_URL` y `VITE_SUPABASE_KEY`; el job de borrado nunca pudo correr. Apareció al desplegar el paso 2 de la Fase 4 (6.9), que usa las mismas variables, y Agus las cargó ese día.
- ~~Prueba real: usuario free guarda 1 clip de 20 s → el segundo pedido se rechaza con aviso → alta manual a Plus → puede guardar de 1 min y descargar~~ → probado por Agus el 2026-10-17 con números de prueba (6.8).

### 6.4 Fase 3 — modelo de cuentas: club, jugador e invitado (2026-10-08)

**Por qué antes del cobro:** hasta acá la única cuenta real era la de Agus (admin) y cualquier logueado podía crear jugadores, clubs y mesas. Agus pidió cerrar primero la distinción entre club, jugador e invitado, para que el cobro (jugador y club) se apoye en el mismo modelo de permisos en vez de dos sistemas en paralelo. Propuesta discutida: `/mnt/project-files/fase3/modelo-de-cuentas.md` (fuera del repo).

**Decisiones (Agus aprobó las cinco recomendaciones):**
- **Toda persona es un usuario de Supabase Auth, también el invitado** (sesión anónima). El "tipo de cuenta" no es un campo `role`: sale de las relaciones. Tener un `players.user_id` propio te hace jugador; figurar en `club_members` te hace cuenta de club; tener una sesión anónima te hace invitado. Así el dueño de un club también puede jugar.
- **Reclamar por celu, con confirmación:** si un jugador sin dueño (cargado por un club o como invitado) tiene el mismo celu con el que alguien entra por OTP, la app pregunta "Este número ya tiene partidas jugadas como Juan, ¿sos vos?" antes de unir el historial (pedido de Agus, para el caso de un celu compartido o mal cargado). Se comparan los últimos 10 dígitos, así coinciden "+54 9 11 …" y "11 …". El formato con "15" no coincide y hay que vincularlo a mano.
- **Disponibilidad de la mesa aparte de `status`:** `status` (online/offline) es de la PC y lo pone el agente; `availability` (`closed`/`waiting`/`in_match`) es del club. Si fueran una sola columna, el agente pisaría lo que pone el club.
- **Planes de club:** un solo catálogo `plans` con `audience` (`player`/`club`) y límites `max_tables`/`max_club_players`. Arranca un plan `club` sin límites hasta tener un club real.
- **Google login:** después del piloto. No cambia el modelo, porque es otro método de login del mismo usuario.

**Hecho en código:**
- `supabase/migrations/2026-10-07-fase3-cuentas.sql`. Es idempotente y tolera tablas a medias. Se probó en Postgres local sobre tres bases (schema completo, tipo producción con tablas a medias, y desde cero), corrida dos veces cada una con los datos intactos, y se probaron los permisos de cada rol:
  - `profiles` (una por usuario, se crea sola al registrarse; `is_admin`).
  - `club_members` (`owner`/`staff`).
  - En `players`: `user_id`, `club_id`, `is_guest` y `created_by`.
  - En `tables`: `qr_token` fijo y `availability`.
  - En `plans`: `audience`, `max_tables` y `max_club_players`, más el plan `club`.
  - En `club_subscriptions`: `plan_id`.
  - Funciones de permisos `is_admin()`, `is_club_member()`, `my_player_id()` y `plan_for_club()`, usadas por la RLS nueva de `players`, `clubs`, `tables`, `profiles` y `club_members`.
  - Mi jugador: `claimable_players()` + `claim_player()` (el reclamo) y `create_my_player()`.
  - Mesa abierta: `table_by_qr()` y `start_match_at_table()`. Esta última bloquea la fila de la mesa, así dos celus a la vez no crean dos partidas; la mesa pasa a `in_match` y vuelve a `waiting` sola cuando termina la partida.
  - Admin: `add_club_member_by_phone()` (dar la cuenta de un club por celu).
  - Triggers: nadie se adueña de un jugador por fuera de esas funciones, límites del plan de club, y los invitados anónimos no guardan clips.
- `supabase-schema.sql` v1.4 con lo mismo.
- App:
  - `/mesa/:token`: la página del QR. Muestra club y mesa, y deja entrar con el celu o como invitado. Se elige rival (existente o invitado nuevo con celu opcional) y arranca la partida.
  - Arriba de cualquier pantalla (ya no hay pantalla de inicio): la primera vez que alguien entra con su celu crea su jugador o confirma el reclamo.
  - Clubs y mesas: el admin ve todo y da acceso a un club por celu; una cuenta de club ve solo lo suyo. Por mesa hay botón abrir/cerrar y QR para imprimir. 🏢 solo aparece para admin y cuentas de club.
  - Jugadores: crear y borrar solo admin o club, con celu opcional para el reclamo. El avatar solo lo cambia quien puede editar.
  - Un invitado que después entra con su celu convierte la misma sesión en cuenta (`updateUser` + OTP `phone_change`). Si ese celu ya tenía cuenta, entra a la existente.

**Decisiones tomadas en el camino (cambiables):**
- Las partidas siguen pudiendo crearse "a mano" por cualquier logueado (`NuevaPartida`); ~~la RLS de `matches` queda abierta hasta la Fase 5~~ → acotada el 2026-10-11 (ver 6.6).
- Un jugador con cuenta no puede borrar su jugador (solo admin), para no romper historial ajeno.
- Si se vuelve a correr la migración de planes, hay que correr después la de cuentas: la de planes reescribe el control de clips sin la regla de invitados.

**Pendiente para cerrar esta parte:**
- ~~Correr en producción las dos migraciones y marcarse admin~~ → hecho el 2026-10-08 (Agus lo chequeó en el SQL Editor). Código en main desde `cb0a269`.
- ~~Supabase → Authentication → Sign In / Providers: activar **Anonymous sign-ins** (viene apagado)~~ → confirmado por Agus el 2026-10-17. Activar también el CAPTCHA de Auth antes de abrir mesas en un club real: hoy el único freno a crear sesiones anónimas en loop es el límite por IP que trae Supabase (pedido de Agus: anotar el rate-limit para cuando haya mesas reales).
- ~~Prueba real: abrir una mesa, escanear el QR desde otro celu como invitado, jugar y terminar (la mesa vuelve a "abierta")~~ → la página del QR se probó el 2026-10-17 con una cuenta logueada; falta jugar una partida entera como invitado, desde una pestaña privada (6.8). ~~Después cargar un jugador de club con un celu y entrar con ese celu para confirmar el reclamo~~ → probado el 2026-10-17.

### 6.5 Fase 3 — vivo continuo y repetición en la misma pantalla (2026-10-11)

**Pedido de Agus:** hasta acá la tele mostraba "esperando repetición…" y la cámara grababa en segundo plano sin mostrar nada. Ahora la cámara se ve en vivo todo el tiempo, y al pedir una repetición aparece en esa misma ventana, como el corte de un canal deportivo, y vuelve sola al vivo. Es lo que bloqueaba salir a probar.

**Cómo se hizo (todo en `agent/replay-agent/`, no toca la app ni la base):**
- **De dónde sale el vivo:** la cámara física ya la tiene abierta OBS y en Windows una cámara no se puede abrir dos veces. Por eso la tele toma la imagen de la **cámara virtual de OBS** (viene con OBS desde la 26.1), que además muestra exactamente lo que OBS graba. Al conectarse a OBS, el agente prende solo el buffer de repetición y la cámara virtual si estaban apagados.
- **`replay-display.html`:** la cámara virtual de fondo con la etiqueta "EN VIVO". Cuando el agente avisa que hay una repetición nueva, pasa una cortina con "REPETICIÓN", reproduce el recorte en la misma pantalla con su etiqueta y, al terminar, otra cortina y vuelve al vivo. Si llega otra repetición mientras pasa una, corta a la nueva. Si no encuentra la cámara virtual, lo dice en pantalla y reintenta cada 5 s; si se cierra OBS, vuelve sola cuando OBS vuelve. `?cam=nombre` elige otra cámara.
- **La ventana de la tele se abre sola:** en Windows el agente abre esa página en Chrome o Edge a pantalla completa (modo kiosco), con un perfil propio que ya tiene permiso de cámara y de reproducir con sonido, así no hay que tocar nada en la tele. `ABRIR_TELE=0` lo desactiva y `TELE_POSICION` la manda a una segunda pantalla.
- Probado en un navegador headless con una cámara falsa: el vivo se ve, al llegar una repetición corta a ella y al terminar vuelve al vivo.

**Primera prueba real (2026-10-11): el vivo andaba, pero OBS se trababa.** En la notebook de Agus, con OBS, el agente y la página de la tele en Chrome, la vista previa de OBS se saturaba (es de dibujo, no de grabación: bajar a 720p, MJPEG y QuickSync ayudó poco). Agus confirmó que lo pesado era la página en Chrome: la PC dibujaba el video dos veces (OBS y Chrome, más la cámara virtual en el medio).

**Cambio: la tele es un proyector de OBS (`TELE_MODO=obs`, por defecto).** El agente arma en OBS una escena "PoolApp Tele" y la abre en un proyector a pantalla completa, así OBS dibuja la imagen una sola vez y no hacen falta Chrome ni la cámara virtual:
- Adentro tiene la escena de la mesa anidada (el vivo), una fuente de video para la repetición y dos carteles de texto, "● EN VIVO" y "REPETICIÓN". La escena de la mesa es la que esté en el Programa al arrancar, o la que diga `ESCENA_MESA`.
- Al guardar una repetición, el agente la recorta, la carga en esa fuente, la muestra con su cartel y la oculta cuando termina (con un tope por si OBS no avisa). Si llega otra mientras pasa una, corta a la nueva.
- Lo que se graba sigue saliendo de la escena de la mesa, así que las repeticiones no quedan adentro de los clips. El sonido de la repetición va solo a los parlantes (monitoreo), no a la grabación.
- El proyector va a la última pantalla o a `TELE_MONITOR`. Se cierra con Esc.
- No tiene la cortina animada: es un corte directo con cartel.
- Probado contra un OBS simulado (la secuencia entera de pedidos a OBS, mostrar la repetición y volver al vivo). Falta la prueba con OBS real.
- `TELE_MODO=navegador` deja la página en Chrome como antes, para una PC con resto.

**Segunda prueba (2026-10-11, noche): la repetición no aparecía y el recorte trababa OBS.** Dos problemas:
- La escena "PoolApp Tele" nunca está en el Programa, así que para OBS la fuente de la repetición nunca queda "activa": con "cerrar cuando está inactiva" cerraba el archivo y con "reiniciar al activarse" no lo arrancaba. Se apagaron las dos opciones (también en una fuente que ya existía de antes) y el video arranca al cargarlo; la repetición se hace visible antes de cargar el archivo.
- El recorte reencodeado con el procesador tardaba muchísimo y le sacaba CPU a OBS mientras grababa. Se pasó a un recorte por copia (`ffmpeg -c copy`, sin reprocesar), con el timer de respaldo en N + 15 s porque el corte arranca en el keyframe anterior. Se sumó un log de cuánto tarda OBS en guardar el buffer.
- Estos cambios quedaron en una copia suelta del agente en el Escritorio de la PC y recién entraron al repo con lo de la tercera prueba.

**Tercera prueba (2026-10-12): tiempos muy variables.** En la PC de la mesa, OBS tardó entre 2 y 10 s en guardar el buffer, y el recorte por copia tardó 0,9 s, 7,0 s y 25,7 s en tres repeticiones seguidas. Un recorte que solo copia bytes no tarda 25 s por el código: es el disco de la PC (lo más probable, el antivirus u OneDrive revisando cada .mp4 nuevo, más un buffer largo que hace archivos grandes). Además aparecieron cortes intermitentes de Supabase Realtime (`CHANNEL_ERROR` y después `SUBSCRIBED` de nuevo), y un pedido que llega durante el corte se perdía.

**Cambios (en `agent/replay-agent/replay-agent.js`):**
- **Repetición sin recorte en modo OBS:** el agente carga en la fuente de la tele el archivo que guardó OBS tal cual, consulta a OBS cada 100 ms (tope 3 s) hasta saber cuánto dura y salta a los últimos N segundos. Ya no escribe ningún archivo nuevo, así que no depende de cuánto tarde el disco en copiar. Puede verse un instante el principio del buffer antes del salto. Si OBS no dice la duración en 3 s, la pasa desde el principio y lo avisa en el log. El log ahora dice cuánto tardó en estar en la tele. El timer de respaldo para volver al vivo arranca después del salto (N + 5 s; sin salto, 90 s). El modo navegador y los clips siguen recortando con ffmpeg como antes.
- **Limpieza de los .mp4 de OBS:** antes los archivos que guarda OBS no se borraban nunca y llenaban la carpeta de grabaciones. Ahora, al pasar una repetición nueva, se borran las anteriores (nunca la que está en la tele; si OBS todavía tiene una abierta, queda para la próxima), y el archivo de un clip se borra al terminar de subirlo. Solo se borran archivos que OBS le avisó al agente que guardó.
- **Pedidos perdidos durante un corte de Realtime:** cada vez que el canal vuelve a `SUBSCRIBED`, el agente busca en `realtime_commands` los `mark_moment` y `save_clip` sin procesar de los últimos 30 s y los pasa en orden. Recuerda los ids ya manejados, así un pedido que llega por las dos vías no se hace dos veces. Depende de que el reloj de la PC esté bien (compara con `created_at` de la base).
- Probado contra un OBS y un Supabase simulados: carga del archivo, espera de la duración y salto, una repetición que pisa a otra antes del salto, sin duración (pasa desde el principio), timer de respaldo después del salto, vuelta al vivo, borrado de archivos (incluido uno "en uso"), clip, y pedidos recuperados sin repetir. Falta la prueba con OBS real: sobre todo confirmar que el salto en el archivo recién guardado se ve bien y cuánto dura el instante del principio del buffer.

**Cuarta prueba (2026-10-17): anda bien.** Agus probó en la mesa con OBS real la repetición sin recorte (`781c249`) y anda bien. Con eso queda cerrada esta parte.

**Lo que hay que saber en la PC de la mesa:**
- Para que tome lo nuevo hay que cerrar el agente (y la ventana vieja de Chrome, si quedó abierta) y volver a abrir `iniciar-agente.bat`. La cámara virtual de OBS ya no hace falta.
- No poner la escena "PoolApp Tele" en el Programa: se grabarían las repeticiones.
- El Modo de Estudio de OBS tiene que seguir apagado (ver 3.1).
- En OBS, Configuración → Salida → Buffer de repetición: poner el **Tiempo máximo en ~65 s** (cubre el botón de 1 minuto con un poco de margen; más largo hace archivos más grandes y más lentos de guardar).
- Si OBS sigue tardando varios segundos en guardar el buffer, excluir la carpeta de grabaciones de OBS del antivirus (Windows Defender → Exclusiones) y sacarla de OneDrive (que no esté en Documentos/Videos sincronizados).

### 6.6 Fase 3 — cuentas de club autogestionadas (2026-10-11)

**Pedido de Agus:** hasta acá solo el admin creaba clubs y decía quién los maneja. Pasa a ser autogestionado: cualquier cuenta real (no invitado) crea su club y queda como dueña; el dueño, además del admin, suma gente por celu; se pueden cargar partidos ya jugados sin mesa ni cámara; y `matches` deja la política `auth_write_all` (cualquier logueado escribe cualquier cosa), que nunca se había ajustado.

**Hecho (en main desde `1b76ad0`, migración corrida en producción el 2026-10-11):**
- `supabase/migrations/2026-10-11-fase3-clubs-autogestionados.sql` (idempotente; probada dos veces sobre una base tipo producción y sobre una desde cero, y con los permisos de cada rol):
  - `create_my_club(nombre, dirección, contacto)`: crea el club y la membresía de dueño en la misma transacción. Rechaza invitados.
  - `is_club_owner(club)` y `add_club_member_by_phone` abierta al dueño de ese club, con rol dueño o staff.
  - `log_match_result(club_id, p1, p2, score1, score2, winner_id, played_at)`: partido `finished` sin mesa. Solo miembros del club o admin, y los dos jugadores tienen que ser del club. Sin ganador gana el de más puntos; con empate hay que indicarlo. `played_at` es opcional, para cargar un partido de otro día.
  - `matches.created_by`, que lo pone la base. Un trigger toma el club de la mesa y no deja que nadie salvo el admin cambie el club, la mesa o el creador de una partida.
  - RLS nueva de `matches`. Borra **todas** las políticas que tenga la tabla, porque en producción hubo políticas cargadas a mano con nombres desconocidos (3.1), y crea:
    - leer: cualquier logueado, como antes;
    - crear: partida suelta cualquiera; en un club, sus miembros o el admin;
    - editar: admin, miembros del club, quien la creó o uno de los dos jugadores;
    - borrar: admin o miembros del club.
- `supabase-schema.sql` v1.5 con lo mismo.
- App:
  - 🏢 aparece para cualquier cuenta con celu. Sin club, la pantalla invita a crear uno.
  - El dueño ve "Dar acceso" (dueño o staff).
  - Cada club tiene "Cargar partido jugado" con sus jugadores, y pide el ganador si hay empate.
  - En Nueva partida solo se ofrecen las mesas de tus clubs.

**Decisiones tomadas en el camino (cambiables):**
- **Quién edita una partida:** Agus pidió escritura "solo para miembros del club de ese partido o admin, mismo criterio que `players`/`tables`". Tomado literal, el invitado que arranca una partida por el QR no podría mover su marcador, y una partida suelta solo la tocaría el admin. Por eso, igual que en `players` (donde edita el dueño y quien creó al invitado), también editan quien creó la partida y los dos jugadores si tienen cuenta. Borrar sí queda solo para el club y el admin.
- ~~**Jugadores "del club":** son los que tienen `players.club_id` de ese club. Un jugador que se registró solo (sin club) no entra en `log_match_result` hasta que exista lo de "socio de más de un club" (backlog, 6.7).~~ → desde 6.14 son los socios (`club_players`), y un jugador puede ser socio de varios clubs.
- Si alguien escanea el QR de una partida suelta ajena con su propia cuenta, no puede mover el marcador salvo que sea uno de los dos jugadores.

~~**Pendiente:** prueba real: crear un club con una cuenta que no sea admin, darle acceso a otro celu como staff, cargar un partido jugado y arrancar una partida por QR como invitado para confirmar que el marcador se mueve.~~ → probado por Agus el 2026-10-17.

### 6.7 Backlog (pedido de Agus, no bloquea)

- Login con Google.
- ~~Que un jugador sea socio de más de un club (hoy `players.club_id` es uno solo).~~ → hecho en 6.14.
- Modo "mesa sin cámara".
- Reclamo de perfil con aprobación del club (hoy el reclamo por celu se confirma solo con el OTP y el "¿sos vos?").
- Cartelería y consentimiento legal para clubes reales (se filma a la gente).
- Vista de todas las mesas desde una PC maestra.
- Edición automática con IA del partido completo.
- **Partido completo y editor de mejores momentos (propuesta, Agus 2026-10-19, para después de la Fase 5):**
  - El agente le pide a OBS que grabe desde que se abre la partida hasta que se cierra. El crudo en buena calidad (aprox. 1,2 GB por hora a 720p30 con codificador de hardware) queda en el disco de la PC de la mesa y no se sube.
  - Se sube una versión liviana en 480p (aprox. 0,3 GB por hora) para mirarla en la app, y se borra a las 48 h. Referencia: Supabase Pro trae unos 100 GB de almacenamiento y 250 GB de descarga (precios a confirmar); lo que más pesa es la descarga cuando la gente mira.
  - En la app se mira el partido y se marcan inicio y fin de cada momento. El agente corta esos tramos del crudo sin recodificar y sube solo los clips.
  - Al cerrar la partida, el agente detecta picos de sonido con ffmpeg y los propone como marcas que se pueden mover o borrar. La IA mirando el video queda descartada por ahora (cara y poco precisa con jugadas rápidas).
  - El Replay Buffer se mantiene para la repetición instantánea en la tele.
- **Tele de la mesa abierta con QR (pedido de Agus, 2026-10-17):** al abrir una mesa, el agente pone en la tele el vivo de la mesa en grande con el QR de la mesa, para entrar con cuenta o como invitado, y al arrancar la partida pasa a la pantalla de partida de siempre. Va junto con el HUD de la partida (marcador y QR) integrado en la transmisión de OBS, que se habló en otra conversación y todavía no está en este documento.
- **Rediseño visual de toda la app (pedido de Agus, 2026-10-17) — hecho, ver 6.10:** hoy se ve mal en el celu y en la PC. Por ejemplo, la pantalla de la mesa por QR (nueva partida) se sale del ancho del celu: se cortan el nombre, el selector de rival y el campo del celu. Hay que revisar el CSS completo, mobile primero. Va apenas se cierre la Fase 4 (Agus, 2026-10-18).
- `public/manifest.json` pide `/icon-192.png`, que no está en `public/` (el navegador avisa del error en la consola). Va con el rediseño. **Hecho (2026-10-18):** se agregaron `icon-192.png` e `icon-512.png` (cuadrado azul con una P blanca), junto con "Escanear QR"; en producción y probado.
- **El QR del control abre el navegador y no la app instalada (Agus, 2026-10-18):** Agus tiene la app instalada en la pantalla de inicio, en pantalla completa. Si escanea el QR del control con la cámara del celu, se abre una pestaña del navegador en vez de la app y le pide loguearse de nuevo, así que no parece una app nativa. Por qué pasa: la cámara siempre abre los links en el navegador. En iPhone, además, la app instalada no comparte la sesión con Safari, y eso no tiene arreglo en una web. En Android, Chrome a veces puede abrir la app instalada si el link está dentro de su `scope`. Opciones, de menor a mayor esfuerzo:
  1. Un botón "Escanear QR" dentro de la app, que usa la cámara con `BarcodeDetector` o una librería tipo jsQR. Así no se sale nunca de la app ni se pierde la sesión. Es lo más barato, y anda en iPhone y en Android.
  2. En Android, agregar `id`, `scope` y `launch_handler` al `manifest.json` para que los links de la app abran la app instalada. No sirve para iPhone.
  3. Una app nativa real (por ejemplo con Capacitor) que tome los links de la app con Universal Links / App Links. Lo resuelve del todo, pero agrega tiendas, revisiones y builds. Se evalúa más adelante.
  Recomendación: la opción 1 (más la 2, que es casi gratis) cuando se cierre el rediseño.
  - **En parte hecho (2026-10-18):** opciones 1 y 2. En producción (commit `828f5d2`). **Probado por Agus (2026-10-18):** "Salió todo correcto en las pruebas": escanear el QR de una mesa y el de control de la PC desde la app, un QR ajeno, y el ícono nuevo al reinstalar.
    - Botón "Escanear QR" en Partida, que abre la ruta `/partida/escanear`. Usa el lector nativo `BarcodeDetector` en Android y, si no está (iPhone), la librería `jsqr`. Acepta el QR de la mesa (`/mesa/:token`) y el QR de control de la PC (`/partida/:id/control`), con cualquier dominio. Con otro QR dice que no es de una mesa ni de una partida.
    - `manifest.json` con `id` y `scope`, fondo blanco y los íconos de 192 y 512 (`purpose: any maskable`), para que Android la instale como app de verdad. Más `apple-touch-icon` en `index.html`.
    - En iPhone la cámara del celu va a seguir abriendo Safari; ahí la solución es escanear desde adentro de la app. La app nativa (Capacitor, opción 3) queda para más adelante.

### 6.8 Fase 3 — cierre (2026-10-17)

Fase 3 cerrada: planes y límites (6.3), modelo de cuentas (6.4), vivo y repetición en la tele (6.5) y clubs autogestionados (6.6), todo en main, en producción y probado por Agus. Queda abierto, sin bloquear la Fase 4:
- **Cobro:** elegir proveedor (recomendado Mercado Pago) y poner precio a Plus y Pro. Mientras tanto, alta manual desde el SQL Editor (6.3).
- **CAPTCHA de Auth** antes de abrir mesas en un club real (6.4).
- ~~Pruebas no confirmadas al cierre: el límite del plan free y el reclamo de un jugador por celu~~ → probadas el 2026-10-17. Para probar sin SMS (Twilio todavía no está configurado) se usan números de prueba de Supabase (Authentication → Sign In / Providers → Phone → Test Phone Numbers and OTPs), con código fijo: `541100000000` (Pro), `541100000001` (gratis, dueña de un club de prueba) y `541100000002` (reclamo). Borrarlos antes de abrir a un club real.
- Falta jugar una partida entera como invitado por el QR de la mesa, desde una pestaña privada (la página del QR ya se probó con una cuenta). Ojo al probar: el QR de la mesa está en 🏢 Clubs → mesa → QR; el que aparece en la pantalla de la partida es otro (lleva al control de esa partida y pide login).
- Confirmar la primera corrida del job de borrado (nunca había corrido por falta de variables, 6.3): Vercel → Logs, `/api/cron/expire-clips`, después de las 7 UTC. 2026-10-18: la consulta en `clips` dio `vencidos_sin_borrar` = 0 y `borrados_hoy` = 0; no había nada vencido, así que todavía no se puede confirmar. Vercel Logs no está disponible en el plan Hobby: revisar por SQL o con Settings → Cron Jobs → Run.
- `agent/replay-agent/README.md` todavía dice que el buffer de repetición va en 60 s; lo correcto es ~65 s (6.5).

**Fase 4 — Publicar y compartir.** Feed o galería de clips públicos, compartir por link, descarga habilitada según plan.

### 6.9 Fase 4 — plan de arranque (2026-10-17, propuesta)

**De dónde se parte:** `clips.is_public` existe y un trigger ya impide publicar si el plan no lo permite (6.3). El bucket `clips` es público: cualquiera con el link baja el video, y la política `auth_upload_clips` deja subir archivos al bucket a cualquier logueado (los clips los sube el agente con la service key, así que no la necesita). La descarga se oculta en la app solo para el plan free.

**Orden propuesto (cada paso es un commit aparte):**
1. **Bucket privado y links firmados.** `clips` pasa a privado y la app pide links firmados con vencimiento corto para ver los clips. Se saca `auth_upload_clips`. No cambia nada a la vista: es la base para que "descargar según plan" y "público o privado" sean reales y no solo un botón escondido.
2. **Descarga según plan, de verdad.** El link de descarga lo firma una función en `api/` que antes verifica el plan del usuario.
3. **Publicar y despublicar.** Botón en el clip para su dueño (con plan Plus o Pro, que ya lo controla el trigger). Cualquiera de los dos jugadores con cuenta puede despublicarlo, porque sale en el video.
4. **Página de clip compartible** (`/c/:id`): un clip público se puede ver por link sin login. Para que el link muestre la miniatura al compartirlo por WhatsApp hace falta una función en `api/` que devuelva las etiquetas de vista previa, porque la app es una SPA.
5. **Feed de clips públicos:** galería de los clips publicados, con filtro por club.

**Decidido con Agus (2026-10-17):**
- El link de un clip público se ve sin login; el feed, solo con cuenta.
- Publicar no necesita el OK del rival, pero el rival lo puede despublicar.
- Moderación y "reportar": siguen en la Fase 5. Antes de abrir el feed a cualquiera conviene al menos un botón de reportar.

**Paso 1 — hecho y en producción (2026-10-17, `3657fd0` y `883478d`; migración corrida y probada por Agus):**
- Migración `supabase/migrations/2026-10-17-fase4-clips-privados.sql` (idempotente, también en `supabase-schema.sql` v1.6): el bucket `clips` pasa a `public = false`, se sacan `public_read_clips` y `auth_upload_clips`, y entra `auth_read_clips`, que deja leer el bucket (lo que hace falta para firmar un link) a cualquier usuario autenticado. Es la misma regla que hoy tiene la tabla `clips` (`auth_read_all`), así que no se abre ni se cierra nada respecto de las filas. Los invitados (Anonymous sign-ins) cuentan como autenticados, igual que en la tabla.
- App: `src/services/ClipService.js` firma video y miniatura con `createSignedUrls` (1 hora, una llamada cada 100 archivos) al traer la lista de clips, y devuelve los links firmados en `video_url` y `thumbnail_url`, así `ClipList` no cambia. El botón de descarga sigue escondido para el plan free, como hasta ahora, y usa el mismo link firmado con `&download=`.
- Lo que se encontró: el agente guarda en `clips` la URL pública del video (`video_url`), la de la miniatura (`thumbnail_url`) y la ruta del video (`storage_path`, `<match_id>/<clip_id>.mp4`); la miniatura vive en el mismo bucket, al lado del video (`.jpg`), pero su ruta no se guarda. La app usa `storage_path` para el video y saca la ruta de la miniatura de su URL pública (lo que va después de `/object/public/clips/`), así que las filas viejas siguen andando. **El agente no se toca:** sube con la service key (no necesita políticas) y la URL pública que guarda sirve de referencia aunque ya no abra; así no hay que actualizar la PC de la mesa. El job de borrado (`api/cron/expire-clips.js`) usa `storage_path` y la service key, tampoco cambia.
- **Encontrado en producción (2026-10-17):** el storage tenía dos políticas armadas a mano desde el panel, `public_select 1oj01fe_0` (SELECT) y `public_upload 1oj01fe_0` (INSERT), con rol public y sin filtrar por bucket: cualquiera, sin login, podía leer y subir archivos en cualquier bucket, incluido `clips`. Tampoco estaban `public_read_avatars` ni `auth_upload_avatars` del esquema; la subida de fotos de perfil (`uploadAvatar`, un `.upload` simple, sin upsert) andaba gracias a `public_upload`. La misma migración saca las dos y recrea las de avatars tal como están en `supabase-schema.sql`: subir una foto de perfil pasa a exigir login, como siempre quiso el esquema.
- **Pasado a producción el 2026-10-17:** primero se desplegó la app y después se corrió la migración (al revés, la app vieja deja de mostrar videos apenas el bucket es privado). En `storage.objects` quedaron solo `auth_read_clips`, `public_read_avatars` y `auth_upload_avatars`. Probado: clips y miniaturas en Clips y en el perfil, descarga con plan pago, el link público viejo ya no abre y la foto de perfil se sube logueado.
- **Queda:** un link firmado vence a la hora; si alguien deja la pantalla abierta más de una hora, el video no carga hasta recargar la página. Si molesta, se puede volver a firmar al dar play. La descarga sigue dependiendo solo de esconder el botón: cualquiera logueado puede firmar un link; eso lo resuelve el paso 2. Más adelante, si se quiere, el agente puede dejar de guardar URLs públicas y guardar la ruta de la miniatura.

**Paso 2 — hecho y en producción (2026-10-17, `b21275a` y `71a708e`):**
- **Por qué:** con `auth_read_clips` (paso 1) cualquier usuario logueado, invitados incluidos, podía firmar desde el navegador un link de cualquier clip, también el de descarga. Esconder el botón según el plan no alcanzaba, y además cualquiera veía los clips de todos.
- Migración `supabase/migrations/2026-10-17-fase4-firma-servidor.sql` (idempotente, también en `supabase-schema.sql` v1.7): saca `auth_read_clips`. El bucket `clips` queda sin políticas para la app.
- Función `api/clips/sign.js` (Vercel, con `SUPABASE_URL` y `SUPABASE_SERVICE_KEY`, las mismas del job de borrado): valida la sesión con el token del usuario y firma los links con la service key. **Quién ve un clip:** los dos jugadores de la partida (el jugador con `user_id` del usuario), quien lo guardó (`owner_id`), la gente del club de la mesa (`club_members`) y el admin. Links para ver: 1 hora. Link de descarga: 5 minutos, solo para una cuenta real (no invitado) con `plan_for_user(uid).can_download`; si no, 403.
- App: `ClipService` pide los links a la función en vez de firmarlos y deja solo los clips que la función devuelve, así que la pantalla Clips ya no muestra los clips de todo el mundo. El botón Descargar pide el link al tocarlo y avisa si el plan no alcanza. El agente y el job de borrado no cambian.
- **Ojo:** `npm run dev` (Vite) no sirve las funciones de `api/`; para probar en local hace falta `vercel dev`, o probar en producción.
- **Para pasar a producción:** push, esperar que el deploy de Vercel diga Ready y después correr la migración en el SQL Editor (al revés, la app vieja deja de mostrar videos).
- **Pruebas:** ver clips y miniaturas con un plan gratis y con uno pago (en Clips y en el perfil); descargar con plan pago; con plan gratis, la descarga da 403 aunque se llame a la función a mano; un invitado o un usuario ajeno a la partida y al club no ve el clip; desde el navegador ya no se puede firmar un link (`createSignedUrl` falla).
- **Pasado a producción el 2026-10-17:** deploy y después la migración, corrida por Agus en el SQL Editor (`auth_read_clips` ya no está).
- **Probado por Agus (2026-10-17):** con Pro se ven los clips y se descargan; la cuenta gratis ve solo sus clips y al descargar le aparece el aviso del plan; un invitado no ve clips ajenos.
- **Encontrado al desplegar (2026-10-17):** la función devolvía 500 sin detalle (`FUNCTION_INVOCATION_FAILED`). En Vercel faltaban `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` y `CRON_SECRET` (nunca se habían cargado, ver 6.3). `71a708e` hace que la función avise qué variable falta y devuelva el mensaje de cualquier error, que la app muestra en la pantalla Clips. Agus cargó las tres y redesplegó. Además, una pestaña abierta desde antes del deploy sigue con la app vieja (es una SPA): después de un deploy hay que recargar.
- **Queda:** la app trae todas las filas de `clips` y la función filtra cuáles se ven. Con muchos clips conviene filtrar en la base, ajustando la RLS de la tabla `clips` con la misma regla (Fase 5). Los links para ver siguen venciendo a la hora sin volver a pedirse al dar play.

**Paso 3 — hecho y en producción (2026-10-17, `94ca60a`):**
- **Quién publica:** quien guardó el clip (`owner_id`), con cuenta real (no invitado) y un plan con `can_publish` (Plus o Pro); el clip tiene que estar listo y sin vencer. No hace falta el OK del rival (decidido con Agus). Es lo que decía el plan de arriba ("su dueño"); un jugador que no guardó el clip no lo puede publicar.
- **Quién despublica:** quien lo guardó, cualquiera de los dos jugadores con cuenta, la gente del club de la mesa y el admin, sin importar el plan. Si lo despublica alguien que no es el dueño, queda trabado (`clips.publish_blocked_by`): el dueño ya no lo puede volver a publicar, así el rival no tiene que despublicarlo una y otra vez. Para destrabarlo, hoy, a mano desde el SQL Editor.
- Migración `supabase/migrations/2026-10-17-fase4-publicar.sql` (idempotente, también en `supabase-schema.sql` v1.8): suma `clips.published_at` y `clips.publish_blocked_by`, y un índice parcial sobre `is_public` para el feed. Solo agrega columnas.
- Función `api/clips/publish.js`: publica o despublica con la service key. La app sigue sin poder escribir `clips` (solo tiene la política de lectura, Fase 3). Como con la service key `auth.uid()` es NULL, el trigger `enforce_clip_publish` no corre por este camino: la función revisa el plan por su cuenta.
- La lógica compartida de `sign.js` y `publish.js` (sesión, quién ve qué, rutas del bucket, errores como JSON) pasó a `api/_lib/clips.js`; Vercel no publica como función nada de una carpeta que empieza con `_`.
- `sign.js`: un clip público lo ve cualquiera con sesión, invitados incluidos, y además devuelve `can_publish` / `can_unpublish` para que la app sepa qué botón mostrar. Ojo: con un plan con descarga se puede bajar cualquier clip público.
- App: en cada clip, etiqueta "Público" y botón 🌐 Publicar / 🔒 Despublicar cuando corresponde, con el motivo si la función lo rechaza (por ejemplo "Tu plan no permite publicar"). Todavía no hay feed ni link para compartir (pasos 4 y 5): por ahora un clip público solo se ve en la pantalla Clips de cualquiera con sesión.
- **Para pasar a producción:** correr la migración ANTES del push (solo agrega columnas, la app actual no se entera), después push y esperar que Vercel diga Ready. Al revés no: `sign.js` lee `publish_blocked_by` y, sin la columna, la pantalla Clips da error.
- **Pasado a producción el 2026-10-17:** Agus corrió la migración en el SQL Editor antes del push; después se desplegó `94ca60a`.
- **Probado por Agus (2026-10-18):** todas las pruebas de abajo funcionan.
- **Pruebas:** con Pro, publicar un clip que guardaste (aparece "Público"); con la cuenta gratis, guardar uno y ver que no aparece Publicar (y que la función da 403 si se la llama a mano); entrar como el rival o como staff del club y despublicarlo; volver con el dueño y ver que ya no puede publicarlo ("Uno de los jugadores lo despublicó"); el dueño despublica el suyo y lo puede volver a publicar; una cuenta ajena ve el clip público pero sin botón.

**Paso 4 — hecho y en producción (2026-10-18, `f8360a8`):**
- Página pública `/c/:id` (`src/clips/ClipPublico.jsx`), sin login, como `/mesa/:token`: video, jugadores, club y mesa, fecha y duración, y un link "Abrir PoolAppDeluxe". Sin descarga. Si el clip no existe, no es público, no está listo o venció: "Este clip no está disponible".
- `api/clips/public.js` (GET, sin sesión): devuelve el clip solo si es público, está listo y no venció, con video y miniatura firmados por 1 hora y solo lo que se muestra (nombres, club, mesa, fecha, duración; ningún id de usuario ni de jugador).
- **Vista previa para WhatsApp:** quien arma la vista previa no corre JavaScript, así que `vercel.json` manda `/c/:id` a `api/share.js`, que toma el `index.html` del mismo deploy (lo pide a `https://<host>/index.html`: lo genera `vite build` con los nombres de archivos de cada deploy, y así no hay que empaquetarlo en la función), le agrega `og:title` ("Agus vs Nano"), `og:description` (club · mesa · fecha · duración), `og:image`, `og:url`, `og:type` y las de Twitter, todo escapado, y lo devuelve; en el navegador la app arranca igual. Un clip que no es público recibe la vista previa genérica, sin datos del clip.
- `og:image` apunta a `api/clips/thumb.js?id=`, una URL que no cambia y redirige (302) a una miniatura firmada nueva; si el clip no es público o no tiene miniatura, a `public/og-default.jpg` (1200×630, sacada del fondo de la app). La vista previa y la redirección quedan 5 minutos en la CDN de Vercel: un clip despublicado puede seguir mostrando su vista previa hasta 5 minutos, y WhatsApp guarda las suyas por su cuenta.
- App: en un clip público, botón 🔗 Compartir: abre el menú de compartir del celu y, si no hay, copia el link (`<dominio>/c/<id>`) y avisa "Link copiado".
- **No hace falta migración.**
- **Para pasar a producción:** push y esperar que Vercel diga Ready.
- **Probado por Agus (2026-10-18):** funciona, incluida la vista previa en WhatsApp. Antes, con un id inventado: `/c/<id>` da la vista previa genérica, `public` 404, `thumb` redirige a `og-default.jpg`.
- **Pruebas:** publicar un clip y tocar Compartir; abrir el link en una pestaña privada (se ve sin login, sin descarga); mandarse el link por WhatsApp y ver la miniatura con "Jugador vs Jugador"; despublicarlo y abrir el link otra vez ("Este clip no está disponible"); un link con un id inventado da lo mismo.

**Paso 5 — hecho y en producción (2026-10-18, `dfa92bc`):**
- Pantalla `/feed` (ícono 📺 en la barra): los clips públicos de todos, del más nuevo al más viejo por `published_at`, de a 20 con "Cargar más", y filtro por club (solo aparecen los clubs que tienen clips públicos). Solo con cuenta real: a un invitado le dice "Creá tu cuenta para ver el feed". Usa la misma grilla que Clips: Compartir, Descargar según el plan y Despublicar para quien puede (paso 3).
- `api/clips/feed.js`: pide sesión de cuenta real (un invitado recibe 403), devuelve solo clips públicos, listos y sin vencer, con video y miniatura firmados por 1 hora, sin ids de usuarios ni de jugadores. Un clip sin mesa no aparece en el feed (el filtro por club sale de la mesa).
- **Reportar:** botón 🚩 Reportar en los clips del feed y en `/c/:id` para quien tiene cuenta, con un motivo opcional. `api/clips/report.js` guarda un reporte por usuario y clip en la tabla nueva `clip_reports` (si ya lo había reportado: "Ya lo reportaste"). No hace nada automático: el admin los revisa desde el SQL Editor (`select * from clip_reports order by created_at desc`). La moderación de verdad sigue en la Fase 5.
- Migración `supabase/migrations/2026-10-18-fase4-feed.sql` (idempotente, también en `supabase-schema.sql` v1.9): tabla `clip_reports` con RLS y sin políticas (la app no la lee ni la escribe; escribe la función con la service key) e índice de `clips` por `published_at` para el feed.
- **Para pasar a producción:** correr la migración ANTES del push (`report.js` escribe en `clip_reports`), después push y esperar que Vercel diga Ready.
- **Pasado a producción el 2026-10-18:** Agus corrió la migración antes del push. **Probado por Agus (2026-10-18):** funciona todo.
- **Pruebas:** con una cuenta, entrar al feed y ver los clips publicados; filtrar por club; con más de 20 publicados, "Cargar más"; como invitado (pestaña privada desde el QR de una mesa) el feed pide cuenta; reportar un clip desde el feed y desde `/c/:id`, y la segunda vez "Ya lo reportaste"; ver el reporte en `clip_reports`; despublicar desde el feed (como jugador) y que desaparezca al recargar.

**Costo a vigilar:** la transferencia, no el storage. Con Supabase Pro, 250 GB son ~96.000 reproducciones de un clip de 1 minuto por mes (6.3).

**Fase 5 — Endurecer para producción real.** Ajustar las políticas RLS (hoy abiertas a "cualquier autenticado"), moderación de contenido público, monitoreo de mini-PCs (saber si una cámara se cayó), limpieza del código muerto y validaciones pendientes del punto 3.

### 6.10 Rediseño visual y de navegación (2026-10-18)

- **Estilo:** minimalista y neutral al deporte. Fondo claro u oscuro según el dispositivo, un solo acento azul, letra Plus Jakarta Sans, sin foto de fondo ni emojis.
- **Barra de 5 lugares:**
  - **Inicio:** feed de clips en una columna, tipo Instagram. Reemplaza Clips y Feed; `/clips` y `/feed` redirigen a `/`.
  - **Buscar:** jugadores y clubs en pestañas. Reemplaza Jugadores y la lupa. Página nueva de club, `/club/:id`, con sus mesas, jugadores y clips públicos.
  - **Partida:** nueva partida, partidas en curso e historial. Reemplaza Historial; `/historial` redirige a `/partida`.
  - **Mi club:** aparece solo si la cuenta maneja un club. Si no, "Crear mi club" está en Perfil > Opciones.
  - **Perfil:** perfil propio con estadísticas, partidas, clips y Opciones (club, suscripción, cerrar sesión).
- El QR de la mesa sigue llevando directo al control.
- No toca la base de datos.
- **Pasado a producción el 2026-10-18** (commit `8a29943`, sin migración). **Primera prueba de Agus en producción (2026-10-18):** "anda re bien al parecer". Después probó en producción, y funcionan (Agus, 2026-10-18, "Funcionan las 3"):
  1. Entrar por el QR de una mesa: el control suma puntos y guarda el clip.
  2. Abrir un club desde Buscar.
  3. Cerrar sesión desde Perfil y volver a entrar.
- **Escanear QR dentro de la app (2026-10-18), en producción y probado (`828f5d2`):** botón "Escanear QR" en Partida (`/partida/escanear`), y manifest con `id`, `scope` e íconos para que Android la instale como app. Detalle en 6.7.
- **Ícono nuevo (2026-10-19):** M blanca redondeada con un punto azul sobre fondo oscuro (`public/icon-192.png`, `icon-512.png`, `icon.svg`); también reemplaza el favicon de Vite. Pendiente: reinstalar la app en los celus para verlo.

### 6.11 Arranque real: base en cero y login con Google (2026-10-18)

- **Base en cero:** Agus borró todos los datos de producción (jugadores, clubs, mesas, partidas, clips, perfiles y usuarios de Auth) y vació los buckets `clips` y `avatars`. Quedaron la estructura y la tabla `plans`. Se encontró que producción no tiene la tabla `interactions`, aunque `supabase-schema.sql` la crea.
- **Login con Google:** botón "Continuar con Google" arriba del login por celu (`signInWithOAuth`, vuelve a la página de la que venía).
  - Una cuenta de Google no tiene celu: no puede reclamar un jugador cargado por un club con su número; crea el suyo con su nombre.
  - Para dar acceso a un club ahora se acepta el celu o el mail (migración `2026-10-18-login-google.sql`, misma función `add_club_member_by_phone`).
  - Un invitado de mesa que entra con Google pasa a su cuenta de Google; la sesión de invitado no se une (con celu sí se une).
- **Pendiente:** activar el proveedor Google en Supabase (credencial OAuth de Google Cloud) y agregar la URL de la app en Auth → URL Configuration; correr la migración; SMS reales con Twilio Verify.

### 6.12 Primera prueba real de clips en la mesa (2026-10-19)

- **Qué se encontró:** en la PC de la mesa los clips salían a ~1 fps, el primero tardó todo el partido en subirse y una repetición tardó 103 s en guardarse. Las estadísticas de OBS marcaban un 70 % de fotogramas omitidos por retraso en la codificación: OBS grababa a 60 fps con un codificador que no daba abasto, y el agente además recodificaba cada clip con x264 en la CPU al mismo tiempo, sin fila (varios ffmpeg a la vez).
- **Qué se hizo en el agente:** los clips se cortan copiando el video de OBS sin recodificar (si pasan de 45 MB se recodifican a 720p como antes), se procesan de a uno en fila sin frenar la repetición, y ffmpeg corre con prioridad baja.
- **Configuración de OBS en la mesa:** codificador de hardware, 1280x720 a 30 fps, intervalo de fotogramas clave 1 s, Replay Buffer en 65 s (README del agente actualizado).
- **Pendiente:** probar en la mesa con la configuración nueva de OBS y el agente actualizado; confirmar fotogramas omitidos cerca de 0 % y el peso de un clip de 60 s.

### 6.13 Mesa e invitado desde Nueva partida (2026-10-19)

- **Abrir/cerrar mesa y QR, en Nueva partida:** al elegir una mesa se ve si está abierta, cerrada o en partida, con un botón para abrirla o cerrarla; abierta, muestra ahí su QR para subirse (el mismo QR fijo de 6.4). Solo aparecen las mesas de tus clubs (todas si sos admin), así que quien la ve es del club. En Mi club (Clubs y mesas) quedó solo la gestión: agregar, borrar y copiar el ID de la mesa.
- **Jugar contra un invitado:** en Jugador 2 hay una opción "Invitado (sin cuenta)" con nombre libre. Al arrancar se crea un jugador invitado (`is_guest`, sin club ni dueño), el mismo mecanismo que usa la página del QR, así que si después entra con su celu puede reclamarlo. No hizo falta migración.
- ~~Pendiente: probarlo en producción~~ → probado por Agus el 2026-10-19.
- **Arrancar desde el celu va directo al control:** antes, al crear una partida desde el celu se abría la pantalla con el QR para controlarla desde un celu, y para llegar a los botones de repetición había que salir y volver a entrar. Ahora desde un celu (pantalla táctil) va al control; desde la PC sigue mostrando el QR.
- **Punto rojo que parpadea** en las partidas en curso de las listas (Partida e historial).
- **Eliminar clips:** botón "Eliminar" en el clip, solo para la gente del club de la mesa y el admin (decidido con Agus: los jugadores, incluido quien lo guardó, solo publican o despublican). Lo hace `api/clips/delete.js` con la service key: borra el video y la miniatura del bucket y después la fila (los reportes se van en cascada). `api/clips/sign.js` devuelve `can_delete` para mostrar el botón. No hizo falta migración.
- ~~Pendiente: probar eliminar un clip~~ → probado por Agus el 2026-10-19.
- **Disciplina por mesa (pool o ping pong):** una misma mesa física (misma cámara y misma PC con su `TABLE_ID`) puede usarse para pool o ping pong, sin crear una mesa por disciplina. La mesa guarda la disciplina que tiene ahora (`tables.discipline`) y la gente del club la cambia en Nueva partida, antes de arrancar. Cada partida guarda con qué disciplina se jugó (`matches.discipline`): en una mesa la copia un trigger desde la mesa (así también la que se arranca por QR, sin tocar `start_match_at_table`); sin mesa la elige quien la crea. El agente no cambia. El marcador sigue igual (puntos enteros); no se generaliza (sección 8). La disciplina se ve en la partida y, si es ping pong, en las listas. Migración `2026-10-19-disciplina.sql`.
- ~~Pendiente: correr la migración y probar ping pong en la mesa y por QR~~ → migración corrida y probado por Agus el 2026-10-19. Queda borrar la mesa "Ping Pong" de The House si ya no hace falta.
- **Renombrar mesa:** botón "renombrar" en cada mesa de Mi club (Clubs y mesas). El ID no cambia, así que el `TABLE_ID` del agente sigue sirviendo.
- **Perfil con pestañas, como Instagram:** debajo de las estadísticas, una fila de íconos que cambia de sección: clips (la que se abre primero), historial y, en tu propio perfil, opciones (club, suscripción, cerrar sesión). En el perfil de otro jugador la pestaña de opciones queda vacía por ahora: más adelante, desafiarlo o arreglar un partido para un horario (idea de Agus).
- **Pendiente (pedido de Agus):** mejorar los historiales para ver datos cruzados (por ejemplo, el cara a cara contra un rival).
- **Borrar un jugador con partidas:** fallaba con `matches_player2_id_fkey` porque en producción las claves de jugadores en `matches` no tenían `ON DELETE SET NULL` (`supabase-schema.sql` sí lo dice, pero la tabla era anterior). Migración `2026-10-19-borrar-jugador.sql`: las rehace, así las partidas quedan y el jugador borrado sale como "Jugador". Pendiente: correrla y probar borrar el perfil de prueba.

### 6.14 Socios del club con doble consentimiento (2026-10-22)

- **Qué se encontró:** probando la app, la única forma de sumar a alguien con cuenta propia a un club era darle staff por mail, que es acceso para administrar el club. "Ser del club" era `players.club_id`, que solo tienen los jugadores que cargó el club.
- **Decisión (Agus, 2026-10-22):** nadie se suma a un club sin que el club lo apruebe, y el club no suma a nadie sin que el usuario lo autorice, salvo los jugadores que carga el propio club para gente que no usa la app. Se eligieron las dos vías: solicitud del jugador e invitación del club.
- **Qué se hizo:**
  - Tabla `club_players` (club, jugador, `status` pendiente/activo, `requested_by` jugador/club). Nadie la escribe directo; todo pasa por funciones que validan quién puede: `request_join_club` (el jugador pide), `invite_to_club` (dueño o staff invita a un jugador con cuenta), `accept_club_membership` (acepta solo el lado que no arrancó: la invitación el jugador, la solicitud el club) y `remove_club_membership` (el jugador se va, rechaza o cancela; el club lo saca, rechaza o cancela). Si el jugador pide y el club ya lo había invitado, o al revés, queda adentro directo.
  - Los socios activos los ve cualquiera; lo pendiente, solo el jugador, la gente del club y el admin.
  - Los jugadores que carga el club quedan socios solos (trigger). Los que ya existían pasaron a ser socios de su club. Si después la persona reclama su perfil, sigue siendo socia y puede irse.
  - Un jugador puede ser socio de varios clubs. `players.club_id` queda como "el club que lo cargó" (quién lo edita), y `club_members` (dueño/staff) solo para quien administra.
  - `log_match_result` ahora pide que los dos jugadores sean socios activos, y el límite de jugadores del plan del club cuenta socios activos.
  - Pantallas: en la página del club, "Pedir sumarme" / cancelar / aceptar o rechazar la invitación / "Salir del club", y la lista pasa a ser de socios. En Mi club, una sección Socios con solicitudes para aprobar o rechazar, invitaciones enviadas para cancelar y los socios para sacar. En el perfil de otro jugador con cuenta, pestaña de opciones: "Invitar" a cada club que manejás. En tu perfil, arriba, las invitaciones para aceptar o rechazar, y en opciones los clubs de los que sos socio.
  - Migración `2026-10-22-socios-club.sql`, probada en un Postgres local: corrida dos veces sin errores y 20 casos de permisos (pedir, invitar, aprobar, aceptar, salir, sacar, intentos sin permiso, invitar a alguien sin cuenta, escribir la tabla directo, partido jugado con y sin socios, límite del plan). Ahí apareció y se cerró un agujero: una cuenta sin jugador podía aceptar una invitación ajena por una comparación con NULL.
- **Pendiente:** push y después correr la migración en producción (hasta correrla, las pantallas nuevas dan error al leer `club_players`); probar en producción con dos cuentas: pedir y aprobar, invitar y aceptar, salir.
- **Pendiente (idea):** avisar de una invitación o solicitud nueva con un número en la barra de navegación.

### 6.15 Pool sin marcador, equipos y práctica (2026-10-22)

- **Pool se juega a ganador:** pedido de Agus. En pool el control, la pantalla de la partida y las listas muestran solo quién ganó, sin puntos ni botones +1/−. Ping pong sigue con marcador. Las partidas nuevas de pool se crean sin puntos. La migración les borra el marcador a las de pool ya jugadas; si alguna terminó sin ganador, antes le pone el que tenía más puntos.
- **Equipos (2 vs 2, 3 vs 3), en pool y ping pong:** en Nueva partida, "+ Sumar jugador por lado" pasa a 2 vs 2 y después a 3 vs 3 (y se puede volver). Cada lugar acepta un jugador cargado o un invitado. Modelo: `player1_id` y `player2_id` siguen siendo el primero de cada lado, así clips, permisos (RLS de `matches`) y el agente no cambian; el resto de cada equipo va en la tabla nueva `match_teammates` (`match_id`, `player_id`, `side`). El ganador sigue en `winner_id` (el primero del equipo que ganó) y la partida cuenta como ganada para todo su equipo. La función `can_edit_match` decide quién carga compañeros (lo mismo que `matches_update`).
- **Práctica (amistoso o entrenamiento):** en Nueva partida, Tipo: Partido o Práctica (`matches.mode`: `match` | `practice`). La práctica no tiene puntos ni ganador, se termina con "Terminar práctica", queda en el historial marcada como práctica (sin G/P) y no suma a jugadas, ganadas ni porcentaje del perfil.
- Migración `2026-10-22-equipos-practica.sql`. Es aditiva: el código anterior sigue andando con ella corrida, y el código nuevo necesita la tabla `match_teammates`, así que esta vez va **primero la migración y después el push**.
- **Pendiente:** armar equipos y práctica desde el QR de la mesa (hoy por QR es 1 vs 1 de partido); que los compañeros de equipo (no el primero de cada lado) también vean y publiquen los clips de la partida (hoy los clips quedan para `player1`/`player2`); "Cargar partido jugado" de Mi club sigue pidiendo puntos también en pool (se guardan pero no se muestran).
- **Pendiente:** correr la migración y probar en producción: pool 1 vs 1 a ganador, 2 vs 2 en pool y ping pong, una práctica, y que las partidas viejas de pool se vean sin marcador.

## 7. Próximo paso concreto

**Actualizado 2026-10-18:** Fases 1, 2 y 3 cerradas (lo que queda abierto de la 3, incluido el cobro, en 6.8). Siguiente: Fase 4, arrancando por el paso 1 de 6.9 (bucket privado y links firmados), que ya está en producción y probado. El paso 2 (links firmados por el servidor y descarga según plan) también está en producción y funciona. El paso 3 (publicar y despublicar) también está en producción y probado. El paso 4 (página de clip compartible, `/c/:id`, con vista previa para WhatsApp) también está en producción y probado (6.9). El paso 5 (feed de clips públicos y Reportar) también está en producción y probado (6.9). **Fase 4 cerrada (2026-10-18).** Rediseño visual hecho, en producción y probado (6.10). "Escanear QR" dentro de la app y los íconos para instalarla (6.7) también en producción y probados. En iPhone la cámara del celu sigue abriendo Safari: se escanea desde la app; la app nativa queda para más adelante. Siguiente: la Fase 5.

## 8. Expansión a otros deportes (tenis y lo que siga)

**Decisión (2026-09-27):** para "vender" esto a distintos clubes, el camino elegido es armar **una app personalizada por cliente** — cada club recibe una instancia propia adaptada a su deporte — en vez de un único producto multi-tenant donde todos los clubes compartan el mismo motor con un skin distinto. Es más trabajo de mantenimiento a largo plazo si esto crece a muchos clientes, pero es más simple y más rápido de vender caso por caso, que es lo que importa ahora.

**Orden de trabajo:** no se toca nada de esto todavía. Primero se termina de validar PoolAppDeluxe — pruebas de cámara en la mesa de pool de casa de Agus, y después (ojalá) una instalación real en un club de pool. Recién cuando ese sistema esté funcionando de punta a punta, se porta a un club de tenis (el profe de tenis de Agus) como segundo cliente/caso de venta.

**Qué se reutiliza tal cual (agnóstico al deporte):**
- El pipeline de video completo: cámara fija + mini-PC, buffer rotativo, comandos `mark_moment` (repetición) y `save_clip` (guardado) por Supabase Realtime, subida a storage.
- Auth por SMS/OTP, perfiles de usuario, y — cuando se construya en la Fase 3 — el motor de suscripciones/paywall.
- El concepto de club → cancha/mesa → sesión, que ya se generalizó en la sección 4 (`clubs`, `tables`, `devices`).

**Qué NO se reutiliza tal cual — es específico de cada deporte:**
- **El marcador.** `matches.score1`/`score2` como enteros simples funciona para pool (se suman puntos) pero no para tenis (sets, games, puntos, ventajas, quién saca) ni para la mayoría de otros deportes. Cuando llegue el momento de portar a tenis, esto va a necesitar su propio modelo de marcador — no generalizarlo de antemano sin un segundo caso real, para no adivinar mal.
- Terminología y textos de la UI ("Jugadores", "Partidas" → en tenis serían "Partidos", "Sets", etc.).
- Encuadre/montaje de cámara: pool es cenital sobre una mesa chica; una cancha de tenis es mucho más grande, va a necesitar otro ángulo/lente (probablemente lateral o desde una altura mayor, a definir cuando llegue ese momento).

**Nota para no perder de vista mientras se sigue con pool:** no hace falta diseñar el "motor multi-deporte" ahora. Alcanza con evitar, donde sea gratis hacerlo, dejar la lógica de marcador y las partes específicas de pool bien separadas del resto (auth, video, suscripciones) para que portar a tenis más adelante sea más armar-de-nuevo-esa-parte que reescribir todo.

## 9. Veredicto de escalabilidad para producción masiva (2026-10-06)

Agus preguntó directamente si este esquema aguanta producción en serio, con muchos clubes. Respuesta honesta, en dos partes:

**Lo que sí aguanta tal cual:** Supabase (Postgres + Auth + Realtime + Storage) y Vercel no son herramientas de prototipo — soportan carga de producción real. Lo único que cambia con la escala es pasar a un plan pago de Supabase antes de tener clientes de verdad: no solo para que el proyecto no se pause por inactividad (ya nos pasó probando), sino porque el plan free tiene un límite de conexiones simultáneas de Realtime que con varios clubes activos a la vez se supera. Es una decisión de cuándo pagar, no de cambiar de arquitectura.

**Lo que NO aguanta "muchos clubes sin que Agus esté encima" — y está bien que sea así por ahora:** OBS + el agente corriendo a mano en cada PC es ideal para validar la idea y hasta para los primeros clientes reales (ahí Agus va a estar presente instalando igual). Pero OBS es software pensado para que un humano lo mire, no un servicio desatendido: no se reinicia solo si se cuelga, no avisa si una cámara se desconectó en un club donde nadie de PoolAppDeluxe está presente, y cada instalación nueva repite toda la configuración a mano. Para escalar a muchos clubes sin visitar cada uno, esto eventualmente se reemplaza por: un servicio propio (no OBS) corriendo como proceso del sistema operativo con reinicio automático, una imagen de SO pre-armada para cargar en cada mini-PC nueva en vez de instalar todo de cero, y monitoreo remoto (la tabla `devices` de la sección 4 ya tiene `last_seen_at` pensado para esto). Esto ya estaba cubierto por la Fase 5 ("endurecer para producción real") — no es una sorpresa nueva, es simplemente confirmar que corresponde hacerlo después de validar que el producto se vende, no antes.

**El otro factor de escala a no perder de vista:** el costo de storage/egress de video (sección 5, punto 7) crece con la cantidad de clubes y clips — ahí es donde más rápido sube la factura a medida que esto crece, más que en la base de datos en sí.

**Conclusión:** no cambiar nada del esquema actual ahora. Es el orden correcto — validar barato primero, endurecer después — y las dos cosas que no escalan (OBS manual, storage de video) ya estaban identificadas como trabajo de una fase posterior, no como errores de diseño de hoy.
