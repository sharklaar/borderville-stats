/* global document, fetch */

const DATA_URL = "./data/aggregated.json";

const $ = (id) => document.getElementById(id);

function asNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setStatus(text) {
  const el = $("status");
  if (el) el.textContent = text;
}

function playerName(playersById, playerId) {
  return playersById?.[playerId]?.name || "Unknown";
}

function playerPos(playersById, playerId) {
  return playersById?.[playerId]?.meta?.position || null;
}

function renderEmpty(targetEl, text = "Nothing to show yet.") {
  if (!targetEl) return;
  targetEl.innerHTML = `
    <div class="lb-row lb-row--empty">
      <div class="lb-name">${escapeHtml(text)}</div>
    </div>
  `;
}

function renderRows(targetEl, rowsHtml) {
  if (!targetEl) return;
  if (!rowsHtml || !rowsHtml.length) {
    renderEmpty(targetEl);
    return;
  }
  targetEl.innerHTML = rowsHtml.join("");
}

function rowHtmlRanked(rank, leftHtml, rightHtml) {
  return `
    <div class="lb-row">
      <div class="lb-left">
        <span class="lb-rank">${rank}</span>
        <span class="lb-name">${leftHtml}</span>
      </div>
      <div class="lb-value">${rightHtml}</div>
    </div>
  `;
}

/* Mobile menu toggle (so this page behaves like the others even without app.js) */
function wireTopbarMenu() {
  const btn = document.querySelector(".topbar__toggle");
  const links = document.getElementById("topbarLinks");
  if (!btn || !links) return;

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    const isOpen = links.classList.toggle("is-open");
    btn.setAttribute("aria-expanded", String(isOpen));
  });
}

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function monthKeyFromISODate(isoDate) {
  // isoDate expected "YYYY-MM-DD"
  if (!isoDate || typeof isoDate !== "string") return null;
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return `${m[1]}-${m[2]}`; // YYYY-MM
}

function labelForMonthKey(key) {
  const m = key.match(/^(\d{4})-(\d{2})$/);
  if (!m) return key;
  const year = m[1];
  const monthIdx = Math.max(0, Math.min(11, Number(m[2]) - 1));
  return `${MONTH_NAMES[monthIdx]} ${year}`;
}

function buildMonthsWithMatches(matches) {
  const set = new Set();
  (matches || []).forEach((m) => {
    if (!m || m.countsForStats !== true) return;
    const key = monthKeyFromISODate(m.date);
    if (key) set.add(key);
  });
  return Array.from(set).sort(); // YYYY-MM sorts fine
}

function wireMonthFilter(monthKeys, onChange) {
  const select = $("monthFilter");
  if (!select) return;

  select.innerHTML = [
    `<option value="ALL">All time</option>`,
    ...monthKeys.map((k) => `<option value="${escapeHtml(k)}">${escapeHtml(labelForMonthKey(k))}</option>`)
  ].join("");

  select.addEventListener("change", () => {
    const val = select.value || "ALL";
    onChange(val);
  });
}

function topNFromCounts(countsById, playersById, n = 5, minValue = 1) {
  const items = Object.entries(countsById || {}).map(([id, value]) => ({
    id,
    name: playerName(playersById, id),
    value: asNumber(value, 0)
  })).filter(x => x.value >= minValue);

  items.sort((a, b) => (b.value - a.value) || a.name.localeCompare(b.name));
  return items.slice(0, n);
}

/* ===== Month-filtered computations ===== */

function matchIdsForMonth(matches, monthKey) {
  const ids = new Set();
  (matches || []).forEach((m) => {
    if (!m || m.countsForStats !== true) return;
    const mk = monthKeyFromISODate(m.date);
    if (monthKey === "ALL" || (mk && mk === monthKey)) ids.add(m.id);
  });
  return ids;
}

function computeGoals(goals, matchIdSet) {
  const counts = {};
  (goals || []).forEach((g) => {
    if (!g || g.isOwnGoal) return;
    if (!matchIdSet.has(g.matchId)) return;
    if (!g.scorerId) return;
    counts[g.scorerId] = (counts[g.scorerId] || 0) + 1;
  });
  return counts;
}

function computeAssists(goals, matchIdSet) {
  const counts = {};
  (goals || []).forEach((g) => {
    if (!g || g.isOwnGoal) return;
    if (!matchIdSet.has(g.matchId)) return;
    if (!g.assistId) return;
    counts[g.assistId] = (counts[g.assistId] || 0) + 1;
  });
  return counts;
}

function computeCleanSheets(matches, playersById, monthMatchIds) {
  // aggregated.json matches currently don’t include an explicit list of clean-sheet earners,
  // so we infer CS from the match score:
  // - If Pink conceded 0 (blueGoals === 0), Pink team gets a clean sheet
  // - If Blue conceded 0 (pinkGoals === 0), Blue team gets a clean sheet
  // We award to DEF + GK only (matches your existing stats patterns). :contentReference[oaicite:4]{index=4}
  const counts = {};

  (matches || []).forEach((m) => {
    if (!m || m.countsForStats !== true) return;
    if (!monthMatchIds.has(m.id)) return;

    const pinkConceded = asNumber(m.blueGoals, 0);
    const blueConceded = asNumber(m.pinkGoals, 0);

    if (pinkConceded === 0) {
      (m.playersPink || []).forEach((pid) => {
        const pos = playerPos(playersById, pid);
        if (pos === "DEF" || pos === "GK") counts[pid] = (counts[pid] || 0) + 1;
      });
    }

    if (blueConceded === 0) {
      (m.playersBlue || []).forEach((pid) => {
        const pos = playerPos(playersById, pid);
        if (pos === "DEF" || pos === "GK") counts[pid] = (counts[pid] || 0) + 1;
      });
    }
  });

  return counts;
}

function computeStrikePartners(goals, playersById, monthMatchIds) {
  const counts = {};

  (goals || []).forEach((g) => {
    if (!g || g.isOwnGoal) return;
    if (!monthMatchIds.has(g.matchId)) return;
    if (!g.scorerId || !g.assistId) return;
    const key = `${g.scorerId}|${g.assistId}`;
    counts[key] = (counts[key] || 0) + 1;
  });

  const items = Object.entries(counts)
    .map(([key, count]) => {
      const [scorerId, assistId] = key.split("|");
      return { scorerId, assistId, count: asNumber(count, 0) };
    })
    .filter(x => x.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return items.map((p, idx) => {
    const left = `${escapeHtml(playerName(playersById, p.scorerId))} <span class="lb-plus">+</span> ${escapeHtml(playerName(playersById, p.assistId))}`;
    return rowHtmlRanked(idx + 1, left, escapeHtml(String(p.count)));
  });
}

function computeDefensivePartners(matches, playersById, monthMatchIds) {
  // Exactly TWO defenders (position==="DEF") sharing a clean sheet on the same team in a match.
  const pairCounts = new Map();

  (matches || []).forEach((m) => {
    if (!m || m.countsForStats !== true) return;
    if (!monthMatchIds.has(m.id)) return;

    const pinkConceded = asNumber(m.blueGoals, 0);
    const blueConceded = asNumber(m.pinkGoals, 0);

    const maybeAddPairs = (playerIds) => {
      const defs = (playerIds || []).filter((pid) => playerPos(playersById, pid) === "DEF");
      if (defs.length < 2) return;

      for (let i = 0; i < defs.length - 1; i++) {
        for (let j = i + 1; j < defs.length; j++) {
          const a = defs[i];
          const b = defs[j];
          const id1 = a < b ? a : b;
          const id2 = a < b ? b : a;
          const key = `${id1}|${id2}`;
          pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
        }
      }
    };

    if (pinkConceded === 0) maybeAddPairs(m.playersPink);
    if (blueConceded === 0) maybeAddPairs(m.playersBlue);
  });

  const items = Array.from(pairCounts.entries())
    .map(([key, count]) => {
      const [id1, id2] = key.split("|");
      return { id1, id2, count: asNumber(count, 0) };
    })
    .filter(x => x.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return items.map((p, idx) => {
    const left = `${escapeHtml(playerName(playersById, p.id1))} <span class="lb-plus">+</span> ${escapeHtml(playerName(playersById, p.id2))}`;
    return rowHtmlRanked(idx + 1, left, escapeHtml(String(p.count)));
  });
}

/**
 * Subs leaderboard (intentionally NOT month-filtered)
 * Returns:
 *  - rows: HTML rows for the naughty list
 *  - totalArrears: number (in £) assuming £4 per owed game
 */
function buildNegativeSubs(playersById) {
  const debtors = Object.values(playersById).map((p) => {
    const subs = asNumber(p?.stats?.subs, 0);
    return { id: p.id, name: p.name || "Unknown", subs };
  }).filter(x => x.subs < 0);

  const totalArrears = debtors.reduce((sum, x) => sum + (Math.abs(x.subs) * 4), 0);

  debtors.sort((a, b) => a.subs - b.subs || a.name.localeCompare(b.name)); // most negative first

  const rows = debtors.slice(0, 5).map((x, idx) => {
    const left = escapeHtml(x.name);
    const right = `<span class="lb-neg">${escapeHtml(String(x.subs))}</span>`;
    return rowHtmlRanked(idx + 1, left, right);
  });

  return { rows, totalArrears };
}

async function main() {
  wireTopbarMenu();
  setStatus("Loading data…");

  let data;
  try {
    const res = await fetch(DATA_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    setStatus("Failed to load aggregated.json");
    console.error(err);
    ["lbGoals","lbAssists","lbCleanSheets","lbStrikePartners","lbDefensivePartners","lbNegativeSubs"]
      .forEach(id => renderEmpty($(id), "Data load failed."));
    return;
  }

  const playersById = data.players || {};
  const meta = data.meta || {};
  const matches = data.matches || [];
  const goals = data.goals || [];

  const lastUpdatedEl = $("lastUpdated");
  if (lastUpdatedEl) {
    lastUpdatedEl.textContent = meta.generatedAt ? new Date(meta.generatedAt).toLocaleString() : "unknown";
  }

  const monthKeys = buildMonthsWithMatches(matches);

  function renderFor(monthKey) {
    const matchIdSet = matchIdsForMonth(matches, monthKey);

    const goalsCounts = computeGoals(goals, matchIdSet);
    const assistsCounts = computeAssists(goals, matchIdSet);
    const csCounts = computeCleanSheets(matches, playersById, matchIdSet);

    renderRows($("lbGoals"), topNFromCounts(goalsCounts, playersById, 5).map((x, i) =>
      rowHtmlRanked(i + 1, escapeHtml(x.name), escapeHtml(String(x.value)))
    ));

    renderRows($("lbAssists"), topNFromCounts(assistsCounts, playersById, 5).map((x, i) =>
      rowHtmlRanked(i + 1, escapeHtml(x.name), escapeHtml(String(x.value)))
    ));

    renderRows($("lbCleanSheets"), topNFromCounts(csCounts, playersById, 5).map((x, i) =>
      rowHtmlRanked(i + 1, escapeHtml(x.name), escapeHtml(String(x.value)))
    ));

    renderRows($("lbStrikePartners"), computeStrikePartners(goals, playersById, matchIdSet));
    renderRows($("lbDefensivePartners"), computeDefensivePartners(matches, playersById, matchIdSet));

    // Subs leaderboard stays global
    const { rows: negRows, totalArrears } = buildNegativeSubs(playersById);
    renderRows($("lbNegativeSubs"), negRows);
    const arrearsEl = $("arrearsTotal");
    if (arrearsEl) arrearsEl.textContent = `£${totalArrears}`;

    const filterLabel = monthKey === "ALL" ? "All time" : labelForMonthKey(monthKey);
    setStatus(`Loaded • Filter: ${filterLabel}`);
  }

  wireMonthFilter(monthKeys, renderFor);

  // Default
  const select = $("monthFilter");
  if (select) select.value = "ALL";
  renderFor("ALL");
}

main();
