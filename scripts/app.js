async function loadAggregated() {
  const status = document.getElementById("status");
  const cards = document.getElementById("cards");
  const lastUpdated = document.getElementById("lastUpdated");

  try {
    status.textContent = "Fetching aggregated stats…";

    // IMPORTANT: relative path (no leading slash) for GitHub Pages project sites
    const res = await fetch("./data/aggregated.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const payload = await res.json();

    // meta display
    const generatedAt = payload?.meta?.generatedAt ?? null;
    lastUpdated.textContent = generatedAt ? new Date(generatedAt).toLocaleString() : "unknown";

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

    cards.innerHTML = "";

    for (const p of players) {
      const name = p?.name ?? "Unknown";
      const s = p?.stats ?? {};
      const meta = p?.meta ?? {};

      const goals = s.goals ?? 0;
      const assists = s.assists ?? 0;
      const ogs = s.ogs ?? 0;
      const cleanSheets = s.cleanSheets ?? 0;
      const motm = s.motm ?? 0;
     const caps = s.caps ?? 0;
      const caps2026 = s.caps2026 ?? 0;
      const subs = s.subs ?? 0;

      const position = meta.position ?? "—";

      const el = document.createElement("div");
      el.className = "card";
      el.innerHTML = `
        <h2>${escapeHtml(name)}</h2>
        <div class="meta">
            Pos: ${escapeHtml(position)} ·
            Caps: ${caps} (${caps2026} in 2026) ·
            Subs: ${subs} ·
            Goals: ${goals} ·
            Assists: ${assists} ·
            OGs: ${ogs} ·
            CS: ${cleanSheets} ·
            MOTM: ${motm}
        </div>
      `;
      cards.appendChild(el);
    }

    status.textContent = `Loaded ${players.length} players`;
  } catch (err) {
    console.error(err);
    status.textContent = "Failed to load aggregated stats (check console).";
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

loadAggregated();
