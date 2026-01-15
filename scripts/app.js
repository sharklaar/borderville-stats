async function loadPlayers() {
  const status = document.getElementById("status");
  const cards = document.getElementById("cards");
  const lastUpdated = document.getElementById("lastUpdated");

  try {
    status.textContent = "Fetching players…";

    const res = await fetch("./data/players.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const payload = await res.json();

    const players = payload.players ?? [];
    lastUpdated.textContent = payload.lastUpdated ?? "unknown";

    cards.innerHTML = "";
    for (const p of players) {
      const el = document.createElement("div");
      el.className = "card";
      el.innerHTML = `
        <h2>${escapeHtml(p.name ?? "Unknown")}</h2>
        <div class="meta">Apps: ${p.apps ?? 0} · Goals: ${p.goals ?? 0} · Assists: ${p.assists ?? 0} · OGs: ${p.ownGoals ?? 0}</div>
      `;
      cards.appendChild(el);
    }

    status.textContent = `Loaded ${players.length} players`;
  } catch (err) {
    console.error(err);
    status.textContent = "Failed to load data (check console).";
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

loadPlayers();
