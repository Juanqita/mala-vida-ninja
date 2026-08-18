/**
 * Prueba end-to-end contra un servidor ya levantado.
 *
 *   1) Postgres corriendo y DATABASE_URL apuntando a una base de PRUEBAS
 *   2) levantar el server con GAME_DURATION_SECONDS=5 (para no esperar 45s)
 *   3) npx tsx --test src/e2e.test.ts
 *
 * Verifica: stock diario, cascada de premios, una partida por día, anti-cheat,
 * concurrencia y el flujo de canje del panel admin.
 */
import assert from 'node:assert/strict';
import test, { before } from 'node:test';

const API = process.env.API_URL ?? 'http://localhost:8080';
const ADMIN_KEY = process.env.ADMIN_KEY ?? 'admin123';
const RUN = Date.now().toString().slice(-7);

let DURATION = 45;
let TODAY = '';
let seq = 0;
const nextPhone = () => `+57${RUN}${String(seq++).padStart(2, '0')}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call(path: string, init?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const admin = (path: string, init?: RequestInit) =>
  call(path, { ...init, headers: { 'X-Admin-Key': ADMIN_KEY, ...(init?.headers ?? {}) } });

const login = (phone: string) =>
  call('/api/auth/login', { method: 'POST', body: JSON.stringify({ phone }) });

function submitBody(token: string, score: number, extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    token,
    score,
    comboMax: 5,
    durationSeconds: DURATION,
    itemsCut: Math.ceil(score / 50) + 1,
    bombsHit: 0,
    endedByBomb: false,
    ...extra,
  });
}

const submit = (token: string, score: number, extra?: Record<string, unknown>) =>
  call('/api/game/submit', { method: 'POST', body: submitBody(token, score, extra) });

/** Login → espera a que pase el tiempo real de partida → envía puntaje. */
async function play(phone: string, score: number) {
  const l = await login(phone);
  if (l.body.alreadyPlayedToday) return { login: l, submit: null as any };
  await sleep(DURATION * 1000 + 200);
  return { login: l, submit: await submit(l.body.token, score) };
}

before(async () => {
  const health = await call('/api/health');
  DURATION = health.body.gameDurationSeconds;
  TODAY = health.body.today;
  assert.ok(DURATION <= 10, 'corre el servidor de pruebas con GAME_DURATION_SECONDS=5');
});

test('salud del servicio', async () => {
  const { status, body } = await call('/api/health');
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.timezone, 'America/Bogota');
});

test('rechaza números inválidos', async () => {
  const { status, body } = await call('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ phone: '123' }),
  });
  assert.equal(status, 400);
  assert.equal(body.code, 'INVALID_PHONE');
});

test('el stock diario se respeta y el premio baja en cascada', async () => {
  // 12 jugadores con puntaje altísimo: solo 1 puede llevarse la hamburguesa,
  // 2 la bebida, 3 el domicilio y 5 el cupón de 30%. El resto, consolación.
  const phones = Array.from({ length: 12 }, () => nextPhone());
  const logins = await Promise.all(phones.map(login));
  await sleep(DURATION * 1000 + 200);

  const keys: string[] = [];
  for (const l of logins) {
    const res = await submit(l.body.token, 5000);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    keys.push(res.body.reward.prizeKey);
  }

  const count = (key: string) => keys.filter((k) => k === key).length;
  assert.equal(count('free_burger'), 1, 'solo 1 hamburguesa al día');
  assert.equal(count('free_drink'), 2, 'solo 2 bebidas al día');
  assert.equal(count('free_delivery'), 3, 'solo 3 domicilios al día');
  assert.equal(count('discount_30'), 5, 'solo 5 cupones de 30%');
  assert.equal(count('discount_5'), 1, 'el resto recibe la consolación');

  // El que quedó de último debe saber que le bajaron el premio.
  const last = keys[keys.length - 1];
  assert.equal(last, 'discount_5');
});

test('un puntaje bajo nunca sube de tier', async () => {
  const { submit: res } = await play(nextPhone(), 120);
  assert.equal(res.body.reward.prizeKey, 'discount_5');
  assert.equal(res.body.reward.downgraded, false);
});

test('una sola partida por jugador por día', async () => {
  const phone = nextPhone();
  const first = await play(phone, 300);
  assert.equal(first.submit.status, 201);

  const second = await login(phone);
  assert.equal(second.body.alreadyPlayedToday, true);
  assert.ok(second.body.todayReward?.code, 'devuelve el premio del día para reclamarlo');
  assert.equal(second.body.todayScore, 300);
});

test('la sesión no se puede reutilizar', async () => {
  const l = await login(nextPhone());
  await sleep(DURATION * 1000 + 200);

  const first = await submit(l.body.token, 200);
  assert.equal(first.status, 201);

  const replay = await submit(l.body.token, 200);
  assert.ok(replay.status >= 400, 'el replay del mismo token debe fallar');
});

test('anti-cheat: puntaje imposible para los cortes reportados', async () => {
  const l = await login(nextPhone());
  await sleep(DURATION * 1000 + 200);
  const { status, body } = await submit(l.body.token, 9000, { itemsCut: 4 });
  assert.equal(status, 400);
  assert.equal(body.code, 'SCORE_ITEMS_MISMATCH');
});

test('anti-cheat: duración imposible', async () => {
  const l = await login(nextPhone());
  const { status, body } = await submit(l.body.token, 100, { durationSeconds: 500 });
  assert.equal(status, 400);
  assert.equal(body.code, 'BAD_DURATION');
});

test('anti-cheat: no se puede reportar más tiempo del que pasó', async () => {
  const l = await login(nextPhone());
  const { status, body } = await submit(l.body.token, 100, { durationSeconds: DURATION });
  assert.equal(status, 400);
  assert.equal(body.code, 'TIME_TRAVEL');
});

test('anti-cheat: partida cortada sin bomba', async () => {
  const l = await login(nextPhone());
  await sleep(DURATION * 1000 + 200);
  const { status, body } = await submit(l.body.token, 100, {
    durationSeconds: 1,
    endedByBomb: false,
  });
  assert.equal(status, 400);
  assert.equal(body.code, 'SHORT_GAME');
});

test('terminar por bomba sí puede durar menos', async () => {
  const l = await login(nextPhone());
  await sleep(1200);
  const { status, body } = await submit(l.body.token, 100, {
    durationSeconds: 1,
    endedByBomb: true,
    bombsHit: 1,
  });
  assert.equal(status, 201);
  assert.ok(body.reward.code);
});

test('anti-cheat: token inventado', async () => {
  const { status } = await call('/api/game/submit', {
    method: 'POST',
    body: JSON.stringify({
      token: 'token.falso.inventado',
      score: 100,
      durationSeconds: DURATION,
      itemsCut: 10,
    }),
  });
  assert.equal(status, 401);
});

test('concurrencia: el último premio no se entrega dos veces', async () => {
  // Deja exactamente 1 cupón de 30% disponible y lanza 6 partidas a la vez.
  const summary = await admin(`/api/admin/summary?date=${TODAY}`);
  const row = summary.body.stock.find((s: any) => s.key === 'discount_30');
  await admin('/api/admin/stock', {
    method: 'POST',
    body: JSON.stringify({ date: TODAY, prizeKey: 'discount_30', limit: row.issued + 1 }),
  });

  const logins = await Promise.all(Array.from({ length: 6 }, () => login(nextPhone())));
  await sleep(DURATION * 1000 + 200);

  const results = await Promise.all(logins.map((l) => submit(l.body.token, 500)));
  const keys = results.map((r) => r.body.reward.prizeKey);

  assert.equal(keys.filter((k) => k === 'discount_30').length, 1, 'solo uno se lleva el último cupón');
  assert.equal(keys.filter((k) => k === 'discount_5').length, 5, 'los demás caen a consolación');
});

test('admin: buscar por teléfono y por código, y canjear una sola vez', async () => {
  const phone = nextPhone();
  const { submit: res } = await play(phone, 700);
  const code = res.body.reward.code;

  const byPhone = await admin(`/api/admin/lookup?q=${encodeURIComponent(phone)}`);
  assert.equal(byPhone.body.found, true);
  assert.equal(byPhone.body.player.phone, phone);
  assert.ok(byPhone.body.rewards.some((r: any) => r.code === code));

  const byCode = await admin(`/api/admin/lookup?q=${code}`);
  assert.equal(byCode.body.found, true);

  const claim = await admin('/api/admin/claim', { method: 'POST', body: JSON.stringify({ code }) });
  assert.equal(claim.status, 200);

  const again = await admin('/api/admin/claim', { method: 'POST', body: JSON.stringify({ code }) });
  assert.equal(again.status, 409);
  assert.equal(again.body.code, 'ALREADY_CLAIMED');
});

test('admin: la clave protege todo', async () => {
  const { status } = await call('/api/admin/summary');
  assert.equal(status, 403);
});

test('admin: bloquear un número le impide jugar', async () => {
  const phone = nextPhone();
  await login(phone);
  const blocked = await admin('/api/admin/player/block', {
    method: 'POST',
    body: JSON.stringify({ phone, blocked: true }),
  });
  assert.equal(blocked.status, 200);

  const denied = await login(phone);
  assert.equal(denied.status, 403);
  assert.equal(denied.body.code, 'PLAYER_BLOCKED');
});

test('admin: el resumen del día cuadra con lo jugado', async () => {
  const { body } = await admin(`/api/admin/summary?date=${TODAY}`);
  assert.ok(body.games.total > 10, `partidas de hoy: ${body.games.total}`);
  assert.ok(body.stock.length >= 5);
  assert.ok(body.rewardsByPrize.length >= 2);
});

test('rachas: la primera partida arranca la racha y da su bono', async () => {
  const { submit: res } = await play(nextPhone(), 250);
  assert.equal(res.body.streak.currentStreak, 1);
  assert.equal(res.body.streakReward.label, '5% adicional');
});

test('leaderboard y premios del día son públicos', async () => {
  const lb = await call('/api/leaderboard?scope=today');
  assert.equal(lb.status, 200);
  assert.ok(Array.isArray(lb.body.entries));
  assert.ok(lb.body.entries[0].phoneMasked.includes('*'), 'el teléfono va enmascarado');

  const prizes = await call('/api/prizes/today');
  assert.equal(prizes.status, 200);
  assert.ok(prizes.body.prizes.length >= 5);
});
