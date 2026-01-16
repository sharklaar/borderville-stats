let ALL_PLAYERS = [];

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

function renderFormStrip(formCodes = []) {
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

  cardsEl.addEventListener("mouseover", (evt) => {
    const card = evt.target.closest(".card");
    if (!card || !cardsEl.contains(card)) return;

    const text = card.getAttribute("data-tooltip");
    if (!text) return;

    show(text);
    move(evt);
  });

  cardsEl.addEventListener("mouseout", (evt) => {
    const card = evt.target.closest(".card");
    // If we’ve left the cards area entirely, hide
    if (!card) hide();
  });

  // Safety: hide when mouse leaves the whole grid
  cardsEl.addEventListener("mouseleave", hide);
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
  const motm = s.motm ?? 0;
  lines.push(`G/A/MOTM: ${goals}/${assists}/${motm}`);

  // If your data ever includes a preformatted breakdown string, prefer it:
  // e.g. s.ovrTooltip = "Pace: 12\nShooting: 9\n..."
  if (typeof s.ovrTooltip === "string" && s.ovrTooltip.trim()) {
    lines.push("");
    lines.push(s.ovrTooltip.trim());
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

  const nameInput = document.getElementById("playerFilterInput");
  const statSelect = document.getElementById("statFilter");

  try {
    status.textContent = "Fetching aggregated stats…";

    const res = await fetch("./data/aggregated.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const payload = await res.json();

    const generatedAt = payload?.meta?.generatedAt ?? null;
    lastUpdated.textContent = generatedAt
      ? new Date(generatedAt).toLocaleString("en-GB")
      : "unknown";

    const playersObj = payload?.players ?? {};
    ALL_PLAYERS = Object.values(playersObj).filter(p => !p?.meta?.excluded);

    // Wire up name filter
    if (nameInput) {
      nameInput.addEventListener("input", () => {
        UI_STATE.nameQuery = (nameInput.value ?? "").trim().toLowerCase();
        applyFiltersAndRender(cards, status);
      });
    }

    // Wire up stat filter
    if (statSelect) {
      statSelect.addEventListener("change", () => {
        UI_STATE.statFilter = statSelect.value || "all";
        applyFiltersAndRender(cards, status);
      });
    }

    // Tooltip handlers (once)
    initCardTooltip();

    applyFiltersAndRender(cards, status);
  } catch (err) {
    console.error(err);
    status.textContent = "Failed to load aggregated stats (check console).";
  }
}

// -----------------------------
// Sorting / filtering
// -----------------------------
function applyFiltersAndRender(cardsEl, statusEl) {
  const q = UI_STATE.nameQuery;
  const mode = UI_STATE.statFilter;

  // 1) Name filter
  let list = !q
    ? ALL_PLAYERS.slice()
    : ALL_PLAYERS.filter((p) => (p?.name ?? "").toLowerCase().includes(q));

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
    const statKey = mode;
    list = list
      .filter((p) => (p?.stats?.[statKey] ?? 0) > 0)
      .sort((a, b) => (b?.stats?.[statKey] ?? 0) - (a?.stats?.[statKey] ?? 0));
  } else {
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
  renderPlayers(list, cardsEl);

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
function renderPlayers(players, cardsEl) {
  const fallbackSrc = "./images/playerPhotos/No_Photo.png";

  for (const p of players) {
    const name = p?.name ?? "Unknown";
    const s = p?.stats ?? {};
    const meta = p?.meta ?? {};

    const goals = s.goals ?? 0;
    const assists = s.assists ?? 0;
    const ogs = s.ogs ?? 0;
    const cleanSheets = s.cleanSheets ?? 0;
    const otfs = s.otfs ?? 0;
    const motm = s.motm ?? 0;
    const caps = s.caps ?? 0;
    const subs = s.subs ?? 0;

    const ovr = s.ovr ?? 50;
    const value = ovrToValueMillions(ovr);

    const position = meta.position ?? "—";
    const photoSrc = photoPathFromName(name) || fallbackSrc;

    const el = document.createElement("div");
    el.className = "card";

    // Tooltip data lives on the card
    el.setAttribute("data-tooltip", buildTooltipText(p));

    el.innerHTML = `
      <div class="overlay">
        <div class="card-top">
          <div class="rating-block">
            <div class="rating">£${value}m</div>
            <div class="pos">${escapeHtml(position)}</div>
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
        </div>

        <div class="stats-columns">
          <div class="stat-col">
            <div class="stat-item">
              <div class="value">${goals}</div>
              <div class="label">GOALS</div>
            </div>
            <div class="stat-item">
              <div class="value">${assists}</div>
              <div class="label">AST</div>
            </div>
            <div class="stat-item">
              <div class="value">${motm}</div>
              <div class="label">MOTM</div>
            </div>
            <div class="stat-item">
              <div class="value">${caps}</div>
              <div class="label">CAPS</div>
            </div>
          </div>

          <div class="stat-col">
            <div class="stat-item">
              <div class="value">${cleanSheets}</div>
              <div class="label">CS</div>
            </div>
            <div class="stat-item">
              <div class="value">${otfs}</div>
              <div class="label">OTF</div>
            </div>
            <div class="stat-item">
              <div class="value">${ogs}</div>
              <div class="label">OGS</div>
            </div>
            <div class="stat-item">
              <div class="value">${subs}</div>
              <div class="label">SUBS</div>
            </div>
          </div>
        </div>

        <div class="form-row">
          ${renderFormStrip(s.form)}
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

loadAggregated();
