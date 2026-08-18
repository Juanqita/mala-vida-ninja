# Mala Vida Fast Food — Juego promocional

Juego estilo Fruit Ninja para el restaurante. El cliente entra con su número de
WhatsApp, juega 45 segundos cortando comida y se gana un premio real que reclama
por WhatsApp y canjea en el local mostrando un código.

Una partida por persona por día. Los premios buenos tienen **stock diario**: se
acaban y el sistema baja automáticamente al siguiente premio disponible.

---

## Qué hay aquí

```
mala-vida/
├── server/           API + panel admin (Express 5 + Drizzle + PostgreSQL)
│   ├── src/routes/   auth · game · player · public · admin
│   ├── src/lib/      premios, stock, rachas, JWT, tiempo, rate limit
│   ├── src/db/       esquema, migraciones, semilla
│   ├── src/admin/    panel.html (panel de administración, un solo archivo)
│   └── drizzle/      migraciones SQL versionadas
├── web/              El juego (React + Vite + Phaser 3 + Tailwind)
│   └── src/game/     GameScene.ts (toda la mecánica) y config.ts (el balance)
├── render.yaml       Despliegue de un clic en Render
└── .github/workflows/deploy-pages.yml   Publicar el juego en GitHub Pages
```

---

## Arrancar en local

Necesitas Node 20+ y una base PostgreSQL (local, o gratis en Neon/Supabase).

```bash
npm install
cp .env.example .env          # y edita DATABASE_URL, SESSION_SECRET y ADMIN_KEY
npm run db:generate           # solo si cambiaste el esquema
npm run db:migrate            # crea las tablas
npm run db:seed               # carga el catálogo de premios
npm run dev:server            # API en http://localhost:8080
npm run dev:web               # juego en http://localhost:5173
```

- Juego: http://localhost:5173
- Panel admin: http://localhost:8080/admin (clave = `ADMIN_KEY`)
- Salud: http://localhost:8080/api/health

En producción un solo proceso sirve las dos cosas: `npm run build && npm start`.

---

## Los premios

| Premio | Emoji | Puntaje mínimo | Stock por día |
|---|---|---|---|
| Hamburguesa gratis | 🍔 | 2.000 | 1 |
| Bebida gratis | 🥤 | 1.400 | 2 |
| Domicilio gratis | 🛵 | 900 | 3 |
| 30% de descuento | 💫 | 400 | 5 |
| 5% de descuento (consolación) | 🏷️ | 0 | ilimitado |

**Cómo se asigna.** Al terminar la partida, el servidor busca el mejor premio
que el puntaje alcance. Si ese premio ya se agotó hoy, baja al siguiente, y así
hasta la consolación, que nunca se acaba. El jugador ve en pantalla si le
tocó un premio "bajado" ("los premios mayores de hoy ya se agotaron").

**Por qué no se puede entregar dos veces la misma hamburguesa.** La reserva es
un `UPDATE ... SET issued = issued + 1 WHERE issued < stock_limit` sobre la fila
del día. Postgres serializa ese update: si dos jugadores terminan en el mismo
milisegundo, solo uno recibe fila actualizada; el otro baja de premio. Hay una
prueba automática que lanza 6 partidas simultáneas por el último cupón y
verifica que solo una lo gana.

Todo esto es editable desde el panel admin (pestaña Ajustes) sin tocar código:
puntajes mínimos, stock permanente, stock de un día puntual, y activar o
desactivar premios.

## Las rachas

Días consecutivos jugando. Si se salta un día, vuelve a 0.

| Día | Bono extra |
|---|---|
| 1 | 5% adicional |
| 2 | 15% adicional |
| 3 | 50% adicional |
| 4 | Bebida gratis |
| 5 | Premio según el promedio de los 5 días |

El bono de racha se entrega como un segundo código, aparte del premio de la
partida.

---

## Anti-trampa

El puntaje se envía desde el navegador, así que el servidor no se fía de nada:

1. **Sesión de juego firmada.** Al entrar se crea una sesión en base de datos y
   se firma un JWT con su id. Sin sesión válida no hay partida, y cada sesión se
   consume una sola vez (protege contra reenviar el mismo puntaje).
2. **Reloj del servidor.** No se puede reportar más tiempo del que realmente
   pasó desde que se abrió la sesión.
3. **Duración coherente.** Una partida que no terminó en bomba tiene que haber
   durado lo que dura el juego.
4. **Puntaje contra cortes.** `score ≤ cortes × 50 × 3` (el 3 es el combo
   máximo). Un puntaje alto con pocos cortes se rechaza.
5. **Una partida por día**, con índice único `(player_id, play_date)` en la base
   como última línea de defensa.
6. **Rate limit** por número (12 intentos / 5 min) y por IP (300 / 5 min). El
   límite fuerte va por número justamente porque en el local todos comparten el
   mismo WiFi.

Todo rechazo queda en los logs con su código (`SCORE_ITEMS_MISMATCH`,
`TIME_TRAVEL`, `SESSION_USED`, …) para poder auditar.

---

## El día empieza en Bogotá, no en UTC

`TIMEZONE=America/Bogota` define cuándo cambia el día. Es importante: usando UTC
el "día" se reiniciaría a las 7:00 p. m. hora Colombia y la gente podría jugar
dos veces la misma noche.

---

## Panel de administración

`https://tu-servidor/admin` — clave `ADMIN_KEY`.

- **Hoy**: partidas, jugadores nuevos, mejor puntaje, promedio, premios
  pendientes y stock del día (editable por día).
- **Verificar**: buscas por número de WhatsApp o por código de premio; ves si ya
  jugó hoy, su racha, sus premios, y marcas *entregado* con un botón. Un premio
  ya entregado no se puede volver a entregar.
- **Premios**: lista filtrable por estado y fecha, y exportación a CSV.
- **Ajustes**: catálogo de premios, historial de acciones de admin y zona
  peligrosa (borrar todo).

---

## Pruebas

```bash
# 1. Postgres arriba y una base de PRUEBAS (no la de producción)
# 2. Servidor de pruebas con partidas cortas para no esperar 45s:
DATABASE_URL=postgres://...  GAME_DURATION_SECONDS=5 npm run dev:server
# 3. En otra terminal:
cd server && npx tsx --test src/e2e.test.ts
```

19 pruebas: stock y cascada de premios, concurrencia, una partida por día,
los cinco chequeos anti-trampa, canje del admin, bloqueo de números,
leaderboard y rachas.

---

## Despliegue

Ver [DEPLOY.md](./DEPLOY.md).

---

## Cambios frecuentes

| Quiero… | Dónde |
|---|---|
| Cambiar el stock o los puntajes | Panel admin → Ajustes (o `server/src/lib/prizes.ts` para los valores por defecto) |
| Cambiar el número de WhatsApp | Variable `WHATSAPP_NUMBER` |
| Cambiar la duración de la partida | Variable `GAME_DURATION_SECONDS` (el juego se ajusta solo) |
| Cambiar qué se corta y cuánto suma | `web/src/game/config.ts` |
| Cambiar el ritmo o la dificultad | `web/src/game/config.ts` → `spawnPhases` |
| Cambiar colores o tipografías | `web/src/index.css` |
| Permitir más de una partida al día | Variable `GAMES_PER_DAY` |
