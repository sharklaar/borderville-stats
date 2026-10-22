// Shared scoring for player totals and defensive partnerships.
const FPL_WEIGHTS = {
  APP: 1,
  GOAL_GK: 10,
  GOAL_DEF: 6,
  GOAL_OTHER: 4,
  ASSIST: 3,
  CS_DEF_GK: 6,
  CONCEDE_1_DEF_GK: 3,
  CONCEDE_2_DEF_GK: 2,
  WIN_ALL: 3,
  WIN_BONUS_DEF_GK: 2,
  MOTM: 3,
  CAPTAIN_MOTM_BONUS: 1,
  OTF: -1,
  OG: -2,
};

function safeArray(v) { return Array.isArray(v) ? v : []; }
function buildRoleMaps(match) {
  const pink = new Set(safeArray(match.playersPink));
  const blue = new Set(safeArray(match.playersBlue));
  const pinkDefs = new Set(safeArray(match.pinkDefs ?? match.pinkDefIds));
  const blueDefs = new Set(safeArray(match.blueDefs ?? match.blueDefIds));
  const pinkGk = match.pinkGKId || match.pinkGkId || null;
  const blueGk = match.blueGKId || match.blueGkId || null;

  function getTeam(pid) {
    if (pink.has(pid)) return 'PINK';
    if (blue.has(pid)) return 'BLUE';
    return null;
  }
  function getRole(pid) {
    if (pid === pinkGk || pid === blueGk) return 'GK';
    if (pinkDefs.has(pid) || blueDefs.has(pid)) return 'DEF';
    return getTeam(pid) ? 'OTHER' : null;
  }
  return { getTeam, getRole };
}

function buildFplTable(data) {
  const players = data?.players || {};
  const matches = safeArray(data?.matches).filter(m => m?.countsForStats !== false);
  const goals = safeArray(data?.goals);
  const byId = {};

  for (const [id, player] of Object.entries(players)) {
    byId[id] = {
      id,
      player,
      apps: 0,
      wins: 0,
      goals: 0,
      assists: 0,
      cleanSheets: 0,
      concede1: 0,
      concede2: 0,
      motm: 0,
      captainMotm: 0,
      otf: 0,
      og: 0,
      total: 0,
    };
  }

  const goalsByMatch = new Map();
  for (const g of goals) {
    if (!g?.matchId) continue;
    if (!goalsByMatch.has(g.matchId)) goalsByMatch.set(g.matchId, []);
    goalsByMatch.get(g.matchId).push(g);
  }

  for (const match of matches) {
    const { getTeam, getRole } = buildRoleMaps(match);
    const pinkPlayers = safeArray(match.playersPink);
    const bluePlayers = safeArray(match.playersBlue);
    const allPlayers = [...pinkPlayers, ...bluePlayers];
    const pinkGoals = Number(match.pinkGoals || 0);
    const blueGoals = Number(match.blueGoals || 0);
    const winningTeam = match.winningTeam || (pinkGoals > blueGoals ? 'PINK' : blueGoals > pinkGoals ? 'BLUE' : 'DRAW');
    const captainIds = new Set([match.captainPinkId, match.captainBlueId, ...safeArray(match.captainIds)].filter(Boolean));

    for (const pid of allPlayers) {
      const row = byId[pid];
      if (!row || row.player?.meta?.excluded) continue;
      row.apps += 1;
      row.total += FPL_WEIGHTS.APP;

      const team = getTeam(pid);
      const role = getRole(pid);
      const conceded = team === 'PINK' ? blueGoals : team === 'BLUE' ? pinkGoals : null;

      if (winningTeam !== 'DRAW' && team === winningTeam) {
        row.wins += 1;
        row.total += FPL_WEIGHTS.WIN_ALL;
        if (role === 'GK' || role === 'DEF') row.total += FPL_WEIGHTS.WIN_BONUS_DEF_GK;
      }

      if (role === 'GK' || role === 'DEF') {
        if (conceded === 0) {
          row.cleanSheets += 1;
          row.total += FPL_WEIGHTS.CS_DEF_GK;
        } else if (conceded === 1) {
          row.concede1 += 1;
          row.total += FPL_WEIGHTS.CONCEDE_1_DEF_GK;
        } else if (conceded === 2) {
          row.concede2 += 1;
          row.total += FPL_WEIGHTS.CONCEDE_2_DEF_GK;
        }
      }
    }

    for (const pid of safeArray(match.motmIds)) {
      const row = byId[pid];
      if (!row || row.player?.meta?.excluded) continue;
      row.motm += 1;
      row.total += FPL_WEIGHTS.MOTM;
      if (captainIds.has(pid)) {
        row.captainMotm += 1;
        row.total += FPL_WEIGHTS.CAPTAIN_MOTM_BONUS;
      }
    }

    for (const pid of safeArray(match.otfIds)) {
      const row = byId[pid];
      if (!row || row.player?.meta?.excluded) continue;
      row.otf += 1;
      row.total += FPL_WEIGHTS.OTF;
    }

    for (const goal of safeArray(goalsByMatch.get(match.id))) {
      const scorerId = goal?.scorerId;
      const assistId = goal?.assistId;
      const isOwnGoal = Boolean(goal?.isOwnGoal);

      if (scorerId && byId[scorerId] && !byId[scorerId].player?.meta?.excluded) {
        const role = getRole(scorerId);
        if (isOwnGoal) {
          byId[scorerId].og += 1;
          byId[scorerId].total += FPL_WEIGHTS.OG;
        } else {
          byId[scorerId].goals += 1;
          if (role === 'GK') byId[scorerId].total += FPL_WEIGHTS.GOAL_GK;
          else if (role === 'DEF') byId[scorerId].total += FPL_WEIGHTS.GOAL_DEF;
          else byId[scorerId].total += FPL_WEIGHTS.GOAL_OTHER;
        }
      }

      if (assistId && byId[assistId] && !byId[assistId].player?.meta?.excluded) {
        byId[assistId].assists += 1;
        byId[assistId].total += FPL_WEIGHTS.ASSIST;
      }
    }
  }

  return Object.values(byId)
    .filter(row => !row.player?.meta?.excluded && row.apps > 0)
    .sort((a, b) => b.total - a.total || b.wins - a.wins || b.goals - a.goals || b.assists - a.assists || String(a.player?.name || '').localeCompare(String(b.player?.name || '')));
}

