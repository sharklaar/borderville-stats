let ALL_PLAYERS = [];

const UI_STATE = {
  nameQuery: "",
  statFilter: "all", // all | goals | ogs | cleanSheets | otfs | motm
};

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
      ? new Date(generatedAt).toLocaleString()
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
    const statKey = mode; // same keys as stats object
    list = list
      .filter((p) => (p?.stats?.[statKey] ?? 0) > 0)
      .sort((a, b) => (b?.stats?.[statKey] ?? 0) - (a?.stats?.[statKey] ?? 0));
  } else {
    // default sort when "All players" selected
    list.sort((a, b) => {
      const ag = a?.stats?.goals ?? 0;
      const bg = b?.stats?.goals ?? 0;
      if (bg !== ag) return bg - ag;

      const aa = a?.stats?.assists ?? 0;
      const ba = b?.stats?.assists ?? 0;
      if (ba !== aa) return ba - aa;

      const ac = a?.stats?.caps ?? 0;
      const bc = b?.stats?.caps ?? 0;
      return bc - ac;
    });
  }

  // render
  cardsEl.innerHTML = "";
  renderPlayers(list, cardsEl);

  // status text
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
    const motm2026 = s.motm2026 ?? 0;
    const caps = s.caps ?? 0;
    const caps2026 = s.caps2026 ?? 0;
    const subs = s.subs ?? 0;

    const position = meta.position ?? "—";

    const photoSrc = photoPathFromName(name) || fallbackSrc;

    const el = document.createElement("div");
    el.className = "card";
  el.innerHTML = `
  <div class="overlay">
    <div class="card-top">
      <div class="rating">${caps2026}</div>
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

    <div class="formplate">FORM: (coming soon)</div>
  </div>
`;

    cardsEl.appendChild(el);
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

loadAggregated();
