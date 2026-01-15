// scripts/aggregate.js
const fs = require("fs");
const path = require("path");
const { fetchAllRecords, getConfig } = require("./fetchAirtable");

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
  STARTING_SUBS: "Starting Subs",
  SUBS_ADDED: "Subs Added",
  POSITION: "Position",
  DOB: "Date of Birth",
  PROFILE_PHOTO: "Profile Photo",

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
  MOTM: "Player of the Match", // <-- change this if your field name differs

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

function ensurePlayer(outPlayers, playerId, name = "Unknown") {
  if (!outPlayers[playerId]) {
    outPlayers[playerId] = {
      id: playerId,
      name,
      stats: {
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goals: 0,
        assists: 0,
        ogs: 0,
        cleanSheets: 0,
        gkCleanSheets: 0, // NEW: only counts when GK explicitly set and in clean sheet list
        otfs: 0,
        subs: 0,
        caps: 0,
        caps2026: 0,
        motm: 0, // NEW
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

function pairKey(scorerId, assistId) {
  return `${scorerId}::${assistId}`;
}

function mapToSortedPairs(map) {
  return Object.entries(map)
    .map(([key, v]) => {
      const [scorerId, assistId] = key.split("::");
      return { scorerId, assistId, ...v };
    })
    .sort((a, b) => b.count - a.count);
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
      startingSubs: asNumber(f[FIELDS.STARTING_SUBS]),
      subsAdded: asNumber(f[FIELDS.SUBS_ADDED]),
      position: f[FIELDS.POSITION] || null,
      dob: f[FIELDS.DOB] || null,
      profilePhoto: f[FIELDS.PROFILE_PHOTO] || null,
    };
  }

  const outPlayers = {};
  Object.values(playersById).forEach((p) => {
    const o = ensurePlayer(outPlayers, p.id, p.name);
    o.meta = {
      position: p.position,
      dob: p.dob,
      profilePhoto: p.profilePhoto,
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
      motm: asArray(f[FIELDS.MOTM]), // NEW (can be 0, 1, or multiple)
      notes: f[FIELDS.NOTES] || null,
      pinkGoals: asNumber(f[FIELDS.PINK_GOALS]),
      blueGoals: asNumber(f[FIELDS.BLUE_GOALS]),
    };
  });

  const matchById = Object.fromEntries(matches.map((m) => [m.id, m]));

  // ----------------------------
  // Per-match aggregation
  // ----------------------------
  const YEAR = 2026;

  // NEW: defensive partnerships & units
  const defensivePartnershipCounts = {}; // key "a|b" -> count (clean sheets only)
  const defensivePartnershipsGA = {}; // key "a|b" -> { matches, goalsAgainst }
  const defensiveUnitsGA = {}; // key "id1|id2|id3" -> { matches, goalsAgainst }

  for (const m of matches) {
    if (!m.date || !inYear(m.date, YEAR)) continue;

    const pink = new Set(m.pink);
    const blue = new Set(m.blue);

    // appearances + caps2026
    pink.forEach((pid) => {
      ensurePlayer(outPlayers, pid, playersById[pid]?.name).stats.played++;
      ensurePlayer(outPlayers, pid).stats.caps2026++;
    });
    blue.forEach((pid) => {
      ensurePlayer(outPlayers, pid, playersById[pid]?.name).stats.played++;
      ensurePlayer(outPlayers, pid).stats.caps2026++;
    });

    // W/D/L
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

    // Clean sheets / OTFs are explicitly listed in Matches table fields
    m.cleanPink.forEach((pid) =>
      ensurePlayer(outPlayers, pid, playersById[pid]?.name).stats.cleanSheets++
    );
    m.cleanBlue.forEach((pid) =>
      ensurePlayer(outPlayers, pid, playersById[pid]?.name).stats.cleanSheets++
    );

    // GK clean sheets: only when GK is explicitly set AND included in clean sheet list
    if (m.pinkGK && m.cleanPink.includes(m.pinkGK)) {
      ensurePlayer(outPlayers, m.pinkGK, playersById[m.pinkGK]?.name).stats.gkCleanSheets++;
    }
    if (m.blueGK && m.cleanBlue.includes(m.blueGK)) {
      ensurePlayer(outPlayers, m.blueGK, playersById[m.blueGK]?.name).stats.gkCleanSheets++;
    }

    // ----------------------------
    // Defensive partnerships (clean sheets) + GA-based defensive stats
    // Uses explicit match role fields: Blue Defenders / Pink Defenders, plus optional GK.
    // ----------------------------
    const blueGA = m.pinkGoals; // goals conceded by Blue
    const pinkGA = m.blueGoals; // goals conceded by Pink

    // CS partnerships: defenders who are in the team's clean sheet list
    const csBlueDefs = m.blueDefs.filter((id) => m.cleanBlue.includes(id));
    const csPinkDefs = m.pinkDefs.filter((id) => m.cleanPink.includes(id));

    addPairs(csBlueDefs, (a, b) => {
      const key = `${a}|${b}`;
      defensivePartnershipCounts[key] = (defensivePartnershipCounts[key] || 0) + 1;
    });

    addPairs(csPinkDefs, (a, b) => {
      const key = `${a}|${b}`;
      defensivePartnershipCounts[key] = (defensivePartnershipCounts[key] || 0) + 1;
    });

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

    // Defensive unit GA: DEF + optional GK (if GK blank, unit is DEF-only)
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
    m.otfs.forEach((pid) =>
      ensurePlayer(outPlayers, pid, playersById[pid]?.name).stats.otfs++
    );

    // MOTM (can be multiple)
    m.motm.forEach((pid) =>
      ensurePlayer(outPlayers, pid, playersById[pid]?.name).stats.motm++
    );
  }

  // ----------------------------
  // Goals → player totals + event list + partnerships
  // ----------------------------
  const goalEvents = []; // NEW: event-level output
  const partnershipMap = {}; // NEW: scorer+assist pair counts

  for (const r of goalsRaw) {
    const f = r.fields || {};
    const matchId = asArray(f[FIELDS.GOAL_MATCH])[0];
    const scorerId = asArray(f[FIELDS.GOAL_SCORER])[0];
    const assistId = asArray(f[FIELDS.GOAL_ASSIST])[0] || null;
    const isOwnGoal = asNumber(f[FIELDS.GOAL_IS_OWN]) === 1;

    if (!matchId || !scorerId) continue;

    const m = matchById[matchId];
    if (!m || !m.date || !inYear(m.date, YEAR)) continue;

    // store event row so FE can link it later
    goalEvents.push({
      id: r.id,
      matchId,
      scorerId,
      assistId,
      isOwnGoal,
    });

    // update scorer totals
    const scorer = ensurePlayer(outPlayers, scorerId, playersById[scorerId]?.name);
    if (isOwnGoal) scorer.stats.ogs++;
    else scorer.stats.goals++;

    // update assister totals + partnership
    if (assistId) {
      ensurePlayer(outPlayers, assistId, playersById[assistId]?.name).stats.assists++;

      const key = pairKey(scorerId, assistId);
      if (!partnershipMap[key]) {
        partnershipMap[key] = { count: 0, countExclOG: 0 };
      }
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
    // Subs derived as: starting_subs + subs_added - caps_2026
    o.stats.subs = startingSubs + subsAdded - o.stats.caps2026;
  }

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
      return {
        playerId1,
        playerId2,
        matches: v.matches,
        goalsAgainst: v.goalsAgainst,
        gaPerMatch,
      };
    })
    .sort((a, b) => (a.gaPerMatch ?? 999) - (b.gaPerMatch ?? 999));

  const defensiveUnitsGoalsAgainst = Object.entries(defensiveUnitsGA)
    .map(([key, v]) => {
      const playerIds = key.split("|");
      const gaPerMatch = v.matches ? v.goalsAgainst / v.matches : null;
      return {
        playerIds,
        matches: v.matches,
        goalsAgainst: v.goalsAgainst,
        gaPerMatch,
      };
    })
    .sort((a, b) => (a.gaPerMatch ?? 999) - (b.gaPerMatch ?? 999));

  writeJsonPretty(outPath, {
    players: outPlayers,
    goals: goalEvents, // NEW
    partnerships, // NEW
    defensivePartnerships, // NEW: CS partnerships (DEF+DEF sharing a CS)
    defensivePartnershipsGoalsAgainst, // NEW: GA partnerships (DEF+DEF)
    defensiveUnitsGoalsAgainst, // NEW: GA units (DEF + optional GK)
    meta: {
      generatedAt: new Date().toISOString(),
      matchesProcessed: matches.length,
      goalsProcessed: goalsRaw.length,
      year: YEAR,
    },
  });

  console.log(`Aggregated stats written to ${outPath}`);
}

main().catch((err) => {
  console.error("Error in aggregate.js:", err);
  process.exit(1);
});