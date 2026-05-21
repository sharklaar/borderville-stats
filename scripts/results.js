// results.js
// Renders a conventional match results list from data/aggregated.json

function escapeHTML(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function fmtDateISO(isoDateOnly) {
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

function namesFromIds(ids, playersById) {
  return uniq(ids).map((id) => playersById[id]?.name || "Unknown");
}

function isInTeam(id, teamIds) {
  return Array.isArray(teamIds) && teamIds.includes(id);
}

function otherTeam(team) {
  return team === "PINK" ? "BLUE" : "PINK";
}

function teamForPlayer(playerId, match) {
  if (isInTeam(playerId, match.playersPink || [])) return "PINK";
  if (isInTeam(playerId, match.playersBlue || [])) return "BLUE";
  return null;
}

function formatScorerLine(goalEvent, playersById) {
  const scorerName = playersById[goalEvent.scorerId]?.name || "Unknown";
  const assistName = goalEvent.assistId
    ? (playersById[goalEvent.assistId]?.name || "Unknown")
    : null;

  const scorerText = goalEvent.isOwnGoal ? `${scorerName} OG` : scorerName;
  return assistName ? `${scorerText} (${assistName})` : scorerText;
}

function buildMatchDerived(match, goals, playersById) {
  const goalsForMatch = goals.filter((g) => g.matchId === match.id);

  const scorers = { PINK: [], BLUE: [] };
  const otfs = { PINK: [], BLUE: [] };

  for (const ev of goalsForMatch) {
    const scorerTeam = teamForPlayer(ev.scorerId, match) || "PINK";
    const creditedTeam = ev.isOwnGoal ? otherTeam(scorerTeam) : scorerTeam;
    scorers[creditedTeam].push(formatScorerLine(ev, playersById));
  }

  for (const playerId of match.otfIds || []) {
    const team = teamForPlayer(playerId, match);
    if (team) otfs[team].push(playersById[playerId]?.name || "Unknown");
  }

  return { scorers, otfs };
}

function renderLines(items, emptyText = "—") {
  const safeItems = Array.isArray(items) ? items : [];
  if (!safeItems.length) return `<div class="muted result-line">${escapeHTML(emptyText)}</div>`;
  return safeItems
    .map((item) => `<div class="result-line">${escapeHTML(item)}</div>`)
    .join("");
}

function renderTeamResult({ side, scorers, otfs, captain }) {
  const sideClass = side.toLowerCase();
  const isPink = side === "PINK";
  const shirt = isPink ? "👚" : "👕";

  return `
    <section class="team-result team-result-${sideClass}">
      <div class="team-result-section">
        <div class="team-result-label">Goals</div>
        <div class="team-result-lines">
          ${renderLines(scorers)}
        </div>
      </div>

      <div class="team-result-section">
        <div class="team-result-label">OTFs</div>
        <div class="team-result-lines">
          ${renderLines(otfs)}
        </div>
      </div>

      <div class="team-result-captain">
        <span class="team-result-label">Captain:</span>
        <span>${shirt} ${escapeHTML(captain || "—")}</span>
      </div>
    </section>
  `;
}

function renderInlineScoreline(pinkScore, blueScore) {
  return `
    <div class="inline-scoreline">
      <div class="inline-team inline-team-pink">
        <span class="team-pill pill-pink"></span>
        <span class="team-name">Pink</span>
      </div>

      <div class="inline-score">
        <span>${pinkScore}</span>
        <span class="dash">–</span>
        <span>${blueScore}</span>
      </div>

      <div class="inline-team inline-team-blue">
        <span class="team-name">Blue</span>
        <span class="team-pill pill-blue"></span>
      </div>
    </div>
  `;
}

function renderMatchCard(match, derived, playersById) {
  const dateStr = fmtDateISO(match.date);

  const pinkScore = Number(match.pinkGoals ?? 0);
  const blueScore = Number(match.blueGoals ?? 0);

  const motmNames = namesFromIds(match.motmIds || [], playersById);
  const hmNames = namesFromIds(match.honourableMentionIds || [], playersById);

  const captainPink = match.captainPinkId ? playersById[match.captainPinkId]?.name : null;
  const captainBlue = match.captainBlueId ? playersById[match.captainBlueId]?.name : null;

  const notes = (match.notes ?? "").trim();
  const isNonStat = match.countsForStats === false;

  const recapBox = `
    <section class="match-recap section">
      <h3>Match recap</h3>

      <div class="recap-grid">
        <div class="kv">
          <div class="k">MOTM</div>
          <div class="v">⭐ ${escapeHTML(motmNames.join(", ") || "—")}</div>
        </div>

        <div class="kv">
          <div class="k">Honourable Mentions</div>
          <div class="v">👏 ${escapeHTML(hmNames.join(", ") || "—")}</div>
        </div>
      </div>

      <div class="kv kv-spaced">
        <div class="k">Notes</div>
        <div class="notes">${notes ? escapeHTML(notes) : `<span class="muted">—</span>`}</div>
      </div>
    </section>
  `;

  return `
    <article class="match-card">
      <div class="match-top">
        <div class="match-meta">
          <div>${escapeHTML(dateStr)}${match.name ? ` · <span class="muted">${escapeHTML(match.name)}</span>` : ""}</div>
          <div class="results-flex">
            ${isNonStat ? `<span class="badge">Non-stat match</span>` : ""}
            <span class="badge">Borderville</span>
          </div>
        </div>

        <div class="match-result-grid">
          ${renderInlineScoreline(pinkScore, blueScore)}

          <div class="team-stats-grid">
            ${renderTeamResult({
              side: "PINK",
              scorers: derived.scorers.PINK,
              otfs: derived.otfs.PINK,
              captain: captainPink,
            })}

            ${renderTeamResult({
              side: "BLUE",
              scorers: derived.scorers.BLUE,
              otfs: derived.otfs.BLUE,
              captain: captainBlue,
            })}
          </div>
        </div>
      </div>

      ${recapBox}
    </article>
  `;
}

async function loadAggregated() {
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
    const playersById = Object.fromEntries(
      Object.values(payload.players ?? {}).map((p) => [p.id, p])
    );

    const matches = payload.matches ?? [];
    const goals = payload.goals ?? [];

    const sorted = matches
      .filter((m) => m?.date)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));

    root.innerHTML = sorted.length
      ? sorted
          .map((m) => renderMatchCard(m, buildMatchDerived(m, goals, playersById), playersById))
          .join("")
      : `<div class="match-card results-empty"><div class="muted">No matches found</div></div>`;
  } catch (err) {
    root.innerHTML = `<div class="match-card results-empty"><div class="muted">Error loading results: ${escapeHTML(err.message)}</div></div>`;
    console.error(err);
  }
}

document.addEventListener("DOMContentLoaded", main);
