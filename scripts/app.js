let ALL_PLAYERS = [];

async function loadAggregated() {
  const status = document.getElementById("status");
  const cards = document.getElementById("cards");
  const lastUpdated = document.getElementById("lastUpdated");
  const filterInput = document.getElementById("playerFilterInput");

  try {
    status.textContent = "Fetching aggregated stats…";

    // IMPORTANT: relative path (no leading slash) for GitHub Pages project sites
    const res = await fetch("./data/aggregated.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const payload = await res.json();

    // meta display
    const generatedAt = payload?.meta?.generatedAt ?? null;
    lastUpdated.textContent = generatedAt
      ? new Date(generatedAt).toLocaleString()
      : "unknown";

    // players is an object keyed by playerId
    const playersObj = payload?.players ?? {};
    const players = Object.values(playersObj);

    // Optional: sort by goals then assists then played, descending
    players.sort((a, b) => {
      const ag = a?.stats?.goals ?? 0;
      const bg = b?.stats?.goals ?? 0;
      if (bg !== ag) return bg - ag;

      const aa = a?.stats?.assists ?? 0;
      const ba = b?.stats?.assists ?? 0;
      if (ba !== aa) return ba - aa;

      const ap = a?.stats?.played ?? 0;
      const bp = b?.stats?.played ?? 0;
      return bp - ap;
    });

    ALL_PLAYERS = players;

    // Initial render (unfiltered)
    renderInto(cards, ALL_PLAYERS);
    status.textContent = `Loaded ${ALL_PLAYERS.length} players`;

    // Wire up filter (if the input exists on the page)
    if (filterInput) {
      filterInput.addEventListener("input", () => {
        const q = (filterInput.value ?? "").trim().toLowerCase();

        const filtered = !q
          ? ALL_PLAYERS
          : ALL_PLAYERS.filter((p) => (p?.name ?? "").toLowerCase().includes(q));

        renderInto(cards, filtered);

        status.textContent = q
          ? `Showing ${filtered.length} of ${ALL_PLAYERS.length} players`
          : `Loaded ${ALL_PLAYERS.length} players`;
      });
    }
  } catch (err) {
    console.error(err);
    status.textContent = "Failed to load aggregated stats (check console).";
  }
}

function renderInto(cardsEl, players) {
  cardsEl.innerHTML = "";
  renderPlayers(players, cardsEl);
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
    const motm = s.motm ?? 0;
    const motm2026 = s.motm2026 ?? 0;
    const caps = s.caps ?? 0;
    const caps2026 = s.caps2026 ?? 0;
    const subs = s.subs ?? 0;

    const position = meta.position ?? "—";

    const photoPrimary = photoPathFromName(name); // may or may not exist

    const el = document.createElement("div");
    el.className = "card";
    el.innerHTML = `
      <div class="card-header">
        <img
          class="player-photo"
          src="${escapeHtml(fallbackSrc)}"
          alt="${escapeHtml(name)}"
          loading="lazy"
        />
        <h2>${escapeHtml(name)}</h2>
      </div>

      <ul class="meta">
        <li><strong>Pos</strong>: ${escapeHtml(position)}</li>
        <li><strong>Caps</strong>: ${caps} (${caps2026} in 2026)</li>
        <li><strong>Subs</strong>: ${subs}</li>
        <li><strong>Goals</strong>: ${goals}</li>
        <li><strong>Assists</strong>: ${assists}</li>
        <li><strong>OGs</strong>: ${ogs}</li>
        <li><strong>CS</strong>: ${cleanSheets}</li>
        <li><strong>MOTM</strong>: ${motm} (${motm2026} in 2026)</li>
      </ul>
    `;

    // Avoid 404 spam: only swap to the real image if it successfully preloads
    const imgEl = el.querySelector(".player-photo");
    setPlayerImage(imgEl, photoPrimary, fallbackSrc);

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

  // "Sam Sinclair" -> "Sam_Sinclair.png"
  const safe = name.trim().replace(/\s+/g, "_");
  return `./images/playerPhotos/${encodeURIComponent(safe)}.png`;
}

/**
 * Avoids 404 spam:
 * - Do NOT set <img src="primary"> until we've confirmed it loads.
 * - Start with fallback already showing.
 */
function setPlayerImage(imgEl, primarySrc, fallbackSrc) {
  if (!imgEl) return;

  if (!primarySrc) {
    imgEl.src = fallbackSrc;
    return;
  }

  const testImg = new Image();
  testImg.onload = () => {
    imgEl.src = primarySrc;
  };
  testImg.onerror = () => {
    imgEl.src = fallbackSrc;
  };
  testImg.src = primarySrc;
}

loadAggregated();
