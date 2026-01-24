// season-summary.js
// Renders the season summary block onto pages that include #seasonSummaryMount.
// Fetches ./data/aggregated.json and computes headline season stats.

(function () {
  const MATCH_MINS = 63; // not used yet, but kept for future extensions

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function computeSeasonSummary(payload) {
    const players = Object.values(payload?.players ?? {}).filter(p => !p?.meta?.excluded);
    const sum = (getter) => players.reduce((acc, p) => acc + (Number(getter(p)) || 0), 0);

    const gamesPlayed =
      payload?.meta?.matchesCountForStatsInYear ??
      payload?.meta?.matchesInYear ??
      payload?.meta?.matchesPlayed ??
      payload?.meta?.totalMatches ??
      null;

    const totalOtfs = sum(p => p?.stats?.otfs);
    const totalOgs  = sum(p => p?.stats?.ogs);

    // "Total goals" = goals on the scoreboard (so include OGs).
    const totalGoals = sum(p => p?.stats?.goals) + totalOgs;

    const goalScorers = players.filter(p => (Number(p?.stats?.goals) || 0) > 0).length;

    // Games with a clean sheet (match-level).
    let cleanSheetGames = null;

    // Option 1: payload.cleanSheets events array [{matchId, playerIds:[...]}]
    if (Array.isArray(payload?.cleanSheets)) {
      const ids = new Set(payload.cleanSheets.map(e => e?.matchId).filter(Boolean));
      cleanSheetGames = ids.size;
    }

    // Option 2: payload.matches array -> infer from explicit field or scoreline
    if (cleanSheetGames == null && Array.isArray(payload?.matches)) {
      const extractScores = (m) => {
        const candidates = [
          ["scoreBlue", "scorePink"],
          ["goalsBlue", "goalsPink"],
          ["blueGoals", "pinkGoals"],
          ["blueScore", "pinkScore"],
          ["teamBlueGoals", "teamPinkGoals"],
          ["homeGoals", "awayGoals"],
          ["goalsHome", "goalsAway"],
        ];

        for (const [kb, kp] of candidates) {
          const b = Number(m?.[kb]);
          const p = Number(m?.[kp]);
          if (Number.isFinite(b) && Number.isFinite(p)) return { blue: b, pink: p };
        }

        const s = m?.score ?? m?.result ?? m?.scoreline ?? null;
        if (typeof s === "string") {
          const mm = s.trim().match(/(\d+)\s*[-–:]\s*(\d+)/);
          if (mm) return { blue: Number(mm[1]), pink: Number(mm[2]) };
        }

        return null;
      };

      // If match has an explicit clean sheet list/flag, use that
      let explicitCount = 0;
      let hasExplicitSignal = false;

      for (const m of payload.matches) {
        const cs =
          m?.cleanSheets ??
          m?.cleanSheetPlayerIds ??
          m?.cleanSheetPlayers ??
          m?.cleanSheet ??
          null;

        const hasCs =
          Array.isArray(cs) ? cs.length > 0 :
          typeof cs === "number" ? cs > 0 :
          typeof cs === "boolean" ? cs :
          cs != null ? true : false;

        if (cs != null) hasExplicitSignal = true;
        if (hasCs) explicitCount++;
      }

      if (hasExplicitSignal) {
        cleanSheetGames = explicitCount;
      } else {
        // Fallback: infer from scoreline (either team scored 0)
        let inferred = 0;
        let parsed = 0;

        for (const m of payload.matches) {
          const sc = extractScores(m);
          if (!sc) continue;
          parsed++;
          if (sc.blue === 0 || sc.pink === 0) inferred++;
        }

        if (parsed > 0) cleanSheetGames = inferred;
      }
    }

    // Option 3: some meta might already carry it
    if (cleanSheetGames == null) {
      cleanSheetGames =
        payload?.meta?.cleanSheetGames ??
        payload?.meta?.matchesWithCleanSheet ??
        null;
    }

    return {
      gamesPlayed,
      totalGoals,
      totalOtfs,
      totalOgs,
      goalScorers,
      cleanSheetGames
    };
  }

  function renderSeasonSummaryHtml(s) {
    const v = (x) => (x == null ? "—" : escapeHtml(String(x)));

    return `
      <div class="season-summary-wrap">
        <div class="season-summary">
          <div class="season-summary__title">2026 Season summary</div>
          <div class="season-summary__grid">
            <div class="season-summary__item"><div class="k">Games played</div><div class="n">${v(s?.gamesPlayed)}</div></div>
            <div class="season-summary__item"><div class="k">Total goals</div><div class="n">${v(s?.totalGoals)}</div></div>
            <div class="season-summary__item"><div class="k">Total OTFs</div><div class="n">${v(s?.totalOtfs)}</div></div>
            <div class="season-summary__item"><div class="k">Total OGs</div><div class="n">${v(s?.totalOgs)}</div></div>
            <div class="season-summary__item"><div class="k">Goal scorers</div><div class="n">${v(s?.goalScorers)}</div></div>
            <div class="season-summary__item"><div class="k">Clean sheet games</div><div class="n">${v(s?.cleanSheetGames)}</div></div>
          </div>
        </div>
      </div>
    `;
  }

  async function boot() {
    const mount = document.getElementById("seasonSummaryMount");
    if (!mount) return;

    try {
      const res = await fetch("./data/aggregated.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`aggregated.json HTTP ${res.status}`);
      const payload = await res.json();

      const summary = computeSeasonSummary(payload);
      mount.innerHTML = renderSeasonSummaryHtml(summary);
    } catch (err) {
      // Fail silently on the page (but log for debugging)
      console.error("[season-summary] failed:", err);
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
