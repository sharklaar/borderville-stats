const FPL_STATE = { search: '', position: 'ALL', rows: [] };

function normaliseNameQuery(v) { return String(v || '').trim().toLowerCase(); }
function getInitials(name = '?') {
  return String(name)
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase() || '')
    .join('') || '?';
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
  if (p === 'fwd' || p === '6/8/10') return 'is-fwd';
  return '';
}
function profilePhotoUrl(player) {
  const name = String(player?.name || '').trim();
  if (!name) return '';
  const file = name
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('_');
  return `./images/playerPhotos/${file}.png`;
}
function playerMatchesQuery(row, q) {
  if (!q) return true;
  const hay = [row?.player?.name || '', row?.player?.meta?.nicknames || '', displayPosition(row?.player)].join(' ').toLowerCase();
  return hay.includes(q);
}

function renderSummary(rows) {
  const el = document.getElementById('fplSummary');
  if (!el) return;

  const topOverall = rows[0] || null;
  const topDef = rows.find(row => ['DEF', 'GK'].includes(displayPosition(row.player))) || null;
  const topMid = rows.find(row => displayPosition(row.player) === 'MID') || null;
  const topFwd = rows.find(row =>
  ['FWD', '6/8/10'].includes(displayPosition(row.player))
) || null;

  const card = (label, row) => `
    <article class="fpl-summary-card">
      <span class="fpl-summary-card__label">${label}</span>
      <div class="fpl-summary-card__value">${row ? row.total : 0}</div>
      <div class="fpl-summary-card__sub">${row ? row.player.name : 'No eligible player'}</div>
    </article>`;

  el.innerHTML = [
    card('Top scorer', topOverall),
    card('Top defender (inc. GK)', topDef),
    card('Top midfielder', topMid),
    card('Top forward', topFwd),
  ].join('');
}

function renderTable(rows) {
  const body = document.getElementById('fplTableBody');
  if (!body) return;
  const q = normaliseNameQuery(FPL_STATE.search);
  const pos = FPL_STATE.position;
  const filtered = rows
  .filter(row => playerMatchesQuery(row, q))
  .filter(row => {
    const playerPos = displayPosition(row.player);

    if (pos === 'ALL') return true;
    if (pos === 'FWD') return ['FWD', '6/8/10'].includes(playerPos);

    return playerPos === pos;
  });
  
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
      [...filters.querySelectorAll('button[data-pos]')].forEach(b => b.classList.toggle('is-active', b === btn));
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
    const hasRoleFields = safeArray(data?.matches).some(
      m => m && ('pinkDefs' in m || 'blueDefs' in m || 'pinkDefIds' in m || 'blueDefIds' in m || 'pinkGKId' in m || 'blueGKId' in m || 'pinkGkId' in m || 'blueGkId' in m)
    );
    if (!hasRoleFields) {
      throw new Error('aggregated.json does not yet include FPL role fields. Re-run the updated aggregate.js first.');
    }

    const rows = buildFplTable(data);
    FPL_STATE.rows = rows;
    renderSummary(rows);
    renderTable(rows);
    wireControls();

    if (status) status.textContent = `FPL View ready · ${rows.length} players`;

    const lastUpdated = document.getElementById('lastUpdated');
    if (lastUpdated) {
      lastUpdated.textContent = data?.meta?.generatedAt
        ? new Date(data.meta.generatedAt).toLocaleString()
        : 'unknown';
    }

    const menuBtn = document.querySelector('.topbar__toggle');
    const links = document.getElementById('topbarLinks');
    if (menuBtn && links) {
      menuBtn.addEventListener('click', () => {
        const expanded = menuBtn.getAttribute('aria-expanded') === 'true';
        menuBtn.setAttribute('aria-expanded', String(!expanded));
        links.classList.toggle('is-open');
      });
    }
  } catch (err) {
    console.error(err);
    if (status) status.textContent = `Unable to load FPL View: ${err.message}`;
    const body = document.getElementById('fplTableBody');
    if (body) body.innerHTML = `<tr><td colspan="13" class="fpl-empty">${err.message}</td></tr>`;
  }
}

init();
