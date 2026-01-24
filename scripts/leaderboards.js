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

function sortDescThenName(items) {
  return items.sort((a, b) => (b.value - a.value) || a.name.localeCompare(b.name));
}

function topNFromPlayers(playersById, statKey, n = 5, minValue = 1) {
  const items = Object.values(playersById).map((p) => {
    const value = asNumber(p?.stats?.[statKey], 0);
    return { id: p.id, name: p.name || "Unknown", value };
  }).filter(x => x.value >= minValue);

  return sortDescThenName(items).slice(0, n);
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

function buildStrikePartners(partnerships, playersById) {
  // aggregated.json partnerships items are { scorerId, assistId, count, countExclOG }
  if (!Array.isArray(partnerships)) return [];

  const items = partnerships
    .map((p) => {
      // Always prefer excluding OGs; if backend didn't provide countExclOG, fall back to count.
      const count = asNumber(p.countExclOG ?? p.count, 0);
      return {
        scorerId: p.scorerId,
        assistId: p.assistId,
        count
      };
    })
    .filter(x => x.scorerId && x.assistId && x.count > 0)
    .sort((a, b) => b.count - a.count);

  return items.map((p, idx) => {
    const left = `${escapeHtml(playerName(playersById, p.scorerId))} <span class="lb-plus">+</span> ${escapeHtml(playerName(playersById, p.assistId))}`;
    return rowHtmlRanked(idx + 1, left, escapeHtml(String(p.count)));
  });
}

function buildDefensivePartnerships(defensivePartnerships, playersById) {
  // aggregated.json defensivePartnerships items are { playerId1, playerId2, count }
  if (!Array.isArray(defensivePartnerships)) return [];

  const items = defensivePartnerships
    .map((p) => ({
      id1: p.playerId1,
      id2: p.playerId2,
      count: asNumber(p.count, 0)
    }))
    .filter(x => x.id1 && x.id2 && x.count > 0)
    .sort((a, b) => b.count - a.count);

  return items.map((p, idx) => {
    const left = `${escapeHtml(playerName(playersById, p.id1))} <span class="lb-plus">+</span> ${escapeHtml(playerName(playersById, p.id2))}`;
    return rowHtmlRanked(idx + 1, left, escapeHtml(String(p.count)));
  });
}

/**
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

  const rows = debtors.map((x, idx) => {
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
  const lastUpdatedEl = $("lastUpdated");
  if (lastUpdatedEl) {
    lastUpdatedEl.textContent = meta.generatedAt ? new Date(meta.generatedAt).toLocaleString() : "unknown";
  }
  setStatus("Loaded");

  // Top 5s
  renderRows($("lbGoals"), topNFromPlayers(playersById, "goals", 5).map((x, i) =>
    rowHtmlRanked(i + 1, escapeHtml(x.name), escapeHtml(String(x.value)))
  ));

  renderRows($("lbAssists"), topNFromPlayers(playersById, "assists", 5).map((x, i) =>
    rowHtmlRanked(i + 1, escapeHtml(x.name), escapeHtml(String(x.value)))
  ));

  renderRows($("lbCleanSheets"), topNFromPlayers(playersById, "cleanSheets", 5).map((x, i) =>
    rowHtmlRanked(i + 1, escapeHtml(x.name), escapeHtml(String(x.value)))
  ));

  // Strike partners (always excluding OGs)
  const spRows = buildStrikePartners(data.partnerships, playersById);
  if (spRows.length) renderRows($("lbStrikePartners"), spRows);
  else renderEmpty($("lbStrikePartners"), "No partnerships yet.");

  // Defensive partnerships
  const defRows = buildDefensivePartnerships(data.defensivePartnerships, playersById);
  if (defRows.length) renderRows($("lbDefensivePartners"), defRows);
  else renderEmpty($("lbDefensivePartners"), "No defensive partnerships yet.");

  // Naughty list + arrears subtitle
  const { rows: negRows, totalArrears } = buildNegativeSubs(playersById);

  const arrearsEl = $("totalArrears");
  if (arrearsEl) arrearsEl.textContent = `£${totalArrears}`;

  if (negRows.length) renderRows($("lbNegativeSubs"), negRows);
  else renderEmpty($("lbNegativeSubs"), "No one owes money. Suspicious.");
}

main();
