let ALL_PLAYERS = [];
let AWARDS_BY_PLAYER_ID = {}; // { [playerId]: [{year, award}] }
let SEASON_SUMMARY = null;

const UI_STATE = {
  nameQuery: "",
  statFilter: "all", // all | ovr | goals | ogs | cleanSheets | otfs | motm
};

// -----------------------------
// Form helpers
// -----------------------------
function parseFormCode(code) {
  if (code === "X") {
    return { result: "x", captain: false, motm: false, label: "X" };
  }

  const motm = code.startsWith("M");
  const captain = code.includes("C");

  const last = code[code.length - 1]; // W / D / L
  const result =
    last === "W" ? "w" :
    last === "D" ? "d" :
    last === "L" ? "l" : "x";

  // show C instead of W/D/L when captain
  const label = captain ? "C" : last;

  return { result, captain, motm, label };
}

function renderFormStrip(formCodes = [], team) {
  const codes = formCodes.slice(0, 10);
  while (codes.length < 10) codes.push("X");

  return `
    <div class="form-strip">
      ${codes.map((code) => {
        const f = parseFormCode(code);
        const classes = [
          "form-badge",
          `is-${f.result}`,
          f.captain ? "is-captain" : "",
          f.captain && team ? `is-${team.toLowerCase()}` : "",
          f.motm ? "is-motm" : ""
        ].filter(Boolean).join(" ");

        return `
          <div class="${classes}" title="${code}">
            <span class="form-label">${f.label}</span>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function playerSearchHaystack(p) {
  const name = (p?.name ?? "").toLowerCase();
  const nick = (p?.meta?.nicknames ?? p?.nicknames ?? "").toLowerCase();
  // We don't need to split — includes() works fine on comma-separated text.
  return `${name} ${nick}`.trim();
}

// -----------------------------
// Tooltip (attach to CARD, not rating)
// -----------------------------
function initCardTooltip() {
  const cardsEl = document.getElementById("cards");
  const tooltip = document.getElementById("tooltip");
  if (!cardsEl || !tooltip) return;

  const show = (text) => {
    tooltip.textContent = text || "";
    tooltip.classList.remove("hidden");
  };

  const hide = () => {
    tooltip.classList.add("hidden");
    tooltip.textContent = "";
  };

  const move = (evt) => {
    // Small offset so we don’t sit under the cursor
    const offset = 14;
    tooltip.style.left = `${evt.clientX + offset}px`;
    tooltip.style.top = `${evt.clientY + offset}px`;
  };

  cardsEl.addEventListener("mousemove", (evt) => {
    if (tooltip.classList.contains("hidden")) return;
    move(evt);
  });

cardsEl.addEventListener("pointermove", (evt) => {
  // Find the topmost real element under the pointer
  const under = document.elementFromPoint(evt.clientX, evt.clientY);
  const maybeCard = under && under.closest ? under.closest(".card") : null;

  if (maybeCard && maybeCard.classList.contains("is-flipped")) {
    if (!tooltip.classList.contains("hidden")) hide();
    return;
  }

  const target = under && under.closest ? under.closest(".rating-block") : null;

  if (!target || !cardsEl.contains(target)) {
    // If we moved off the value area, hide
    if (!tooltip.classList.contains("hidden")) hide();
    return;
  }

  const text = target.getAttribute("data-tooltip");
  if (!text) return;

  show(text);
  move(evt);
});


  // Safety: hide when mouse leaves the whole grid
  cardsEl.addEventListener("mouseleave", hide);
}

// -----------------------------
// Card flip (click to flip)
// -----------------------------
function initCardFlip() {
  const cardsEl = document.getElementById("cards");
  const tooltip = document.getElementById("tooltip");
  if (!cardsEl) return;

  const hideTooltip = () => {
    if (!tooltip) return;
    tooltip.classList.add("hidden");
    tooltip.textContent = "";
  };

  const toggleFlip = (card) => {
    if (!card) return;
    card.classList.toggle("is-flipped");
    // If you flip, kill any tooltip that might be floating
    hideTooltip();
  };

  // Click anywhere on a card flips it
  cardsEl.addEventListener("click", (e) => {
// If the click was on an interactive control inside the card, don't flip.
if (e.target.closest?.(".award-more")) return;

const card = e.target.closest?.(".card");
if (!card || !cardsEl.contains(card)) return;
toggleFlip(card);
  });

  // Keyboard accessibility (Enter/Space)
  cardsEl.addEventListener("keydown", (e) => {
    const card = e.target.closest?.(".card");
    if (!card || !cardsEl.contains(card)) return;

    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleFlip(card);
    }
  });
}


// -----------------------------
// Awards toggle (show +X more)
// -----------------------------
function initAwardsToggle() {
  const cardsEl = document.getElementById("cards");
  if (!cardsEl) return;

  cardsEl.addEventListener("click", (e) => {
    const btn = e.target.closest?.(".award-more");
    if (!btn) return;

    // Prevent the card flip click handler
    e.preventDefault();
    e.stopPropagation();

    const awardsWrap = btn.closest(".awards");
    if (!awardsWrap) return;

    const hidden = awardsWrap.querySelector(".awards-hidden");
    const remaining = Number(btn.getAttribute("data-remaining") || "0");

    const expanded = awardsWrap.classList.toggle("awards-expanded");

    // Be robust even if CSS gets overridden
    if (hidden) hidden.style.display = expanded ? "block" : "none";

    btn.textContent = expanded ? "Show less" : `+${remaining} more`;
  });
}

function normName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/['’]/g, "")     // kill apostrophes
    .replace(/\s+/g, " ")     // collapse spaces
    .trim();
}

function buildAwardsByPlayerId(players, hallOfFamePayload) {
  const byId = {};

  // 1) Build lookup(s) from names/nicknames -> playerId
  const nameToId = new Map();

  for (const p of players) {
    const id = p?.id;
    const fullName = p?.name ?? "";
    if (!id || !fullName) continue;

    nameToId.set(normName(fullName), id);

    // also index nicknames if present (comma separated)
    const nickRaw = p?.meta?.nicknames ?? p?.nicknames ?? "";
    const nickList = String(nickRaw)
      .split(",")
      .map(s => normName(s))
      .filter(Boolean);

    for (const n of nickList) nameToId.set(n, id);
  }

  // 2) Walk HoF years/awards and assign to playerIds
  const years = hallOfFamePayload?.years ?? [];
  for (const y of years) {
    const year = y?.year;
    const awards = y?.awards ?? [];

    for (const a of awards) {
      const award = a?.award ?? "";
      const winners = a?.winners ?? [];

      for (const w of winners) {
        const winnerKey = normName(w);
        const pid = nameToId.get(winnerKey);

        if (!pid) continue; // unresolved winners just won't show (fine for now)

        if (!byId[pid]) byId[pid] = [];
        byId[pid].push({ year, award });
      }
    }
  }

  // 3) Sort awards newest -> oldest per player
  for (const pid of Object.keys(byId)) {
    byId[pid].sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || String(a.award).localeCompare(String(b.award)));
  }

  return byId;
}

function renderAwardChip(x) {
  return `
    <span class="award-chip" title="${escapeHtml(String(x.award))} (${escapeHtml(String(x.year))})">
      <span class="award-year">${escapeHtml(String(x.year))}</span>
      <span class="award-name">${escapeHtml(String(x.award))}</span>
    </span>
  `;
}

function renderAwardsChips(playerId) {
  const list = AWARDS_BY_PLAYER_ID[playerId] ?? [];
  if (!list.length) return `<div class="awards-empty">No previous awards</div>`;

  const maxCollapsed = 4;
  const shown = list.slice(0, maxCollapsed);
  const remaining = Math.max(0, list.length - shown.length);

  const hiddenHtml = remaining > 0
    ? `<div class="awards-hidden" style="display:none;">${list.slice(maxCollapsed).map(renderAwardChip).join("")}</div>`
    : "";

  const toggleBtn = remaining > 0
    ? `
      <div class="awards-toggle">
        <button class="award-more" type="button" data-remaining="${remaining}">+${remaining} more</button>
      </div>
    `
    : "";

  return `
    <div class="awards">
      <div class="awards-title">Previous awards</div>
      <div class="awards-chips awards-chips--shown">
        ${shown.map(renderAwardChip).join("")}
      </div>
      ${hiddenHtml}
      ${toggleBtn}
    </div>
  `;
}


function buildTooltipText(player) {
  const s = player?.stats ?? {};
  const meta = player?.meta ?? {};

  const name = player?.name ?? "Unknown";
  const position = meta.position ?? "—";

  const ovr = s.ovr ?? 0;
  const ovrCombined = s.ovrCombined ?? null;
  const value = ovrToValueMillions(ovr);

  // If you later add richer breakdown fields to aggregated.json,
  // you can surface them here without changing tooltip plumbing.
  const lines = [];
  lines.push(name);
  lines.push(`POS: ${position}`);
  lines.push(`VALUE: £${value}m`);
  lines.push(`OVR: ${ovr}${ovrCombined != null ? ` (combined: ${Number(ovrCombined).toFixed(2)})` : ""}`);

  // Optional: show a couple of key stats for context (keeps tooltip useful even if no breakdown exists)
  const goals = s.goals ?? 0;
  const assists = s.assists ?? 0;
const motmAll = s.motm ?? 0;
const motm2026 = s.motm2026 ?? 0;
lines.push(`G/A/MOTM: ${goals}/${assists}/${motm2026} (${motmAll})`);

  // If your data ever includes a preformatted breakdown string, prefer it:
  // e.g. s.ovrTooltip = "Pace: 12\nShooting: 9\n..."
  if (typeof s.ovrTooltip === "string" && s.ovrTooltip.trim()) {
    lines.push("");
    lines.push(s.ovrTooltip.trim());
  }

  return lines.join("\n");
}

function buildValueTooltipText(player, meta) {
  const s = (player && player.stats) ? player.stats : {};

  // --- helpers ---
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

  const fmtSigned = (v, dp = 2) => {
    const n = Number(v) || 0;
    const sign = n > 0 ? "+" : "";
    return `${sign}${n.toFixed(dp)}`;
  };

  // --- market value mapping (matches your ovrToValueMillions) ---
  const ovr = clamp(num(s.ovr) || 1, 1, 100);
  const minValue = 4.5;
  const maxValue = 15.0;
  const valueRange = maxValue - minValue;           // 10.5
  const t = (ovr - 1) / 99;
  const valueM = minValue + t * valueRange;

  // Because mapping is linear, we can express "base" + "OVR uplift"
  const ovrUpliftM = valueM - minValue;

  // --- replicate calculateOverallScore.js season scoring (RAW, pre-normalisation) ---
  const playedSeason = num(s.caps2026); // used as playedSeason in backend
  const wins = num(s.wins);
  const draws = num(s.draws);
  const goals = num(s.goals);
  const assists = num(s.assists);
  const cleanSheets = num(s.cleanSheets);
  const conceded = num(s.conceded2026);

  const concededExactlyOneMatches = num(s.concededExactlyOneMatches2026);

  const ogs = num(s.ogs);
  const otfs = num(s.otfs);
  const motm = num(s.motm2026);
  const motmCaptain = num(s.motmCaptain2026);
  const winningCaptain = num(s.winningCaptain2026);
  const honourableMentions = num(s.honourableMentions);

  const W = {
    PPG: 25,
    MOTM: 8,
    MOTM_CAP_BONUS: 3,
    WINNING_CAP: 4.0,
    GOAL: 2.0,
    ASSIST: 2.0,
    CLEAN_SHEET: 7.0,
    CONCEDED_EXACTLY_ONE_MATCH: 2.0,
    CONCEDED: -0.35,
    OG: -2.5,
    OTF: -0.15,
    HON_MENTION: 0.15
  };

  const ppg = (playedSeason > 0) ? ((wins + 0.5 * draws) / playedSeason) : 0;

  const contrib = {
    ppg: W.PPG * ppg,
    motm: W.MOTM * motm,
    motmCap: W.MOTM_CAP_BONUS * motmCaptain,
    winCap: W.WINNING_CAP * winningCaptain,
    goals: W.GOAL * goals,
    assists: W.ASSIST * assists,
    cleanSheets: W.CLEAN_SHEET * cleanSheets,
    defUplift: W.CONCEDED_EXACTLY_ONE_MATCH * concededExactlyOneMatches,
    conceded: W.CONCEDED * conceded,
    ogs: W.OG * ogs,
    otfs: W.OTF * otfs,
    hon: W.HON_MENTION * honourableMentions
  };

  const rawSeason =
    contrib.ppg +
    contrib.motm +
    contrib.motmCap +
    contrib.winCap +
    contrib.goals +
    contrib.assists +
    contrib.cleanSheets +
    contrib.defUplift +
    contrib.conceded +
    contrib.ogs +
    contrib.otfs +
    contrib.hon;

  // --- replicate recent inactivity penalty (matches calculateOverallScore.js) ---
  const playedLast10 = num(s.playedLast10);
  const matchesSeason =
    num(meta && (meta.matchesCountForStatsInYear ?? meta.matchesInYear ?? meta.matchesInYear ?? 0));

  const computeRecentPenalty = ({
    playedLast10,
    playedSeason,
    matchesSeason,
    attendanceImmunity = 0.20,
    penaltyMax = 12,
  }) => {
    if (!matchesSeason || matchesSeason <= 0) return 0;

    const attendanceRate = playedSeason / matchesSeason;
    if (attendanceRate >= attendanceImmunity) return 0;

    if (playedLast10 > 2) return 0;

    const inactivity = clamp((2 - playedLast10) / 2, 0, 1);
    return inactivity * penaltyMax;
  };

  const penalty = computeRecentPenalty({
    playedLast10,
    playedSeason,
    matchesSeason,
    attendanceImmunity: 0.20,
    penaltyMax: 12,
  });

  const combined = rawSeason - penalty;

  // --- build tooltip text ---
  const lines = [];

  lines.push(`Market Value: £${valueM.toFixed(1)}m`);
  lines.push(`• Base: £${minValue.toFixed(1)}m`);
  lines.push(`• OVR (${ovr}) uplift: +£${ovrUpliftM.toFixed(1)}m`);
  lines.push("");

  lines.push("Raw score (pre-normalisation):");
  lines.push(`• PPG: ${fmtSigned(contrib.ppg)}  (ppg ${ppg.toFixed(2)})`);
  lines.push(`• Goals: ${fmtSigned(contrib.goals)}  (${goals})`);
  lines.push(`• Assists: ${fmtSigned(contrib.assists)}  (${assists})`);
  lines.push(`• Clean sheets: ${fmtSigned(contrib.cleanSheets)}  (${cleanSheets})`);
  lines.push(`• MOTM: ${fmtSigned(contrib.motm)}  (${motm})`);
  lines.push(`• Captain (win): ${fmtSigned(contrib.winCap)}  (${winningCaptain})`);
  lines.push(`• Captain+MOTM bonus: ${fmtSigned(contrib.motmCap)}  (${motmCaptain})`);
  lines.push(`• Honourable mentions: ${fmtSigned(contrib.hon)}  (${honourableMentions})`);
  lines.push(`• Defensive uplift (concede 1): ${fmtSigned(contrib.defUplift)}  (${concededExactlyOneMatches})`);
  lines.push(`• Conceded: ${fmtSigned(contrib.conceded)}  (${conceded})`);
  lines.push(`• OGs: ${fmtSigned(contrib.ogs)}  (${ogs})`);
  lines.push(`• OTFs: ${fmtSigned(contrib.otfs)}  (${otfs})`);
  lines.push(`= Raw season: ${rawSeason.toFixed(2)}`);

  if (penalty > 0) {
    lines.push(`• Inactivity penalty: -${penalty.toFixed(2)}  (playedLast10 ${playedLast10}, season ${playedSeason}/${matchesSeason})`);
    lines.push(`= Combined: ${combined.toFixed(2)}`);
  }

  return lines.join("\n");
}

// -----------------------------
// Data load
// -----------------------------
async function loadAggregated() {
  const status = document.getElementById("status");
  const cards = document.getElementById("cards");
  const lastUpdated = document.getElementById("lastUpdated");

  // Guard: this script is included on multiple pages
  if (!status || !cards || !lastUpdated) return;

  const nameInput = document.getElementById("playerFilterInput");
  const statSelect = document.getElementById("statFilter");

  try {
    status.textContent = "Fetching aggregated stats…";

   const [resAgg, resHof] = await Promise.all([
  fetch("./data/aggregated.json", { cache: "no-store" }),
  fetch("./data/hall-of-fame.json", { cache: "no-store" })
]);
   if (!resAgg.ok) throw new Error(`aggregated.json HTTP ${resAgg.status}`);

   const hofPayload = resHof.ok ? await resHof.json() : null;

const payload = await resAgg.json();

    const generatedAt = payload?.meta?.generatedAt ?? null;
    lastUpdated.textContent = generatedAt
      ? new Date(generatedAt).toLocaleString("en-GB")
      : "unknown";

    const playersObj = payload?.players ?? {};
    ALL_PLAYERS = Object.values(payload?.players ?? {}).filter(p => !p?.meta?.excluded);

// Build awards map (safe even if hofPayload null)
AWARDS_BY_PLAYER_ID = buildAwardsByPlayerId(ALL_PLAYERS, hofPayload);

    // Wire up name filter
    if (nameInput) {
      nameInput.addEventListener("input", () => {
        UI_STATE.nameQuery = (nameInput.value ?? "").trim().toLowerCase();
        applyFiltersAndRender(cards, status, payload.meta);
      });
    }

    // Wire up stat filter
    if (statSelect) {
      statSelect.addEventListener("change", () => {
        UI_STATE.statFilter = statSelect.value || "all";
        applyFiltersAndRender(cards, status, payload.meta);
      });
    }

    // Tooltip handlers (once)
    initCardTooltip();
    initCardFlip();
    initAwardsToggle();

    applyFiltersAndRender(cards, status, payload.meta);
  } catch (err) {
    console.error(err);
    status.textContent = "Failed to load aggregated stats (check console).";
  }
}

// -----------------------------
// Sorting / filtering
// -----------------------------
function applyFiltersAndRender(cardsEl, statusEl, meta) {
  const q = UI_STATE.nameQuery;
  const mode = UI_STATE.statFilter;

 // 1) Name + Nicknames filter (nicknames are not displayed)
const getSearchHaystack = (p) => {
  const name = (p?.name ?? "").toLowerCase();
  // Prefer meta.nicknames if you store it there; fall back to p.nicknames
  const nick = (p?.meta?.nicknames ?? p?.nicknames ?? "").toLowerCase();
  return `${name} ${nick}`.trim();
};

let list = !q
  ? ALL_PLAYERS.slice()
  : ALL_PLAYERS.filter((p) => getSearchHaystack(p).includes(q));

  // Helpers for OVR sorting (precise first, then displayed)
  const getOvrCombined = (p) => (p?.stats?.ovrCombined ?? p?.stats?.ovr ?? -Infinity);
  const getOvr = (p) => (p?.stats?.ovr ?? 0);

  // 2) Stat filter / sort
  if (mode === "ovr") {
    list.sort((a, b) => {
      const ac = getOvrCombined(a);
      const bc = getOvrCombined(b);
      if (bc !== ac) return bc - ac;

      const ao = getOvr(a);
      const bo = getOvr(b);
      if (bo !== ao) return bo - ao;

      const ag = a?.stats?.goals ?? 0;
      const bg = b?.stats?.goals ?? 0;
      if (bg !== ag) return bg - ag;

      const aa = a?.stats?.assists ?? 0;
      const ba = b?.stats?.assists ?? 0;
      if (ba !== aa) return ba - aa;

      const aCaps = a?.stats?.caps2026 ?? a?.stats?.caps ?? 0;
      const bCaps = b?.stats?.caps2026 ?? b?.stats?.caps ?? 0;
      if (bCaps !== aCaps) return bCaps - aCaps;

      const aOtfs = a?.stats?.otfs ?? 0;
      const bOtfs = b?.stats?.otfs ?? 0;
      if (aOtfs !== bOtfs) return aOtfs - bOtfs; // fewer OTF wins

      const an = (a?.name ?? "").toLowerCase();
      const bn = (b?.name ?? "").toLowerCase();
      return an.localeCompare(bn);
    });
   } else if (mode !== "all") {
  const getStat = (p) => {
    const s = p?.stats ?? {};
    if (mode === "motm2026") return s.motm2026 ?? 0;
    if (mode === "motm") return s.motm ?? 0;
    if (mode === "caps2026") return s.caps2026 ?? 0;
    if (mode === "caps") return s.caps ?? 0;
    return s[mode] ?? 0;
  };

  if (mode === "subs") {
    // Include negatives, sort high → low
    list = list.sort((a, b) => getStat(b) - getStat(a));
  } else {
    // Normal behaviour for goals, assists, etc.
    list = list
      .filter((p) => getStat(p) > 0)
      .sort((a, b) => getStat(b) - getStat(a));
  }
}
 else {
    list.sort((a, b) => {
      const ac = getOvrCombined(a);
      const bc = getOvrCombined(b);
      if (bc !== ac) return bc - ac;

      const ao = getOvr(a);
      const bo = getOvr(b);
      if (bo !== ao) return bo - ao;

      const ag = a?.stats?.goals ?? 0;
      const bg = b?.stats?.goals ?? 0;
      if (bg !== ag) return bg - ag;

      const aa = a?.stats?.assists ?? 0;
      const ba = b?.stats?.assists ?? 0;
      if (ba !== aa) return ba - aa;

      const aCaps = a?.stats?.caps2026 ?? a?.stats?.caps ?? 0;
      const bCaps = b?.stats?.caps2026 ?? b?.stats?.caps ?? 0;
      return bCaps - aCaps;
    });
  }

  // Render
  cardsEl.innerHTML = "";
  renderPlayers(list, cardsEl, meta);

  // Status text
  const base = `Showing ${list.length} of ${ALL_PLAYERS.length} players`;
  const bits = [];
  if (q) bits.push(`name: "${q}"`);
  if (mode === "ovr") bits.push(`sorted: OVR`);
  else if (mode !== "all") bits.push(`filter: ${mode} > 0`);
  statusEl.textContent = bits.length ? `${base} (${bits.join(", ")})` : base;
}

// -----------------------------
// Card render
// -----------------------------
function renderPlayers(players, cardsEl, datasetMeta) {
  const fallbackSrc = "./images/playerPhotos/No_Photo.png";

  for (const p of players) {
    const name = p?.name ?? "Unknown";
    const s = p?.stats ?? {};
    const playerMeta = p?.meta ?? {};
    const team = p?.team;
    const goals = s.goals ?? 0;
    const assists = s.assists ?? 0;
    const ogs = s.ogs ?? 0;
    const cleanSheets = s.cleanSheets ?? 0;
    const otfs = s.otfs ?? 0;
   const motmAll = s.motm ?? 0;
    const motm2026 = s.motm2026 ?? 0;

    const capsAll = s.caps ?? 0;
    const caps2026 = s.caps2026 ?? 0;
    const subs = s.subs ?? 0;

    const ovr = s.ovr ?? 50;
    const value = ovrToValueMillions(ovr);

    const position = playerMeta.position ?? "—";
    const photoSrc = photoPathFromName(name) || fallbackSrc;

    const MATCH_MINS = 63;

    const games = Number(caps2026) || 0; // "games played in 2026"
    const minutesPlayed = games * MATCH_MINS;

    const conceded2026 = Number(s.conceded2026 ?? 0); // already used in buildValueTooltipText
    const isDefOrGk = ["DEF", "GK"].includes(String(position).toUpperCase());

    const perGame = (n) => (games > 0 ? (n / games) : null);
    const minsPer = (n) => (n > 0 ? (minutesPlayed / n) : null);

    const fmtRate = (n) => (n == null ? "—" : n.toFixed(2));
    const fmtMins = (n) => (n == null ? "—" : Math.round(n).toString());

    const goalsPerGame = perGame(goals);
    const minsPerGoal = minsPer(goals);

    const assistsPerGame = perGame(assists);
    const minsPerAssist = minsPer(assists);

    const concededPerGame = isDefOrGk ? perGame(conceded2026) : null;
    const minsPerConceded = isDefOrGk ? minsPer(conceded2026) : null;

    const playerId = p?.id;
    const awardsHtml = playerId ? renderAwardsChips(playerId) : "";

    const el = document.createElement("div");
    el.className = "card";
    el.setAttribute("role", "button");
    el.setAttribute("tabindex", "0");
    el.setAttribute("aria-label", `Flip card for ${name}`);

    el.innerHTML = `
  <div class="card-inner">
    <!-- FRONT -->
    <div class="card-face card-front">
      <div class="overlay">
        <img
          class="club-badge"
          src="./images/bv-logo.png"
          alt="Borderville FC"
          loading="lazy"
          decoding="async"
        />

        <div class="card-header">
          <div class="card-header__title">Borderville FC</div>
          <div class="card-header__subtitle">2026 Season</div>
        </div>

        <div class="card-top">
          <div class="rating-block" data-tooltip="${escapeHtml(buildValueTooltipText(p, datasetMeta))}">
            <div class="mv-label">Market Value</div>
            <div class="mv-value">
              <span class="mv-currency">£</span>${value}<span class="mv-suffix">m</span>
            </div>
          </div>
        </div>

        <div class="portrait">
          <img
            class="player-photo"
            src="${escapeHtml(photoSrc)}"
            alt="${escapeHtml(name)}"
            loading="lazy"
            decoding="async"
            onerror="this.onerror=null; this.src='${escapeHtml(fallbackSrc)}';"
          />
        </div>

        <div class="nameplate">
          <div class="name">${escapeHtml(name)}</div>
          <div class="player-position">${escapeHtml(positionFull(position))}</div>
        </div>

        <div class="stats-columns">
          <div class="stat-col">
            <div class="stat-item">
              <div class="value">${goals}</div>
              <div class="label">GOALS</div>
            </div>
            <div class="stat-item">
              <div class="value">${assists}</div>
              <div class="label">ASSISTS</div>
            </div>
            <div class="stat-item">
              <div class="value">${motm2026} <span class="stat-paren">(${motmAll})</span></div>
              <div class="label">MOTMs (2026 / ALL)</div>
            </div>
            <div class="stat-item">
              <div class="value">${caps2026} <span class="stat-paren">(${capsAll})</span></div>
              <div class="label">CAPS (2026 / ALL)</div>
            </div>
          </div>

          <div class="stat-col">
            <div class="stat-item">
              <div class="value">${cleanSheets}</div>
              <div class="label">CLEAN SHEETS</div>
            </div>
            <div class="stat-item">
              <div class="value">${otfs}</div>
              <div class="label">OTFs</div>
            </div>
            <div class="stat-item">
              <div class="value">${ogs}</div>
              <div class="label">OGs</div>
            </div>
            <div class="stat-item">
              <div class="value">${subs}</div>
              <div class="label">SUBS</div>
            </div>
          </div>
        </div>

        <div class="form-row">
          ${renderFormStrip(s.form, team)}
        </div>
      </div>
    </div>

    <!-- BACK -->
    <div class="card-face card-back">
      <div class="card-back__inner">
        <div class="card-back__title">${escapeHtml(name)}</div>
        <div class="card-back__subtitle">
          ${escapeHtml(positionFull(position))} • ${games} games • ${minutesPlayed} mins
        </div>
      <div class="card-back__body">
        

        <div class="card-back__grid">
          <div class="card-back__stat">
            <div class="k">Goals / game</div>
            <div class="v">${fmtRate(goalsPerGame)}</div>
          </div>
          <div class="card-back__stat">
            <div class="k">Mins / goal</div>
            <div class="v">${fmtMins(minsPerGoal)}</div>
          </div>

          <div class="card-back__stat">
            <div class="k">Assists / game</div>
            <div class="v">${fmtRate(assistsPerGame)}</div>
          </div>
          <div class="card-back__stat">
            <div class="k">Mins / assist</div>
            <div class="v">${fmtMins(minsPerAssist)}</div>
          </div>

          ${
            isDefOrGk
              ? `
          <div class="card-back__stat">
            <div class="k">Conceded / game</div>
            <div class="v">${fmtRate(concededPerGame)}</div>
          </div>
          <div class="card-back__stat">
            <div class="k">Mins / conceded</div>
            <div class="v">${fmtMins(minsPerConceded)}</div>
          </div>
          `
              : `
          <div class="card-back__stat card-back__stat--wide">
            <div class="k">Defensive stats</div>
            <div class="v">—</div>
          </div>
          `
          }
        </div>
        ${awardsHtml}
      </div>
      </div>
    </div>

  </div>
`;

    cardsEl.appendChild(el);
  }
}

// -----------------------------
// Utilities
// -----------------------------
function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function photoPathFromName(name) {
  if (!name || typeof name !== "string") return null;
  const safe = name.trim().replace(/\s+/g, "_");
  return `./images/playerPhotos/${encodeURIComponent(safe)}.png`;
}

function ovrToValueMillions(ovr) {
  const o = Math.max(1, Math.min(100, Number(ovr) || 1));
  const min = 4.5;
  const max = 15.0;
  const t = (o - 1) / 99;
  return (min + t * (max - min)).toFixed(1);
}

function positionFull(pos) {
  const p = String(pos || "").toUpperCase();
  if (p === "GK") return "Goalkeeper";
  if (p === "DEF") return "Defender";
  if (p === "MID") return "Midfielder";
  if (p === "FWD") return "Forward";
  return pos || "";
}

function initTopbarMenu() {
  const btn = document.querySelector(".topbar__toggle");
  const links = document.getElementById("topbarLinks"); // aria-controls points here

  if (!btn || !links) return;

  const close = () => {
    links.classList.remove("is-open");
    btn.setAttribute("aria-expanded", "false");
  };

  const toggle = (e) => {
    e.preventDefault();
    e.stopPropagation();

    const open = links.classList.toggle("is-open");
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  };

  btn.addEventListener("click", toggle, { passive: false });

  // Tap outside closes
  document.addEventListener("click", (e) => {
    if (!links.classList.contains("is-open")) return;
    if (btn.contains(e.target) || links.contains(e.target)) return;
    close();
  });

  // If you rotate / resize back to desktop, force it open-state off
  window.addEventListener("resize", () => {
    if (window.innerWidth > 720) close();
  });
}


// -----------------------------
// Boot (runs on every page)
// -----------------------------
document.addEventListener("DOMContentLoaded", () => {
  // Menu works on every page
  initTopbarMenu();

  // Only load aggregated data on pages that have the required UI
  const status = document.getElementById("status");
  const cards = document.getElementById("cards");
  const lastUpdated = document.getElementById("lastUpdated");
  if (status && cards && lastUpdated) {
    loadAggregated();
  }
});
