const fs = require("fs");
const path = require("path");
const { fetchAllRecords, getConfig } = require("./fetchAirtable");
const { computeCombined, normaliseTo100 } = require("./calculateOverallScore");

const TABLES = {
  PLAYERS: "tbl58HHS5mKXWlAby",
  GOALS: "tblOF43XjjpmpkY2Q",
  MATCHES: "tbl4EwCT6YXa1TyWs",
};

// If Airtable field names change, update these in one place:
const FIELDS = {
  // Players
  NAME: "Name",
  STARTING_CAPS: "Starting Caps",
  STARTING_MOTM: "Starting MOMs",
  STARTING_SUBS: "Starting Subs",
  SUBS_ADDED: "Subs Added",
  POSITION: "Position",
  DOB: "Date of Birth",
  PROFILE_PHOTO: "Profile Photo",
  EXCLUDED: "Excluded", // NEW
  NICKNAMES: "Nicknames",

  // Matches
  MATCH_NAME: "Name",
  DATE_PLAYED: "Date Played",
  WINNING_TEAM: "Winning Team",
  PINK_PLAYERS: "Pink Team Players",
  BLUE_PLAYERS: "Blue Team Players",
  CLEAN_PINK: "Clean Sheet (Pink)",
  CLEAN_BLUE: "Clean Sheet (Blue)",
  PINK_GK: "Pink Goalkeeper",
  BLUE_GK: "Blue Goalkeeper",
  PINK_DEFS: "Pink Defenders",
  BLUE_DEFS: "Blue Defenders",
  OTFS: "OTFs (Over The Fences)",
  NOTES: "Notes",
  PINK_GOALS: "Pink Goals",
  BLUE_GOALS: "Blue Goals",
  MOTM: "Player of the Match",
  HONOURABLE_MENTIONS: "Honourable Mentions",

  // match flag
  COUNTS_FOR_STATS: "Counts for stats",

  // captains
  CAPTAIN_PINK: "Captain (Pink)",
  CAPTAIN_BLUE: "Captain (Blue)",

  // Goals
  GOAL_MATCH: "Match",
  GOAL_SCORER: "Scorer",
  GOAL_ASSIST: "Assist",
  GOAL_IS_OWN: "Is Own Goal",
};

const asArray = (v) => (Array.isArray(v) ? v : []);
const asSingleId = (v) => {
  const a = asArray(v);
  return a.length ? a[0] : null;
};
const asNumber = (v) => {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function parseISODate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? null : d;
}

function inYear(dateObj, year) {
  return dateObj && dateObj.getUTCFullYear() === year;
}

function toISODateOnly(dateObj) {
  if (!dateObj) return null;
  return dateObj.toISOString().slice(0, 10);
}

function ensurePlayer(outPlayers, playerId, name = "Unknown") {
  if (!outPlayers[playerId]) {
    outPlayers[playerId] = {
      id: playerId,
      name,
      stats: {
        wins: 0,
        draws: 0,
        losses: 0,
        goals: 0,
        assists: 0,
        ogs: 0,
        cleanSheets: 0,
        gkCleanSheets: 0, // only counts when GK explicitly set and in clean sheet list
        otfs: 0,

        // HM totals (stat matches only)
        honourableMentions: 0,

        // Season defensive-ish stats (stat matches only)
        conceded2026: 0,
        concededExactlyOneMatches2026: 0, // NEW: match-count where DEF/GK team conceded exactly 1

        // captain outcome stats (stat matches only)
        winningCaptain2026: 0,
        motmCaptain2026: 0,

        // NOTE: "subs" is subscription credit balance (can go negative)
        subs: 0,

        caps: 0,
        caps2026: 0,

        motm: 0, // baseline legacy MOTM injected when loading Players
        motm2026: 0, // stat matches in-year

        // captain totals (kept for completeness, not used directly by OVR)
        captain: 0,
        captain2026: 0,

        // last 10 participation count (derived from form)
        playedLast10: 0,

        // OVR outputs
        ovr: 0, // 0..100 integer
        ovrRawSeason: 0, // float (debug)
        ovrPenalty: 0, // float (debug)
        ovrCombined: 0, // float (debug / tie-break)

        form: [], // last 10 match codes, most recent first
      },
      meta: {},
    };
  }
  return outPlayers[playerId];
}

function addPairs(ids, onPair) {
  const list = [...new Set(asArray(ids))];
  if (list.length < 2) return;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const [a, b] = [list[i], list[j]].sort();
      onPair(a, b);
    }
  }
}

function writeJsonPretty(filepath, obj) {
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  fs.writeFileSync(filepath, JSON.stringify(obj, null, 2), "utf8");
}

function pairKey(a, b) {
  const [x, y] = [a, b].sort();
  return `${x}::${y}`;
}

function mapToSortedPairs(map) {
  return Object.entries(map)
    .map(([key, v]) => {
      const [scorerId, assistId] = key.split("::");
      return { scorerId, assistId, ...v };
    })
    .sort((a, b) => b.count - a.count);
}

/**
 * FORM code rules (last 10 matches overall, most recent first):
 *
 * X  - didn't play
 * W  - win
 * L  - lose
 * D  - draw
 * CL - captain, lost
 * CD - captain, draw
 * CW - captain, win
 * MD - MOM, draw
 * MW - MOM, won  (MOM cannot be on losing team)
 * MCD - MOM + Captain, draw
 * MCW - MOM + Captain, won
 */
function formCodeForPlayerInMatch(playerId, m) {
  const inPink = m.pink.includes(playerId);
  const inBlue = m.blue.includes(playerId);

  if (!inPink && !inBlue) return "X";

  const team = inPink ? "PINK" : "BLUE";

  const isCaptain =
    (team === "PINK" && m.captainPink === playerId) ||
    (team === "BLUE" && m.captainBlue === playerId);

  const isMotm = m.motm.includes(playerId);

  const isDraw = m.winningTeam === "DRAW";
  const isWin = !isDraw && m.winningTeam === team;
  const isLoss = !isDraw && m.winningTeam !== team;

  if (isMotm && isLoss) {
    throw new Error(
      `Invalid MOTM: player ${playerId} is MOTM in a loss (match ${m.id})`
    );
  }

  if (isDraw) {
    if (isMotm && isCaptain) return "MCD";
    if (isMotm) return "MD";
    if (isCaptain) return "CD";
    return "D";
  }

  if (isWin) {
    if (isMotm && isCaptain) return "MCW";
    if (isMotm) return "MW";
    if (isCaptain) return "CW";
    return "W";
  }

  if (isCaptain) return "CL";
  return "L";
}

async function main() {
  console.log("Starting aggregate.js…", process.cwd());
  const { token, baseId } = getConfig();

  const [playersRaw, matchesRaw, goalsRaw] = await Promise.all([
    fetchAllRecords({ baseId, tableId: TABLES.PLAYERS, token }),
    fetchAllRecords({ baseId, tableId: TABLES.MATCHES, token }),
    fetchAllRecords({ baseId, tableId: TABLES.GOALS, token }),
  ]);

  // ----------------------------
  // Players
  // ----------------------------
  const playersById = {};
  for (const r of playersRaw) {
    const f = r.fields || {};
    playersById[r.id] = {
      id: r.id,
      name: f[FIELDS.NAME] || "Unknown",
      startingCaps: asNumber(f[FIELDS.STARTING_CAPS]),
      startingMotm: asNumber(f[FIELDS.STARTING_MOTM]),
      startingSubs: asNumber(f[FIELDS.STARTING_SUBS]),
      subsAdded: asNumber(f[FIELDS.SUBS_ADDED]),
      position: f[FIELDS.POSITION] || null,
      dob: f[FIELDS.DOB] || null,
      profilePhoto: f[FIELDS.PROFILE_PHOTO] || null,
      nicknames: f[FIELDS.NICKNAMES] || "",
      excluded: Boolean(f[FIELDS.EXCLUDED]),
    };
  }

  const outPlayers = {};
  Object.values(playersById).forEach((p) => {
    const o = ensurePlayer(outPlayers, p.id, p.name);

    o.stats.motm = p.startingMotm || 0;
    o.stats.motm2026 = 0;

    o.meta = {
      position: p.position,
      dob: p.dob,
      profilePhoto: p.profilePhoto,
      excluded: p.excluded,
      nicknames: p.nicknames,
    };
  });

  // ----------------------------
  // Matches
  // ----------------------------
  const matches = matchesRaw.map((r) => {
    const f = r.fields || {};
    return {
      id: r.id,
      name: f[FIELDS.MATCH_NAME] || r.id,
      date: parseISODate(f[FIELDS.DATE_PLAYED]),
      winningTeam: f[FIELDS.WINNING_TEAM] || null,

      pink: asArray(f[FIELDS.PINK_PLAYERS]),
      blue: asArray(f[FIELDS.BLUE_PLAYERS]),

      cleanPink: asArray(f[FIELDS.CLEAN_PINK]),
      cleanBlue: asArray(f[FIELDS.CLEAN_BLUE]),

      pinkGK: asSingleId(f[FIELDS.PINK_GK]),
      blueGK: asSingleId(f[FIELDS.BLUE_GK]),

      pinkDefs: asArray(f[FIELDS.PINK_DEFS]),
      blueDefs: asArray(f[FIELDS.BLUE_DEFS]),

      otfs: asArray(f[FIELDS.OTFS]),
      motm: asArray(f[FIELDS.MOTM]),
      honourableMentions: asArray(f[FIELDS.HONOURABLE_MENTIONS]),

      captainPink: asSingleId(f[FIELDS.CAPTAIN_PINK]),
      captainBlue: asSingleId(f[FIELDS.CAPTAIN_BLUE]),

      notes: f[FIELDS.NOTES] || null,
      pinkGoals: asNumber(f[FIELDS.PINK_GOALS]),
      blueGoals: asNumber(f[FIELDS.BLUE_GOALS]),

      countsForStats: f[FIELDS.COUNTS_FOR_STATS] ?? true,
    };
  });

  const matchById = Object.fromEntries(matches.map((m) => [m.id, m]));

  // ----------------------------
  // Per-match aggregation
  // ----------------------------
  const YEAR = 2026;

  const defensivePartnershipCounts = {};
  const defensivePartnershipsGA = {};
  const defensiveUnitsGA = {};

  let matchesInYear = 0;
  let matchesCountForStatsInYear = 0;
  let matchesNonStatInYear = 0;

  for (const m of matches) {
    if (!m.date || !inYear(m.date, YEAR)) continue;
    matchesInYear++;

    const pink = new Set(m.pink);
    const blue = new Set(m.blue);

    // ALWAYS: appearances (2026) — even non-stat matches affect caps/subs
    pink.forEach((pid) => ensurePlayer(outPlayers, pid, playersById[pid]?.name).stats.caps2026++);
    blue.forEach((pid) => ensurePlayer(outPlayers, pid, playersById[pid]?.name).stats.caps2026++);

    if (!m.countsForStats) {
      matchesNonStatInYear++;
      continue;
    }
    matchesCountForStatsInYear++;

    // Captain totals (stat matches only)
    if (m.captainPink) {
      ensurePlayer(outPlayers, m.captainPink, playersById[m.captainPink]?.name).stats.captain++;
      ensurePlayer(outPlayers, m.captainPink, playersById[m.captainPink]?.name).stats.captain2026++;
    }
    if (m.captainBlue) {
      ensurePlayer(outPlayers, m.captainBlue, playersById[m.captainBlue]?.name).stats.captain++;
      ensurePlayer(outPlayers, m.captainBlue, playersById[m.captainBlue]?.name).stats.captain2026++;
    }

    // W/D/L (stat matches only)
    if (m.winningTeam === "DRAW") {
      pink.forEach((pid) => ensurePlayer(outPlayers, pid).stats.draws++);
      blue.forEach((pid) => ensurePlayer(outPlayers, pid).stats.draws++);
    } else if (m.winningTeam === "PINK") {
      pink.forEach((pid) => ensurePlayer(outPlayers, pid).stats.wins++);
      blue.forEach((pid) => ensurePlayer(outPlayers, pid).stats.losses++);
    } else if (m.winningTeam === "BLUE") {
      blue.forEach((pid) => ensurePlayer(outPlayers, pid).stats.wins++);
      pink.forEach((pid) => ensurePlayer(outPlayers, pid).stats.losses++);
    }

    // Conceded goals per player (season 2026, stat matches only)
    pink.forEach((pid) => { ensurePlayer(outPlayers, pid).stats.conceded2026 += m.blueGoals; });
    blue.forEach((pid) => { ensurePlayer(outPlayers, pid).stats.conceded2026 += m.pinkGoals; });

    // Winning captain (stat matches only)
    if (m.winningTeam === "PINK" && m.captainPink) {
      ensurePlayer(outPlayers, m.captainPink).stats.winningCaptain2026 += 1;
    } else if (m.winningTeam === "BLUE" && m.captainBlue) {
      ensurePlayer(outPlayers, m.captainBlue).stats.winningCaptain2026 += 1;
    }

    // MOTM + Captain (stat matches only)
    if (m.captainPink && m.motm.includes(m.captainPink)) {
      ensurePlayer(outPlayers, m.captainPink).stats.motmCaptain2026 += 1;
    }
    if (m.captainBlue && m.motm.includes(m.captainBlue)) {
      ensurePlayer(outPlayers, m.captainBlue).stats.motmCaptain2026 += 1;
    }

    // Honourable Mentions (stat matches only)
    m.honourableMentions.forEach((pid) => {
      ensurePlayer(outPlayers, pid).stats.honourableMentions++;
    });

    // Clean sheets (stat matches only)
    m.cleanPink.forEach((pid) => ensurePlayer(outPlayers, pid, playersById[pid]?.name).stats.cleanSheets++);
    m.cleanBlue.forEach((pid) => ensurePlayer(outPlayers, pid, playersById[pid]?.name).stats.cleanSheets++);

    // GK clean sheets (stat matches only)
    if (m.pinkGK && m.cleanPink.includes(m.pinkGK)) {
      ensurePlayer(outPlayers, m.pinkGK, playersById[m.pinkGK]?.name).stats.gkCleanSheets++;
    }
    if (m.blueGK && m.cleanBlue.includes(m.blueGK)) {
      ensurePlayer(outPlayers, m.blueGK, playersById[m.blueGK]?.name).stats.gkCleanSheets++;
    }

    // Defensive stats (stat matches only)
    const blueGA = m.pinkGoals; // goals conceded by Blue
    const pinkGA = m.blueGoals; // goals conceded by Pink

    // ✅ NEW: "conceded exactly 1" uplift — DEF/GK ONLY
    // Blue DEF+GK
    if (blueGA === 1) {
      const ids = new Set([
        ...asArray(m.blueDefs),
        m.blueGK
      ].filter(Boolean));
      ids.forEach((pid) => {
        ensurePlayer(outPlayers, pid).stats.concededExactlyOneMatches2026 += 1;
      });
    }

    // Pink DEF+GK
    if (pinkGA === 1) {
      const ids = new Set([
        ...asArray(m.pinkDefs),
        m.pinkGK
      ].filter(Boolean));
      ids.forEach((pid) => {
        ensurePlayer(outPlayers, pid).stats.concededExactlyOneMatches2026 += 1;
      });
    }

    // CS partnerships (exactly two defenders on that team credited with the clean sheet)
    const csBlueDefs = m.blueDefs.filter((id) => m.cleanBlue.includes(id));
    const csPinkDefs = m.pinkDefs.filter((id) => m.cleanPink.includes(id));

    if (csBlueDefs.length === 2) {
      addPairs(csBlueDefs, (a, b) => {
        const key = `${a}|${b}`;
        defensivePartnershipCounts[key] = (defensivePartnershipCounts[key] || 0) + 1;
      });
    }

    if (csPinkDefs.length === 2) {
      addPairs(csPinkDefs, (a, b) => {
        const key = `${a}|${b}`;
        defensivePartnershipCounts[key] = (defensivePartnershipCounts[key] || 0) + 1;
      });
    }

    // GA partnerships: all defender pairs who played; attribute team GA
    addPairs(m.blueDefs, (a, b) => {
      const key = `${a}|${b}`;
      const cur = defensivePartnershipsGA[key] || { matches: 0, goalsAgainst: 0 };
      cur.matches += 1;
      cur.goalsAgainst += blueGA;
      defensivePartnershipsGA[key] = cur;
    });

    addPairs(m.pinkDefs, (a, b) => {
      const key = `${a}|${b}`;
      const cur = defensivePartnershipsGA[key] || { matches: 0, goalsAgainst: 0 };
      cur.matches += 1;
      cur.goalsAgainst += pinkGA;
      defensivePartnershipsGA[key] = cur;
    });

    // Defensive unit GA: DEF + optional GK
    const blueUnit = m.blueGK ? [...m.blueDefs, m.blueGK] : [...m.blueDefs];
    const pinkUnit = m.pinkGK ? [...m.pinkDefs, m.pinkGK] : [...m.pinkDefs];

    const addUnit = (unitIds, goalsAgainst) => {
      const ids = [...new Set(asArray(unitIds))].sort();
      if (ids.length < 2) return;
      const key = ids.join("|");
      const cur = defensiveUnitsGA[key] || { matches: 0, goalsAgainst: 0 };
      cur.matches += 1;
      cur.goalsAgainst += goalsAgainst;
      defensiveUnitsGA[key] = cur;
    };

    addUnit(blueUnit, blueGA);
    addUnit(pinkUnit, pinkGA);

    // OTFs (stat matches only)
    m.otfs.forEach((pid) => ensurePlayer(outPlayers, pid, playersById[pid]?.name).stats.otfs++);

    // MOTM (stat matches only; can be multiple)
    m.motm.forEach((pid) => {
      ensurePlayer(outPlayers, pid).stats.motm2026++;
      ensurePlayer(outPlayers, pid).stats.motm++;
    });
  }

  // ----------------------------
  // Goals → player totals + event list + partnerships (stat matches only)
  // ----------------------------
  const goalEvents = [];
  const partnershipMap = {};

  for (const r of goalsRaw) {
    const f = r.fields || {};
    const matchId = asArray(f[FIELDS.GOAL_MATCH])[0];
    const scorerId = asArray(f[FIELDS.GOAL_SCORER])[0];
    const assistId = asArray(f[FIELDS.GOAL_ASSIST])[0] || null;
    const isOwnGoal = asNumber(f[FIELDS.GOAL_IS_OWN]) === 1;

    if (!matchId || !scorerId) continue;

    const m = matchById[matchId];
    if (!m || !m.date || !inYear(m.date, YEAR)) continue;
    if (!m.countsForStats) continue;

    goalEvents.push({ id: r.id, matchId, scorerId, assistId, isOwnGoal });

    const scorer = ensurePlayer(outPlayers, scorerId, playersById[scorerId]?.name);
    if (isOwnGoal) scorer.stats.ogs++;
    else scorer.stats.goals++;

    if (assistId) {
      ensurePlayer(outPlayers, assistId, playersById[assistId]?.name).stats.assists++;

      const key = pairKey(scorerId, assistId);
      if (!partnershipMap[key]) partnershipMap[key] = { count: 0, countExclOG: 0 };
      partnershipMap[key].count++;
      if (!isOwnGoal) partnershipMap[key].countExclOG++;
    }
  }

  const partnerships = mapToSortedPairs(partnershipMap);

  // ----------------------------
  // Final caps + subs maths
  // ----------------------------
  for (const [pid, o] of Object.entries(outPlayers)) {
    const p = playersById[pid];
    const startingCaps = p ? p.startingCaps : 0;
    const startingSubs = p ? p.startingSubs : 0;
    const subsAdded = p ? p.subsAdded : 0;

    o.stats.caps = startingCaps + o.stats.caps2026;

    // Subs derived as: starting_subs + subs_added - caps_2026 (can go negative)
    o.stats.subs = startingSubs + subsAdded - o.stats.caps2026;
  }

  // ----------------------------
  // FORM arrays (last 10 stat matches in-year; most recent first)
  // ----------------------------
  const formMatches = matches
    .filter((m) => m.date && inYear(m.date, YEAR) && m.countsForStats)
    .sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0))
    .slice(0, 10);

  for (const [pid, p] of Object.entries(outPlayers)) {
    const codes = formMatches.map((m) => formCodeForPlayerInMatch(pid, m));
    while (codes.length < 10) codes.push("X");
    p.stats.form = codes;
    p.stats.playedLast10 = codes.reduce((acc, c) => acc + (c === "X" ? 0 : 1), 0);
  }

  // ----------------------------
  // OVR (overall score)
  // ----------------------------
  const matchesSeason = matchesCountForStatsInYear;
  const combinedByPlayerId = {};

  for (const [pid, p] of Object.entries(outPlayers)) {
    const s = p.stats;

    const inputs = {
      playedSeason: s.caps2026,
      wins: s.wins,
      draws: s.draws,
      goals: s.goals,
      assists: s.assists,
      cleanSheets: s.cleanSheets,
      conceded: s.conceded2026,
      concededExactlyOneMatches: s.concededExactlyOneMatches2026,
      ogs: s.ogs,
      otfs: s.otfs,
      motm: s.motm2026,
      motmCaptain: s.motmCaptain2026,
      winningCaptain: s.winningCaptain2026,
      honourableMentions: s.honourableMentions,

      playedLast10: s.playedLast10,
      matchesSeason,

      attendanceImmunity: 0.20,
      penaltyMax: 12,
    };

    const { rawSeason, penalty, combined } = computeCombined(inputs);

    s.ovrRawSeason = rawSeason;
    s.ovrPenalty = penalty;
    s.ovrCombined = combined;

    combinedByPlayerId[pid] = combined;
  }

  const ovrMap = normaliseTo100(combinedByPlayerId);
  for (const [pid, p] of Object.entries(outPlayers)) {
    p.stats.ovr = ovrMap[pid] ?? 50;
  }

  // ----------------------------
  // Output
  // ----------------------------
  const outPath = path.join(process.cwd(), "data", "aggregated.json");

  const defensivePartnerships = Object.entries(defensivePartnershipCounts)
    .map(([key, count]) => {
      const [playerId1, playerId2] = key.split("|");
      return { playerId1, playerId2, count };
    })
    .sort((a, b) => b.count - a.count);

  const defensivePartnershipsGoalsAgainst = Object.entries(defensivePartnershipsGA)
    .map(([key, v]) => {
      const [playerId1, playerId2] = key.split("|");
      const gaPerMatch = v.matches ? v.goalsAgainst / v.matches : null;
      return { playerId1, playerId2, matches: v.matches, goalsAgainst: v.goalsAgainst, gaPerMatch };
    })
    .sort((a, b) => (a.gaPerMatch ?? 999) - (b.gaPerMatch ?? 999));

  const defensiveUnitsGoalsAgainst = Object.entries(defensiveUnitsGA)
    .map(([key, v]) => {
      const playerIds = key.split("|");
      const gaPerMatch = v.matches ? v.goalsAgainst / v.matches : null;
      return { playerIds, matches: v.matches, goalsAgainst: v.goalsAgainst, gaPerMatch };
    })
    .sort((a, b) => (a.gaPerMatch ?? 999) - (b.gaPerMatch ?? 999));

  const outMatches = matches
    .filter((m) => m.date)
    .sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0))
    .map((m) => ({
      id: m.id,
      name: m.name,
      date: toISODateOnly(m.date),
      playersPink: m.pink,
      playersBlue: m.blue,
      pinkGoals: m.pinkGoals,
      blueGoals: m.blueGoals,
      winningTeam: m.winningTeam,
      motmIds: m.motm,
      honourableMentionIds: m.honourableMentions,
      captainPinkId: m.captainPink,
      captainBlueId: m.captainBlue,
      otfIds: m.otfs,
      notes: m.notes,
      countsForStats: m.countsForStats,
    }));

  writeJsonPretty(outPath, {
    players: outPlayers,
    goals: goalEvents,
    matches: outMatches,
    partnerships,
    defensivePartnerships,
    defensivePartnershipsGoalsAgainst,
    defensiveUnitsGoalsAgainst,
    meta: {
      generatedAt: new Date().toISOString(),
      year: YEAR,
      matchesInYear,
      matchesCountForStatsInYear,
      matchesNonStatInYear,
      goalsIncluded: goalEvents.length,
    },
  });

  console.log(`Aggregated stats written to ${outPath}`);
}

main().catch((err) => {
  console.error("Error in aggregate.js:", err);
  process.exit(1);
});
