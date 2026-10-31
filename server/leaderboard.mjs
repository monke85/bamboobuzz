const LIMITS = {'Hive tips': 2000, 'AUTO leave / park': 8, 'Cell contents': 20, Flowers: 1000, Garden: 200, 'TELEOP park': 5};
const MAX_BODY = 4096, MATCH_MS = 157000, RUN_TTL = 86400000;
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const json = (data, status = 200) => Response.json(data, {status, headers: {'Cache-Control': 'no-store'}});
const owner = (request, env) => Boolean(env.ADMIN_EMAIL && request.headers.get('oai-authenticated-user-id') && request.headers.get('oai-authenticated-user-email')?.toLowerCase() === env.ADMIN_EMAIL.toLowerCase());
async function body(request) {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new HttpError(415, 'Send a JSON request.');
  const declared = Number(request.headers.get('content-length'));
  if (declared > MAX_BODY) throw new HttpError(413, 'Request is too large.');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'A request body is required.');
  const chunks = []; let length = 0;
  while (true) {
    const {done, value} = await reader.read(); if (done) break;
    length += value.byteLength;
    if (length > MAX_BODY) { await reader.cancel(); throw new HttpError(413, 'Request is too large.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new HttpError(400, 'Invalid JSON.'); }
}
export function validateScore(data) {
  if (!data || typeof data !== 'object' || typeof data.name !== 'string') throw new HttpError(400, 'Enter a player name.');
  const name = data.name.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!name || [...name].length > 24 || /[\p{Cc}\p{Cf}]/u.test(name)) throw new HttpError(400, 'Names must have 1–24 visible characters.');
  if (typeof data.runId !== 'string' || !/^[0-9a-f-]{36}$/i.test(data.runId)) throw new HttpError(400, 'Invalid match session.');
  if (!Number.isInteger(data.tips) || data.tips < 0 || data.tips > 100 || !data.breakdown || typeof data.breakdown !== 'object') throw new HttpError(400, 'Invalid match result.');
  if (Object.keys(data.breakdown).length !== Object.keys(LIMITS).length) throw new HttpError(400, 'Invalid score breakdown.');
  let total = 0;
  for (const [key, maximum] of Object.entries(LIMITS)) {
    const value = data.breakdown[key];
    if (!Number.isInteger(value) || value < 0 || value > maximum) throw new HttpError(400, 'Invalid score breakdown.');
    total += value;
  }
  if (data.breakdown['Hive tips'] !== data.tips * 20 || ![0, 3, 5, 8].includes(data.breakdown['AUTO leave / park']) || ![0, 5].includes(data.breakdown['TELEOP park']) || data.breakdown['Cell contents'] % 2 || data.score !== total) throw new HttpError(400, 'The score does not match the breakdown.');
  return {name, score: total, tips: data.tips, runId: data.runId, breakdown: data.breakdown};
}
async function rank(db, entry) {
  const count = await db.prepare('SELECT COUNT(*) AS count FROM leaderboard WHERE score > ? OR (score = ? AND (created_at < ? OR (created_at = ? AND id < ?)))').bind(entry.score, entry.score, entry.created_at, entry.created_at, entry.id).first();
  return Number(count.count) + 1;
}
export async function handleApi(request, env, now = Date.now()) {
  const url = new URL(request.url), path = url.pathname;
  // Sites supplies verified identity headers. Owner operations also require a same-origin request.
  const origin = request.headers.get('origin');
  const isAdmin = path.startsWith('/api/admin');
  const allowedOrigin = origin === url.origin || origin === 'https://monke85.github.io' || origin === 'null';
  const cors = !isAdmin && allowedOrigin ? {'Access-Control-Allow-Origin': origin, Vary: 'Origin'} : {};
  function reply(response) { for (const [key, value] of Object.entries(cors)) response.headers.set(key, value); return response; }
  try {
    if (request.method === 'OPTIONS') {
      if (!allowedOrigin || (isAdmin && origin !== url.origin)) throw new HttpError(403, 'Origin is not allowed.');
      return reply(new Response(null, {status: 204, headers: {'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type'}}));
    }
    if (isAdmin) {
      if (path === '/api/admin' && request.method === 'GET') return json({owner: owner(request, env)});
      if (!owner(request, env)) throw new HttpError(403, 'Only the site owner can clear the leaderboard.');
      if (origin !== url.origin) throw new HttpError(403, 'Open the hosted site to manage the leaderboard.');
    } else if (origin && !allowedOrigin) throw new HttpError(403, 'Origin is not allowed.');
    const db = env.DB;
    if (!db) throw new HttpError(503, 'The online leaderboard is not configured yet.');
    if (path === '/api/leaderboard' && request.method === 'GET') {
      const [rows, total, state] = await db.batch([
        db.prepare('SELECT id, name, score, tips, created_at AS createdAt FROM leaderboard ORDER BY score DESC, created_at ASC, id ASC LIMIT 20'),
        db.prepare('SELECT COUNT(*) AS count FROM leaderboard'),
        db.prepare('SELECT cleared_at AS clearedAt FROM leaderboard_state WHERE id = 1')
      ]);
      return reply(json({entries: rows.results, total: total.results[0].count, clearedAt: state.results[0]?.clearedAt || null}));
    }
    if (path === '/api/runs' && request.method === 'POST') {
      await body(request);
      const id = crypto.randomUUID();
      await db.batch([
        db.prepare('INSERT OR IGNORE INTO leaderboard_state (id, generation) VALUES (1, 1)'),
        db.prepare('DELETE FROM runs WHERE started_at < ?').bind(now - RUN_TTL),
        db.prepare('INSERT INTO runs (id, started_at, generation) SELECT ?, ?, generation FROM leaderboard_state WHERE id = 1').bind(id, now)
      ]);
      return reply(json({id}, 201));
    }
    if (path === '/api/leaderboard' && request.method === 'POST') {
      const data = validateScore(await body(request));
      const existing = await db.prepare('SELECT id, score, created_at FROM leaderboard WHERE id = ?').bind(data.runId).first();
      if (existing) return reply(json({id: existing.id, rank: await rank(db, existing), alreadySaved: true}));
      const run = await db.prepare('SELECT runs.started_at, runs.generation, leaderboard_state.generation AS current_generation FROM runs JOIN leaderboard_state ON leaderboard_state.id = 1 WHERE runs.id = ?').bind(data.runId).first();
      if (!run || run.generation !== run.current_generation || now - run.started_at > RUN_TTL) throw new HttpError(409, 'This match expired or the leaderboard was reset. Start a new match.');
      if (now - run.started_at < MATCH_MS) throw new HttpError(409, 'Complete the full AUTO and TELEOP match before submitting.');
      // The generation condition keeps an in-flight submission from restoring scores after a reset.
      await db.prepare('INSERT OR IGNORE INTO leaderboard (id, name, score, tips, breakdown, created_at) SELECT ?, ?, ?, ?, ?, ? FROM runs JOIN leaderboard_state ON leaderboard_state.id = 1 WHERE runs.id = ? AND runs.generation = leaderboard_state.generation').bind(data.runId, data.name, data.score, data.tips, JSON.stringify(data.breakdown), now, data.runId).run();
      const saved = await db.prepare('SELECT id, score, created_at FROM leaderboard WHERE id = ?').bind(data.runId).first();
      if (!saved) throw new HttpError(409, 'The leaderboard was reset. Start a new match.');
      return reply(json({id: saved.id, rank: await rank(db, saved)}, 201));
    }
    if (path === '/api/admin/leaderboard' && request.method === 'DELETE') {
      if ((await body(request)).confirm !== 'CLEAR') throw new HttpError(400, 'Type CLEAR to confirm.');
      await db.batch([
        db.prepare('DELETE FROM leaderboard'), db.prepare('DELETE FROM runs'),
        db.prepare('INSERT INTO leaderboard_state (id, generation, cleared_at) VALUES (1, 2, ?) ON CONFLICT(id) DO UPDATE SET generation = generation + 1, cleared_at = excluded.cleared_at').bind(now)
      ]);
      return json({cleared: true, clearedAt: now});
    }
    throw new HttpError(404, 'Endpoint not found.');
  } catch (error) {
    if (!error.status) console.error('Leaderboard request failed:', error.message);
    return reply(json({error: error.status ? error.message : 'The online leaderboard is temporarily unavailable. Please try again.'}, error.status || 503));
  }
}
