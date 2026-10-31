import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const base = new URL('../', import.meta.url);
const html = await fs.readFile(new URL('index.html', base), 'utf8');
const leaderboard = await fs.readFile(new URL('leaderboard.js', base), 'utf8');
const game = await fs.readFile(new URL('app.js', base), 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
assert.equal(new Set(ids).size, ids.length, 'unique IDs');
assert.match(html, /<script defer src="leaderboard.js"><\/script><script defer src="app.js"><\/script>/, 'scripts wait for result dialogs to parse');
for (const [, id] of leaderboard.matchAll(/byId\('([^']+)'\)/g)) assert.ok(ids.includes(id), 'missing HTML element: ' + id);
const noop = () => {}, elements = {}, events = {}, requests = [], storage = new Map();
const context = new Proxy({}, {get: (o,k) => o[k] || noop, set: (o,k,v) => (o[k] = v, true)});
const element = id => elements[id] ||= {
  id, hidden: false, open: false, value: '', checked: false, textContent: '', innerHTML: '', disabled: false, children: [],
  classList: {toggle: noop, add: noop},
  append(...children) { this.children.push(...children); }, replaceChildren(...children) { this.children = children; },
  focus() { document.activeElement = this; }, showModal() { this.open = true; }, close() { this.open = false; },
  addEventListener(type, handler) { events[id + ':' + type] = handler; }, getContext: () => context,
  click() { if (this.disabled) return; this.onclick?.(); events[id + ':click']?.({preventDefault: noop}); }
};
const document = {getElementById: element, createElement: tag => ({...element('created-' + Math.random()), tag}), querySelector: () => ({content: ''}), querySelectorAll: () => [], addEventListener: noop};
const fakeRun = '12345678-1234-4123-8123-123456789abc';
let failSave = false;
const box = {document, window: {addEventListener: noop}, navigator: {getGamepads: () => []}, structuredClone, performance: {now: () => 0}, requestAnimationFrame: noop, Math, console, AbortSignal, localStorage: {getItem: key => storage.get(key), setItem: (key,value) => storage.set(key,value)},
  fetch: async (url, options = {}) => {
    requests.push({url, ...options});
    if (url.endsWith('/api/runs')) return Response.json({id: fakeRun});
    if (url.endsWith('/api/admin')) return Response.json({owner: true});
    if (options.method === 'DELETE') return Response.json({cleared: true});
    if (options.method === 'POST') return failSave ? Response.json({error: 'Please retry'}, {status: 503}) : Response.json({id: fakeRun, rank: 1});
    return Response.json({entries: [{id: fakeRun, name: '<script>unsafe</script>', score: 80, tips: 3}], total: 1, clearedAt: null});
  }
};
vm.createContext(box); vm.runInContext(leaderboard, box); vm.runInContext(game, box);
await new Promise(resolve => setImmediate(resolve));
assert.equal(element('adminPanel').hidden, false);
vm.runInContext('start();', box);
await new Promise(resolve => setImmediate(resolve));
assert.equal(requests.filter(r => r.url.endsWith('/api/runs')).length, 1);
vm.runInContext('pause();pause();phase=2;time=.001;update(.01,null);', box);
await new Promise(resolve => setImmediate(resolve));
assert.equal(element('resultsDialog').open, true);
assert.equal(element('showResults').hidden, false);
assert.equal(document.activeElement.id, 'playerName');
assert.equal(element('finalScore').textContent, vm.runInContext('Object.values(scoreParts()).reduce((a,b)=>a+b,0)', box));
const before = vm.runInContext('robot.x', box); vm.runInContext("keys.add('KeyW');update(1,null)", box); assert.equal(vm.runInContext('robot.x', box), before, 'end game freezes robot');
element('playerName').value = '  Bamboo Driver  ';
failSave = true; await events['scoreForm:submit']({preventDefault: noop});
assert.equal(element('submitScore').disabled, false); assert.equal(element('submitStatus').textContent, 'Please retry');
failSave = false; await events['scoreForm:submit']({preventDefault: noop});
assert.equal(element('submitScore').disabled, true); assert.match(element('submitStatus').textContent, /#1/);
assert.equal(storage.get('bamboobuzz-player-name'), 'Bamboo Driver');
const sent = requests.filter(r => r.method === 'POST' && r.url.endsWith('/api/leaderboard'));
assert.equal(JSON.parse(sent.at(-1).body).score, element('finalScore').textContent);
await events['scoreForm:submit']({preventDefault: noop}); assert.equal(requests.filter(r => r.method === 'POST' && r.url.endsWith('/api/leaderboard')).length, sent.length, 'double submission ignored');
await new Promise(resolve => setImmediate(resolve));
assert.equal(element('leaderboardRows').children[0].children[1].textContent, '<script>unsafe</script>', 'names rendered as text');
element('closeResults').click(); assert.equal(element('resultsDialog').open, false);
element('showResults').click(); assert.equal(element('resultsDialog').open, true);
element('playAgain').click(); assert.equal(element('resultsDialog').open, false); assert.equal(vm.runInContext('phase', box), 0); assert.equal(element('submitScore').textContent, 'Post score ↗');
element('openClear').click(); assert.equal(element('clearDialog').open, true);
element('clearConfirm').value = 'no'; await events['clearForm:submit']({preventDefault: noop}); assert.equal(requests.filter(r => r.method === 'DELETE').length, 0);
element('clearConfirm').value = 'CLEAR'; await events['clearForm:submit']({preventDefault: noop}); assert.equal(requests.filter(r => r.method === 'DELETE').length, 1); assert.equal(element('clearDialog').open, false);
const beforeCrossOrigin = requests.length;
const crossOrigin = {...box, window: {addEventListener: noop}, location: {origin: 'https://monke85.github.io'}, document: {...document, querySelector: () => ({content: 'https://game.example.test'})}};
vm.createContext(crossOrigin); vm.runInContext(leaderboard, crossOrigin); await new Promise(resolve => setImmediate(resolve));
assert.ok(requests.slice(beforeCrossOrigin).some(r => r.url === 'https://game.example.test/api/leaderboard'));
assert.ok(!requests.slice(beforeCrossOrigin).some(r => r.url.endsWith('/api/admin')), 'owner API stays on hosted origin');
console.log('PASS: endgame lifecycle, fixed final score, safe names, online submit/retry, duplicate prevention, reopen, replay, saved driver name and owner clear confirmation.');
