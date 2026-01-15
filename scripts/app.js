let ALL_PLAYERS = [];

const UI_STATE = {
  nameQuery: "",
  statFilter: "all", // all | goals | ogs | cleanSheets | otfs | motm
};

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

  const label = captain ? "C" : last;

  return { result, captain, motm, label };
}

function renderFormStrip(formCodes = []) {
  const codes = formCodes.slice(0, 10);
  while (codes.length < 10) codes.push("X");

  return `
    <div class="form-strip">
      ${codes.map(code => {
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

function formatBreakdown(p) {
  const s = p?.stats ?? {};
  const lines = [
    `OVR: ${s.ovr ?? 50}`,
    `Combined (tie-break): ${typeof s.ovrCombined === "number" ? s.ovrCombined.toFixed(2) : "n/a"}`,
    `Raw season: ${typeof s.ovrRawSeason === "number" ? s.ovrRawSeason.toFixed(2) : "n/a"}`,
    `Penalty: ${typeof s.ovrPenalty === "number" ? s.ovrPenalty.toFixed(2) : "n/a"}`,
    `Played last 10: ${s.playedLast10 ?? "n/a"}`,
    `W/D/L: ${(s.wins ?? 0)}/${(s.draws ?? 0)}/${(s.losses ?? 0)}`,
    `G/A: ${(s.goals ?? 0)}/${(s.assists ?? 0)}`,
    `CS: ${(s.cleanSheets ?? 0)} | Conceded: ${(s.conceded2026 ?? 0)}`,
    `MOTM: ${(s.motm2026 ?? 0)} | MC: ${(s.motmCaptain2026 ?? 0)} | WC: ${(s.winningCaptain2026 ?? 0)}`,
    `OG: ${(s.ogs ?? 0)} | OTF: ${(s.otfs ?? 0)}`,
    `Caps 2026: ${(s.caps2026 ?? 0)} | Subs: ${(s.subs ?? 0)}`,
  ];

  // Use newline; browser will show it in a tooltip
  return lines.join("\n");
}

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
    ALL_PLAYERS = Object.values(playersObj);

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

    // Initial render
    applyFiltersAndRender(cards, status);
  } catch (err) {
    console.error(err);
    status.textContent = "Failed to load aggregated stats (check console).";
  }
}

function applyFiltersAndRender(cardsEl, statusEl) {
  const q = UI_STATE.nameQuery;
  const mode = UI_STATE.statFilter;

  // 1) name filter
  let list = !q
    ? ALL_PLAYERS.slice()
    : ALL_PLAYERS.filter((p) => (p?.name ?? "").toLowerCase().includes(q));

  // 2) stat filter
  if (mode !== "all") {
    const statKey = mode;
    list = list
      .filter((p) => (p?.stats?.[statKey] ?? 0) > 0)
      .sort((a, b) => (b?.stats?.[statKey] ?? 0) - (a?.stats?.[statKey] ?? 0));
  } else {
    // ✅ Default sort (all players): OVR-based, with sensible tie-breakers.
    // 1) ovrCombined (float) desc
    // 2) goals desc
    // 3) assists desc
    // 4) caps2026 desc
    // 5) OTF asc (comedy tie-break)
    // 6) name asc
    list.sort((a, b) => {
      const ac = a?.stats?.ovrCombined ?? -Infinity;
      const bc = b?.stats?.ovrCombined ?? -Infinity;
      if (bc !== ac) return bc - ac;

      const ag = a?.stats?.goals ?? 0;
      const bg = b?.stats?.goals ?? 0;
      if (bg !== ag) return bg - ag;

      const aa = a?.stats?.assists ?? 0;
      const ba = b?.stats?.assists ?? 0;
      if (ba !== aa) return ba - aa;

      const aCaps = a?.stats?.caps2026 ?? 0;
      const bCaps = b?.stats?.caps2026 ?? 0;
      if (bCaps !== aCaps) return bCaps - aCaps;

      const aOtfs = a?.stats?.otfs ?? 0;
      const bOtfs = b?.stats?.otfs ?? 0;
      if (aOtfs !== bOtfs) return aOtfs - bOtfs;

      const an = (a?.name ?? "").toLowerCase();
      const bn = (b?.name ?? "").toLowerCase();
      return an.localeCompare(bn);
    });
  }

  cardsEl.innerHTML = "";
  renderPlayers(list, cardsEl);

  const base = `Showing ${list.length} of ${ALL_PLAYERS.length} players`;
  const bits = [];
  if (q) bits.push(`name: "${q}"`);
  if (mode !== "all") bits.push(`filter: ${mode} > 0`);
  statusEl.textContent = bits.length ? `${base} (${bits.join(", ")})` : base;
}

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

    const position = meta.position ?? "—";
    const photoSrc = photoPathFromName(name) || fallbackSrc;

    const el = document.createElement("div");
    el.className = "card";

    // ✅ Hover breakdown: attach to rating area (and card as a whole for convenience)
    const breakdown = formatBreakdown(p);

   el.innerHTML = `
  <div class="card" data-tooltip="${escapeHtml(breakdown)}">
    <div class="overlay">

      <div class="card-top">
        <div class="rating ovr-pop">${ovr}</div>
        <div class="pos">${escapeHtml(position)}</div>
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
  </div>
`;


    cardsEl.appendChild(el);
  }

  // ✅ subtle animation: re-trigger class each render
  // (works even when re-rendering filtered lists)
  const pops = cardsEl.querySelectorAll(".ovr-pop");
  for (const node of pops) {
    node.classList.remove("ovr-pop");
    // Force reflow so animation restarts
    void node.offsetWidth;
    node.classList.add("ovr-pop");
  }
}

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

(function initTooltip() {
  const tooltip = document.getElementById("tooltip");
  if (!tooltip) return;

  document.addEventListener("mousemove", (e) => {
    if (tooltip.classList.contains("hidden")) return;

    tooltip.style.left = e.clientX + 14 + "px";
    tooltip.style.top  = e.clientY + 14 + "px";
  });

  document.addEventListener("mouseover", (e) => {
    const target = e.target.closest("[data-tooltip]");
    if (!target) return;

    tooltip.textContent = target.dataset.tooltip || "";
    tooltip.classList.remove("hidden");
  });

  document.addEventListener("mouseout", (e) => {
    if (e.target.closest("[data-tooltip]")) {
      tooltip.classList.add("hidden");
    }
  });
})();


loadAggregated();
