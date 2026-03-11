const FPL_STATE = { search: '', position: 'ALL', rows: [] };

const FPL_WEIGHTS = {
  APP: 1,
  GOAL_GK: 10,
  GOAL_DEF: 6,
  GOAL_OTHER: 4,
  ASSIST: 3,
  CS_DEF_GK: 6,
  CONCEDE_1_DEF_GK: 3,
  CONCEDE_2_DEF_GK: 2,
  WIN_ALL: 3,
  WIN_BONUS_DEF_GK: 2,
  MOTM: 3,
  CAPTAIN_MOTM_BONUS: 1,
  OTF: -1,
  OG: -2,
};

function safeArray(v) { return Array.isArray(v) ? v : []; }
function normaliseNameQuery(v) { return String(v || '').trim().toLowerCase(); }
function getInitials(name = '?') {
  return String(name).split(' ').filter(Boolean).slice(0,2).map(p => p[0]?.toUpperCase() || '').join('') || '?';
}
function displayPosition(player) {
  const p = String(player?.meta?.position || '').toUpperCase().trim();
  return p || '—';
}
function posClass(pos) {
  const p = String(pos || '').toLowerCase();
  if (p === 'gk') return 'is-gk';
  if (p === 'def') return 'is-def';
  if (p === 'mid') return 'is-mid';
  if (p === 'fwd') return 'is-fwd';
  return '';
}
function profilePhotoUrl(player) {
  const name = String(player?.name || '').trim().toLowerCase();
  if (!name) return '';
  const file = name.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `./images/playerPhotos/${file}.png`;
}
function playerMatchesQuery(row, q) {
  if (!q) return true;
  const hay = [row?.player?.name || '', row?.player?.meta?.nicknames || '', displayPosition(row?.player)].join(' ').toLowerCase();
  return hay.includes(q);
}

function buildRoleMaps(match) {
  const pink = new Set(safeArray(match.playersPink));
  const blue = new Set(safeArray(match.playersBlue));
  const pinkDefs = new Set(safeArray(match.pinkDefs ?? match.pinkDefIds));
  const blueDefs = new Set(safeArray(match.blueDefs ?? match.blueDefIds));
  const pinkGk = match.pinkGKId || match.pinkGkId || null;
  const blueGk = match.blueGKId || match.blueGkId || null;

  function getTeam(pid) {
    if (pink.has(pid)) return 'PINK';
    if (blue.has(pid)) return 'BLUE';
    return null;
  }
  function getRole(pid) {
    if (pid === pinkGk || pid === blueGk) return 'GK';
    if (pinkDefs.has(pid) || blueDefs.has(pid)) return 'DEF';
    return getTeam(pid) ? 'OTHER' : null;
  }
  return { getTeam, getRole };
}

function buildFplTable(data) {
  const players = data?.players || {};
  const matches = safeArray(data?.matches).filter(m => m?.countsForStats !== false);
  const goals = safeArray(data?.goals);
  const byId = {};

  for (const [id, player] of Object.entries(players)) {
    byId[id] = {
      id,
      player,
      apps: 0,
      wins: 0,
      goals: 0,
      assists: 0,
      cleanSheets: 0,
      concede1: 0,
      concede2: 0,
      motm: 0,
      captainMotm: 0,
      otf: 0,
      og: 0,
      total: 0,
    };
  }

  const goalsByMatch = new Map();
  for (const g of goals) {
    if (!g?.matchId) continue;
    if (!goalsByMatch.has(g.matchId)) goalsByMatch.set(g.matchId, []);
    goalsByMatch.get(g.matchId).push(g);
  }

  for (const match of matches) {
    const { getTeam, getRole } = buildRoleMaps(match);
    const pinkPlayers = safeArray(match.playersPink);
    const bluePlayers = safeArray(match.playersBlue);
    const allPlayers = [...pinkPlayers, ...bluePlayers];
    const pinkGoals = Number(match.pinkGoals || 0);
    const blueGoals = Number(match.blueGoals || 0);
    const winningTeam = match.winningTeam || (pinkGoals > blueGoals ? 'PINK' : blueGoals > pinkGoals ? 'BLUE' : 'DRAW');
    const captainIds = new Set([match.captainPinkId, match.captainBlueId, ...(safeArray(match.captainIds))].filter(Boolean));

    for (const pid of allPlayers) {
      const row = byId[pid];
      if (!row || row.player?.meta?.excluded) continue;
      row.apps += 1;
      row.total += FPL_WEIGHTS.APP;

      const team = getTeam(pid);
      const role = getRole(pid);
      const conceded = team === 'PINK' ? blueGoals : team === 'BLUE' ? pinkGoals : null;

      if (winningTeam !== 'DRAW' && team === winningTeam) {
        row.wins += 1;
        row.total += FPL_WEIGHTS.WIN_ALL;
        if (role === 'GK' || role === 'DEF') row.total += FPL_WEIGHTS.WIN_BONUS_DEF_GK;
      }

      if (role === 'GK' || role === 'DEF') {
        if (conceded === 0) {
          row.cleanSheets += 1;
          row.total += FPL_WEIGHTS.CS_DEF_GK;
        } else if (conceded === 1) {
          row.concede1 += 1;
          row.total += FPL_WEIGHTS.CONCEDE_1_DEF_GK;
        } else if (conceded === 2) {
          row.concede2 += 1;
          row.total += FPL_WEIGHTS.CONCEDE_2_DEF_GK;
        }
      }
    }

    for (const pid of safeArray(match.motmIds)) {
      const row = byId[pid];
      if (!row || row.player?.meta?.excluded) continue;
      row.motm += 1;
      row.total += FPL_WEIGHTS.MOTM;
      if (captainIds.has(pid)) {
        row.captainMotm += 1;
        row.total += FPL_WEIGHTS.CAPTAIN_MOTM_BONUS;
      }
    }

    for (const pid of safeArray(match.otfIds)) {
      const row = byId[pid];
      if (!row || row.player?.meta?.excluded) continue;
      row.otf += 1;
      row.total += FPL_WEIGHTS.OTF;
    }

    for (const goal of safeArray(goalsByMatch.get(match.id))) {
      const scorerId = goal?.scorerId;
      const assistId = goal?.assistId;
      const isOwnGoal = Boolean(goal?.isOwnGoal);

      if (scorerId && byId[scorerId] && !byId[scorerId].player?.meta?.excluded) {
        const role = getRole(scorerId);
        if (isOwnGoal) {
          byId[scorerId].og += 1;
          byId[scorerId].total += FPL_WEIGHTS.OG;
        } else {
          byId[scorerId].goals += 1;
          if (role === 'GK') byId[scorerId].total += FPL_WEIGHTS.GOAL_GK;
          else if (role === 'DEF') byId[scorerId].total += FPL_WEIGHTS.GOAL_DEF;
          else byId[scorerId].total += FPL_WEIGHTS.GOAL_OTHER;
        }
      }

      if (!isOwnGoal && assistId && byId[assistId] && !byId[assistId].player?.meta?.excluded) {
        byId[assistId].assists += 1;
        byId[assistId].total += FPL_WEIGHTS.ASSIST;
      }
    }
  }

  return Object.values(byId)
    .filter(row => !row.player?.meta?.excluded && row.apps > 0)
    .sort((a, b) => b.total - a.total || b.wins - a.wins || b.goals - a.goals || b.assists - a.assists || String(a.player?.name || '').localeCompare(String(b.player?.name || '')));
}

function renderSummary(rows) {
  const el = document.getElementById('fplSummary');
  if (!el) return;
  const top = rows[0];
  const totalPlayers = rows.length;
  const totalPoints = rows.reduce((sum, row) => sum + row.total, 0);
  const totalGoals = rows.reduce((sum, row) => sum + row.goals, 0);
  const totalWins = rows.reduce((sum, row) => sum + row.wins, 0);
  el.innerHTML = `
    <article class="fpl-summary-card"><span class="fpl-summary-card__label">Top scorer</span><div class="fpl-summary-card__value">${top ? top.total : 0}</div><div class="fpl-summary-card__sub">${top ? top.player.name : 'No players'}</div></article>
    <article class="fpl-summary-card"><span class="fpl-summary-card__label">Tracked players</span><div class="fpl-summary-card__value">${totalPlayers}</div><div class="fpl-summary-card__sub">Eligible Borderville players</div></article>
    <article class="fpl-summary-card"><span class="fpl-summary-card__label">League points</span><div class="fpl-summary-card__value">${totalPoints}</div><div class="fpl-summary-card__sub">Across all eligible players</div></article>
    <article class="fpl-summary-card"><span class="fpl-summary-card__label">Goals / wins</span><div class="fpl-summary-card__value">${totalGoals} / ${totalWins}</div><div class="fpl-summary-card__sub">Scoring + team results</div></article>`;
}

function renderTable(rows) {
  const body = document.getElementById('fplTableBody');
  if (!body) return;
  const q = normaliseNameQuery(FPL_STATE.search);
  const pos = FPL_STATE.position;
  const filtered = rows.filter(row => playerMatchesQuery(row, q)).filter(row => pos === 'ALL' || displayPosition(row.player) === pos);

  if (!filtered.length) {
    body.innerHTML = '<tr><td colspan="13" class="fpl-empty">No players match those filters.</td></tr>';
    return;
  }

  body.innerHTML = filtered.map((row, idx) => {
    const pos = displayPosition(row.player);
    const photo = profilePhotoUrl(row.player);
    const initials = getInitials(row.player?.name);
    return `
      <tr>
        <td class="col-rank">${idx + 1}</td>
        <td>
          <div class="fpl-player-cell">
            <div class="fpl-avatar ${posClass(pos)}">
              <img src="${photo}" alt="${row.player?.name || 'Player'}" onerror="this.style.display='none'; this.parentElement.setAttribute('data-fallback','${initials}')">
            </div>
            <div>
              <div class="fpl-player-name">${row.player?.name || 'Unknown'}</div>
            </div>
          </div>
        </td>
        <td><span class="pos-pill ${posClass(pos)}">${pos}</span></td>
        <td>${row.apps}</td>
        <td>${row.wins}</td>
        <td>${row.goals}</td>
        <td>${row.assists}</td>
        <td>${row.cleanSheets}</td>
        <td>${row.concede1}</td>
        <td>${row.concede2}</td>
        <td>${row.motm}${row.captainMotm ? ` <span class="muted">(+${row.captainMotm}c)</span>` : ''}</td>
        <td>${row.otf}</td>
        <td class="col-total">${row.total}</td>
      </tr>`;
  }).join('');
}

function wireControls() {
  const search = document.getElementById('fplSearch');
  if (search) search.addEventListener('input', e => { FPL_STATE.search = e.target.value || ''; renderTable(FPL_STATE.rows); });
  const filters = document.getElementById('fplPositionFilters');
  if (filters) {
    filters.addEventListener('click', e => {
      const btn = e.target.closest('button[data-pos]');
      if (!btn) return;
      FPL_STATE.position = btn.dataset.pos || 'ALL';
      filters.querySelectorAll('button[data-pos]').forEach(b => b.classList.toggle('is-active', b === btn));
      renderTable(FPL_STATE.rows);
    });
  }
}

async function init() {
  const status = document.getElementById('fplStatus');
  try {
    const res = await fetch('./data/aggregated.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    FPL_STATE.rows = buildFplTable(data);
    renderSummary(FPL_STATE.rows);
    renderTable(FPL_STATE.rows);
    wireControls();
    if (status) status.textContent = `Loaded ${FPL_STATE.rows.length} players`;
    const lastUpdated = document.getElementById('lastUpdated');
    if (lastUpdated) lastUpdated.textContent = data?.meta?.generatedAt || 'unknown';
  } catch (err) {
    if (status) status.textContent = `Could not load FPL data: ${err.message}`;
    const body = document.getElementById('fplTableBody');
    if (body) body.innerHTML = '<tr><td colspan="13" class="fpl-empty">Could not load data.</td></tr>';
  }
}

document.addEventListener('DOMContentLoaded', init);
