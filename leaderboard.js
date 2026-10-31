'use strict';
window.Leaderboard = (() => {
  const byId = id => document.getElementById(id);
  const configured = document.querySelector('meta[name="leaderboard-api"]')?.content || '';
  const base = configured.replace(/\/$/, '');
  const endpoint = path => base + path;
  let runPromise = null, result = null, submitting = false, loading = false, latestId = null;
  const dialog = byId('resultsDialog');

  async function api(path, options = {}) {
    const response = await fetch(endpoint(path), {
      ...options, credentials: 'same-origin',
      headers: {'Content-Type': 'application/json', ...options.headers},
      signal: AbortSignal.timeout(12000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'The online leaderboard is unavailable. Please try again.');
    return data;
  }
  const message = (id, text, error = false) => {
    const el = byId(id); el.textContent = text; el.classList.toggle('error', error);
  };
  function row(entry, rank) {
    const tr = document.createElement('tr');
    if (entry.id === latestId) tr.classList.add('your-run');
    for (const value of [rank, entry.name, entry.score, entry.tips]) {
      const td = document.createElement('td'); td.textContent = value; tr.append(td);
    }
    return tr;
  }
  async function refresh() {
    if (loading) return;
    loading = true; byId('refreshLeaderboard').disabled = true;
    message('leaderboardStatus', 'Loading scores…');
    try {
      const data = await api('/api/leaderboard');
      byId('leaderboardRows').replaceChildren(...data.entries.map((entry, i) => row(entry, i + 1)));
      byId('leaderboardEmpty').hidden = data.entries.length > 0;
      byId('leaderboardTable').hidden = data.entries.length === 0;
      byId('leaderboardCount').textContent = data.total + (data.total === 1 ? ' completed run' : ' completed runs');
      message('leaderboardStatus', 'Shared online · Top 20 · ' + (data.clearedAt ? 'Reset ' + new Date(data.clearedAt).toLocaleDateString() : 'All-time scores'));
    } catch (error) {
      message('leaderboardStatus', error.message, true);
    } finally { loading = false; byId('refreshLeaderboard').disabled = false; }
  }
  function reset() {
    if (dialog.open) dialog.close();
    result = null; runPromise = null; submitting = false;
    byId('showResults').hidden = true; byId('submitScore').disabled = false;
    byId('submitScore').textContent = 'Post score ↗';
    byId('playAgain').disabled = false;
    byId('playerName').disabled = false; byId('scoreForm').hidden = false;
    message('submitStatus', 'Your final score is filled in automatically.');
  }
  function begin() {
    // One server-issued run per match; a failed connection never becomes a local-only score.
    runPromise = api('/api/runs', {method: 'POST', body: '{}'}).then(data => ({id: data.id})).catch(error => ({error: error.message}));
  }
  function open() {
    if (!result) return;
    if (!dialog.open) dialog.showModal();
    (result.saved ? byId('playAgain') : byId('playerName')).focus();
  }
  function finish(parts, tips) {
    result = {parts: {...parts}, tips, score: Object.values(parts).reduce((sum, value) => sum + value, 0), saved: false};
    byId('finalScore').textContent = result.score;
    byId('finalTips').textContent = tips + (tips === 1 ? ' hive tip' : ' hive tips');
    byId('resultBreakdown').replaceChildren(...Object.entries(parts).map(([label, points]) => {
      const line = document.createElement('div'); line.className = 'row';
      const name = document.createElement('span'), value = document.createElement('b');
      name.textContent = label; value.textContent = points; line.append(name, value); return line;
    }));
    byId('showResults').hidden = false;
    try { byId('playerName').value = localStorage.getItem('bamboobuzz-player-name') || ''; } catch {}
    open(); refresh();
  }
  byId('scoreForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (!result || result.saved || submitting) return;
    const name = byId('playerName').value.normalize('NFKC').trim().replace(/\s+/g, ' ');
    if (!name || [...name].length > 24) { message('submitStatus', 'Enter a name with 1–24 characters.', true); byId('playerName').focus(); return; }
    submitting = true; byId('submitScore').disabled = true; byId('playAgain').disabled = true;
    message('submitStatus', 'Saving your score…');
    const current = result;
    try {
      const session = await runPromise;
      if (!session?.id) throw new Error(session?.error || 'This match has no online session. Start a new match while connected.');
      const saved = await api('/api/leaderboard', {method: 'POST', body: JSON.stringify({runId: session.id, name, score: current.score, tips: current.tips, breakdown: current.parts})});
      current.saved = true; latestId = saved.id;
      if (result !== current) return;
      byId('playerName').disabled = true;
      byId('submitScore').textContent = 'Score saved ✓';
      message('submitStatus', 'Saved online! Your rank is #' + saved.rank + '.');
      try { localStorage.setItem('bamboobuzz-player-name', name); } catch {}
      refresh();
    } catch (error) { if (result === current) { message('submitStatus', error.message, true); byId('submitScore').disabled = false; } }
    finally { if (result === current) { submitting = false; byId('playAgain').disabled = false; } }
  });
  byId('playAgain').addEventListener('click', () => { dialog.close(); byId('reset').click(); byId('start').click(); });
  byId('closeResults').addEventListener('click', () => { dialog.close(); byId('field').focus(); });
  byId('showResults').addEventListener('click', open);
  byId('refreshLeaderboard').addEventListener('click', refresh);
  dialog.addEventListener('cancel', () => { byId('field').focus(); });
  byId('adminSignIn').href = endpoint('/signin-with-chatgpt?return_to=%2F%3Fadmin%3D1');
  if (!base || base === globalThis.location?.origin) api('/api/admin').then(data => {
    byId('adminPanel').hidden = !data.owner;
    byId('adminSignIn').hidden = data.owner;
  }).catch(() => {});
  byId('openClear').addEventListener('click', () => { byId('clearDialog').showModal(); byId('clearConfirm').focus(); });
  byId('cancelClear').addEventListener('click', () => byId('clearDialog').close());
  byId('clearForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (byId('clearConfirm').value !== 'CLEAR') { message('clearStatus', 'Type CLEAR to confirm.', true); return; }
    byId('confirmClear').disabled = true;
    try {
      await api('/api/admin/leaderboard', {method: 'DELETE', body: JSON.stringify({confirm: 'CLEAR'})});
      latestId = null; byId('clearDialog').close(); byId('clearConfirm').value = '';
      message('clearStatus', ''); refresh();
    } catch (error) { message('clearStatus', error.message, true); }
    finally { byId('confirmClear').disabled = false; }
  });
  refresh();
  return {begin, finish, reset, open, isOpen: () => dialog.open};
})();
