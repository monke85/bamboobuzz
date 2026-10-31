import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {handleApi} from '../server/leaderboard.mjs';
const sql = await fs.readFile(new URL('../drizzle/0000_leaderboard.sql', import.meta.url), 'utf8');
const sqlite = new DatabaseSync(':memory:'); sqlite.exec(sql);
const db = {
  prepare(sql) {
    let params = [];
    const query = {
      bind(...values) { params = values; return query; },
      async first() { return sqlite.prepare(sql).get(...params) || null; },
      async all() { return {results: sqlite.prepare(sql).all(...params)}; },
      async run() { const result = sqlite.prepare(sql).run(...params); return {meta: {changes: Number(result.changes)}}; },
      async execute() { return /^\s*(SELECT|WITH)/i.test(sql) ? query.all() : query.run(); }
    };
    return query;
  },
  async batch(queries) {
    sqlite.exec('BEGIN');
    try { const results = []; for (const query of queries) results.push(await query.execute()); sqlite.exec('COMMIT'); return results; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  }
};
const env = {DB: db, ADMIN_EMAIL: 'owner@example.test'}, started = 1800000000000;
async function call(path, method = 'GET', data, time = started, headers = {}) {
  const request = new Request('https://game.example.test' + path, {method, headers: {'Content-Type': 'application/json', Origin: 'https://game.example.test', ...headers}, ...(data !== undefined ? {body: JSON.stringify(data)} : {})});
  const response = await handleApi(request, env, time);
  return {status: response.status, data: await response.json()};
}
const parts = {'Hive tips': 40, 'AUTO leave / park': 3, 'Cell contents': 6, Flowers: 0, Garden: 4, 'TELEOP park': 5};
const result = (runId, name = 'Driver', score = 58) => ({runId, name, score, tips: 2, breakdown: {...parts}});
assert.deepEqual((await call('/api/leaderboard')).data, {entries: [], total: 0, clearedAt: null});
const run = (await call('/api/runs', 'POST', {})).data.id;
assert.equal((await call('/api/leaderboard', 'POST', result(run), started + 1000)).status, 409, 'unfinished matches rejected');
assert.equal((await call('/api/leaderboard', 'POST', result(run, 'Driver', 999), started + 158000)).status, 400, 'tampered total rejected');
assert.equal((await call('/api/leaderboard', 'POST', result(run, ''), started + 158000)).status, 400, 'empty names rejected');
const first = await call('/api/leaderboard', 'POST', result(run, '<img onerror=alert(1)>'), started + 158000);
assert.equal(first.status, 201); assert.equal(first.data.rank, 1);
const duplicate = await call('/api/leaderboard', 'POST', result(run), started + 158500);
assert.equal(duplicate.data.alreadySaved, true); assert.equal((await call('/api/leaderboard')).data.total, 1);
const run2 = (await call('/api/runs', 'POST', {})).data.id;
const higher = result(run2, 'Second'); higher.breakdown.Garden = 8; higher.score = 62;
assert.equal((await call('/api/leaderboard', 'POST', higher, started + 159000)).data.rank, 1);
let board = (await call('/api/leaderboard')).data;
assert.equal(board.total, 2); assert.equal(board.entries[0].name, 'Second'); assert.equal(board.entries[1].name, '<img onerror=alert(1)>');
const ownerHeaders = {'oai-authenticated-user-id': 'site-owner', 'oai-authenticated-user-email': 'owner@example.test'};
assert.equal((await call('/api/admin')).data.owner, false);
assert.equal((await call('/api/admin', 'GET', undefined, started, ownerHeaders)).data.owner, true);
assert.equal((await call('/api/admin/leaderboard', 'DELETE', {confirm: 'CLEAR'})).status, 403, 'anonymous cannot clear');
assert.equal((await call('/api/admin/leaderboard', 'DELETE', {confirm: 'CLEAR'}, started, {...ownerHeaders, Origin: 'https://evil.example'})).status, 403, 'cross-origin clear rejected');
assert.equal((await call('/api/admin/leaderboard', 'DELETE', {confirm: 'no'}, started, ownerHeaders)).status, 400, 'explicit confirmation required');
const pending = (await call('/api/runs', 'POST', {})).data.id;
assert.equal((await call('/api/admin/leaderboard', 'DELETE', {confirm: 'CLEAR'}, started + 200000, ownerHeaders)).data.cleared, true);
board = (await call('/api/leaderboard')).data; assert.equal(board.total, 0); assert.equal(board.clearedAt, started + 200000);
assert.equal((await call('/api/leaderboard', 'POST', result(pending), started + 201000)).status, 409, 'reset invalidates running match');
const fresh = (await call('/api/runs', 'POST', {}, started + 201000)).data.id;
assert.equal((await call('/api/leaderboard', 'POST', result(fresh), started + 359000)).status, 201, 'new season accepts new matches');
const expired = (await call('/api/runs', 'POST', {})).data.id;
assert.equal((await call('/api/leaderboard', 'POST', result(expired), started + 86400001)).status, 409);
sqlite.close();
console.log('PASS: persistent SQL scores, full-match gate, validation, ranking, duplicate protection, owner access, CSRF rejection, clear confirmation, invalidated runs and fresh-season submissions.');
