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
  // Use explicit match clean-sheet lists from aggregated.json:
  // - pinkCS / blueCS contain the players credited with the CS for that team in that match
  // This correctly includes GKs (even if their meta.position isn't "GK"),
  // and avoids any inference from player meta positions.

  const counts = {};

  const inc = (pid) => {
    if (!pid) return;
    counts[pid] = (counts[pid] || 0) + 1;
  };

  const intersect = (a, b) => {
    const setB = new Set(Array.isArray(b) ? b : []);
    return (Array.isArray(a) ? a : []).filter((x) => setB.has(x));
  };

  (matches || []).forEach((m) => {
    if (!m || m.countsForStats !== true) return;
    if (!monthMatchIds.has(m.id)) return;

    const pinkConceded = asNumber(m.blueGoals, 0);
    const blueConceded = asNumber(m.pinkGoals, 0);

    if (pinkConceded === 0) {
      // Safety: only count players who are actually in Pink team list
      intersect(m.pinkCS, m.playersPink).forEach(inc);
      // If you *trust* pinkCS completely, you can just do:
      // (m.pinkCS || []).forEach(inc);
    }

    if (blueConceded === 0) {
      intersect(m.blueCS, m.playersBlue).forEach(inc);
      // or: (m.blueCS || []).forEach(inc);
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
    if (g.scorerId === g.assistId) return;
    // A partnership is unordered: A scoring from B and B scoring from A
    // both contribute one goal to the same pair.
    const key = [g.scorerId, g.assistId].sort().join("|");
    counts[key] = (counts[key] || 0) + 1;
  });

  const items = Object.entries(counts)
    .map(([key, count]) => {
      const [scorerId, assistId] = key.split("|");
      const name = [playerName(playersById, scorerId), playerName(playersById, assistId)].sort().join(" + ");
      return { scorerId, assistId, name, count: asNumber(count, 0) };
    })
    .filter(x => x.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 5);

  return items.map((p, idx) => {
    const left = `${escapeHtml(playerName(playersById, p.scorerId))} <span class="lb-plus">+</span> ${escapeHtml(playerName(playersById, p.assistId))}`;
    return rowHtmlRanked(idx + 1, left, escapeHtml(String(p.count)));
  });
}

function rankDefensivePartners(matches, goals, playersById, monthMatchIds) {
  const pairs = new Map();
  const goalsByMatch = new Map();
  (goals || []).forEach(goal => {
    if (!goalsByMatch.has(goal.matchId)) goalsByMatch.set(goal.matchId, []);
    goalsByMatch.get(goal.matchId).push(goal);
  });

  (matches || []).forEach(match => {
    if (!match || match.countsForStats !== true || !monthMatchIds.has(match.id)) return;
    // Only count FPL points earned in this shared defensive appearance.
    const scores = new Map(buildFplTable({
      players: playersById, matches: [match], goals: goalsByMatch.get(match.id) || []
    }).map(row => [row.id, row.total]));
    const { getRole } = buildRoleMaps(match);
    for (const team of ["Pink", "Blue"]) {
      const prefix = team.toLowerCase();
      const squad = new Set(match[`players${team}`] || []);
      const defs = [...new Set(match[`${prefix}Defs`] ?? match[`${prefix}DefIds`] ?? [])]
        .filter(id => squad.has(id) && getRole(id) === "DEF" && scores.has(id)).sort();
      // Every unordered pair counts, including each pair within a trio.
      for (let i = 0; i < defs.length; i++) {
        for (let j = i + 1; j < defs.length; j++) {
          const ids = [defs[i], defs[j]];
          const key = ids.join("|");
          const pair = pairs.get(key) || { ids, games: 0, points: 0 };
          pair.games++;
          pair.points += scores.get(ids[0]) + scores.get(ids[1]);
          pairs.set(key, pair);
        }
      }
    }
  });

  return [...pairs.values()].map(pair => ({
    ...pair,
    name: pair.ids.map(id => playerName(playersById, id)).sort().join(" + ")
  })).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name)).slice(0, 5);
}

function computeDefensivePartners(matches, goals, playersById, monthMatchIds) {
  return rankDefensivePartners(matches, goals, playersById, monthMatchIds).map((pair, idx) => {
    const left = pair.ids.map(id => escapeHtml(playerName(playersById, id)))
      .join(' <span class="lb-plus">+</span> ');
    const right = `${pair.points} pts<span class="lb-games">${pair.games} ${pair.games === 1 ? "game" : "games"}</span>`;
    return rowHtmlRanked(idx + 1, left, right);
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
    renderRows($("lbDefensivePartners"), computeDefensivePartners(matches, goals, playersById, matchIdSet));

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
