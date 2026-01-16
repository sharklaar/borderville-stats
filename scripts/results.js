// results.js
// Renders a BBC-ish match results list from data/aggregated.json
// Constraints honoured:
// - Pink always "home" (left)
// - No halves, no substitutions, no event timestamps
// - Match notes are free text from Matches table

function escapeHTML(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function fmtDateISO(isoDateOnly) {
  // isoDateOnly: "YYYY-MM-DD"
  if (!isoDateOnly) return "Unknown date";
  const d = new Date(`${isoDateOnly}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoDateOnly;
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function uniq(arr) {
  return [...new Set(Array.isArray(arr) ? arr : [])];
}

function countByName(names) {
  const map = new Map();
  for (const n of names) map.set(n, (map.get(n) || 0) + 1);
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => (count > 1 ? `${name} (x${count})` : name));
}

function isInTeam(id, teamIds) {
  return Array.isArray(teamIds) && teamIds.includes(id);
}

function otherTeam(team) {
  return team === "PINK" ? "BLUE" : "PINK";
}

function buildMatchDerived(match, goals, playersById) {
  const playersPink = match.playersPink || [];
  const playersBlue = match.playersBlue || [];

  const goalsForMatch = goals.filter((g) => g.matchId === match.id);

  // Goals credited to team (own goals count for the OTHER team)
  const creditedGoals = { PINK: [], BLUE: [] };

  // Assists credited to the assister's team (including OG assists if present in data)
  const assistsByTeam = { PINK: [], BLUE: [] };

  for (const ev of goalsForMatch) {
    const scorerName = playersById[ev.scorerId]?.name || "Unknown";
    const assistName = ev.assistId ? (playersById[ev.assistId]?.name || "Unknown") : null;

    const scorerTeam = isInTeam(ev.scorerId, playersPink)
      ? "PINK"
      : isInTeam(ev.scorerId, playersBlue)
        ? "BLUE"
        : null;

    // If scorer isn't in either team list, we still show the name, but we can't team-assign safely.
    // We'll dump it into "PINK" by default to avoid losing data, but mark as unknown team.
    const safeScorerTeam = scorerTeam || "PINK";

    const creditedTeam = ev.isOwnGoal ? otherTeam(safeScorerTeam) : safeScorerTeam;

    creditedGoals[creditedTeam].push(ev.isOwnGoal ? `${scorerName} (OG)` : scorerName);

    if (assistName) {
      const assistTeam = isInTeam(ev.assistId, playersPink)
        ? "PINK"
        : isInTeam(ev.assistId, playersBlue)
          ? "BLUE"
          : safeScorerTeam;

      assistsByTeam[assistTeam].push(assistName);
    }
  }

  return {
    creditedGoals,
    assistsByTeam,
  };
}

function namesFromIds(ids, playersById) {
  return uniq(ids).map((id) => playersById[id]?.name || "Unknown");
}

function renderMatchCard(match, derived, playersById) {
  const dateStr = fmtDateISO(match.date);

  const pinkScore = Number(match.pinkGoals ?? 0);
  const blueScore = Number(match.blueGoals ?? 0);

  const motmNames = namesFromIds(match.motmIds || [], playersById);
  const captainPink = match.captainPinkId ? (playersById[match.captainPinkId]?.name || "Unknown") : null;
  const captainBlue = match.captainBlueId ? (playersById[match.captainBlueId]?.name || "Unknown") : null;

  const otfNames = namesFromIds(match.otfIds || [], playersById);
  const notes = (match.notes ?? "").trim();

  const isNonStat = match.countsForStats === false;

  const goalsPink = countByName(derived.creditedGoals.PINK);
  const goalsBlue = countByName(derived.creditedGoals.BLUE);

  const astPink = countByName(derived.assistsByTeam.PINK);
  const astBlue = countByName(derived.assistsByTeam.BLUE);

  const goalsSection = (goalsPink.length || goalsBlue.length)
    ? `
      <div class="section">
        <h3>Goals</h3>
        <div class="two-col">
          <div>
            <div class="muted" style="margin-bottom:6px;">Pink</div>
            ${goalsPink.length ? `<ul class="list">${goalsPink.map(n => `<li>${escapeHTML(n)}</li>`).join("")}</ul>` : `<div class="muted">None</div>`}
          </div>
          <div>
            <div class="muted" style="margin-bottom:6px;">Blue</div>
            ${goalsBlue.length ? `<ul class="list">${goalsBlue.map(n => `<li>${escapeHTML(n)}</li>`).join("")}</ul>` : `<div class="muted">None</div>`}
          </div>
        </div>
      </div>
    `
    : "";

  const assistsSection = (astPink.length || astBlue.length)
    ? `
      <div class="section">
        <h3>Assists</h3>
        <div class="two-col">
          <div>
            <div class="muted" style="margin-bottom:6px;">Pink</div>
            ${astPink.length ? `<ul class="list">${astPink.map(n => `<li>${escapeHTML(n)}</li>`).join("")}</ul>` : `<div class="muted">None</div>`}
          </div>
          <div>
            <div class="muted" style="margin-bottom:6px;">Blue</div>
            ${astBlue.length ? `<ul class="list">${astBlue.map(n => `<li>${escapeHTML(n)}</li>`).join("")}</ul>` : `<div class="muted">None</div>`}
          </div>
        </div>
      </div>
    `
    : "";

  const notesSection = notes
    ? `
      <div class="section">
        <h3>Match notes</h3>
        <div class="notes">${escapeHTML(notes)}</div>
      </div>
    `
    : "";

  const motmLine = motmNames.length ? motmNames.join(", ") : "—";
  const otfLine = otfNames.length ? otfNames.join(", ") : "—";

  return `
    <article class="match-card">
      <div class="match-top">
        <div class="match-meta">
          <div>${escapeHTML(dateStr)}${match.name ? ` · <span class="muted">${escapeHTML(match.name)}</span>` : ""}</div>
          <div style="display:flex; gap:8px; align-items:center;">
            ${isNonStat ? `<span class="badge">Non-stat match</span>` : ``}
            <span class="badge">Pink home</span>
          </div>
        </div>

        <div class="scoreline">
          <div class="team" style="justify-content:flex-start;">
            <span class="team-pill pill-pink"></span>
            <span class="team-name">Pink</span>
          </div>

          <div class="score">
            <span>${escapeHTML(pinkScore)}</span>
            <span class="dash">–</span>
            <span>${escapeHTML(blueScore)}</span>
          </div>

          <div class="team" style="justify-content:flex-end;">
            <span class="team-name">Blue</span>
            <span class="team-pill pill-blue"></span>
          </div>
        </div>
      </div>

      <div class="match-body">
        <div style="display:grid; gap:12px;">
          ${goalsSection}
          ${assistsSection}
          ${notesSection}
        </div>

        <div class="section">
          <h3>Match info</h3>
          <div class="kv">
            <div class="k">MOTM</div>
            <div class="v">⭐ ${escapeHTML(motmLine)}</div>
          </div>

          <div class="kv" style="margin-top:10px;">
            <div class="k">Captains</div>
            <div class="v">🧢 Pink: ${escapeHTML(captainPink || "—")}<br/>🧢 Blue: ${escapeHTML(captainBlue || "—")}</div>
          </div>

          <div class="kv" style="margin-top:10px;">
            <div class="k">OTFs</div>
            <div class="v">🎯 ${escapeHTML(otfLine)}</div>
          </div>

          <div class="kv" style="margin-top:10px;">
            <div class="k">Players</div>
            <div class="v">
              Pink: ${escapeHTML((match.playersPink || []).length)}<br/>
              Blue: ${escapeHTML((match.playersBlue || []).length)}
            </div>
          </div>
        </div>
      </div>
    </article>
  `;
}

async function loadAggregated() {
  // simple cache-bust so GH Pages doesn't serve stale JSON during dev
  const res = await fetch(`data/aggregated.json?cb=${Date.now()}`);
  if (!res.ok) throw new Error(`Failed to load aggregated.json: ${res.status}`);
  return res.json();
}

function initTopbarToggle() {
  const btn = document.querySelector(".topbar__toggle");
  const links = document.querySelector(".topbar__links");
  if (!btn || !links) return;

  btn.addEventListener("click", () => {
    const open = links.classList.toggle("is-open");
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  });
}

async function main() {
  initTopbarToggle();

  const root = document.getElementById("resultsList");
  if (!root) return;

  try {
    const payload = await loadAggregated();

    const playersObj = payload?.players ?? {};
    const playersById = Object.fromEntries(
      Object.values(playersObj).map((p) => [p.id, p])
    );

    const matches = Array.isArray(payload?.matches) ? payload.matches : [];
    const goals = Array.isArray(payload?.goals) ? payload.goals : [];

    const sorted = [...matches]
      .filter((m) => m && m.date)
      .sort((a, b) => String(b.date).localeCompare(String(a.date))); // date is YYYY-MM-DD

    if (!sorted.length) {
      root.innerHTML = `<div class="match-card"><div class="muted">No matches found in aggregated.json</div></div>`;
      return;
    }

    const html = sorted
      .map((m) => {
        const derived = buildMatchDerived(m, goals, playersById);
        return renderMatchCard(m, derived, playersById);
      })
      .join("");

    root.innerHTML = html;
  } catch (err) {
    root.innerHTML = `<div class="match-card"><div class="muted">Error loading results: ${escapeHTML(err.message)}</div></div>`;
    console.error(err);
  }
}

document.addEventListener("DOMContentLoaded", main);
