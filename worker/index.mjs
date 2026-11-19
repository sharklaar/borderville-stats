const PLAYERS_TABLE_ID = "tbl58HHS5mKXWlAby";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/players") {
      return getPlayers(env);
    }

    if (request.method === "GET" && url.pathname === "/match-entry") {
      return htmlResponse(matchEntryPage());
    }

    if (request.method === "GET" && url.pathname === "/") {
      return htmlResponse(homePage());
    }

    if (
      request.method === "GET" &&
      (url.pathname === "/subs" || url.pathname === "/players")
    ) {
      return htmlResponse(comingSoonPage());
    }

    return new Response("Not found", { status: 404 });
  },
};

function htmlResponse(html) {
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=UTF-8",
      "Cache-Control": "no-store",
    },
  });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "Cache-Control": "no-store",
    },
  });
}

async function getPlayers(env) {
  if (!env.AIRTABLE_TOKEN || !env.AIRTABLE_BASE_ID) {
    return jsonResponse(
      {
        error:
          "AIRTABLE_TOKEN and AIRTABLE_BASE_ID are not configured on this Worker.",
      },
      500
    );
  }

  try {
    const players = [];
    let offset = null;

    do {
      const airtableUrl = new URL(
        "https://api.airtable.com/v0/" +
          env.AIRTABLE_BASE_ID +
          "/" +
          PLAYERS_TABLE_ID
      );

      airtableUrl.searchParams.set("pageSize", "100");
      airtableUrl.searchParams.append("fields[]", "Name");
      airtableUrl.searchParams.append("fields[]", "Excluded");

      if (offset) {
        airtableUrl.searchParams.set("offset", offset);
      }

      const response = await fetch(airtableUrl.toString(), {
        headers: {
          Authorization: "Bearer " + env.AIRTABLE_TOKEN,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        const message =
          data?.error?.message || data?.error || "Unknown Airtable error";

        throw new Error(
          "Airtable returned " + response.status + ": " + message
        );
      }

      for (const record of data.records || []) {
        const name = record.fields?.Name;
        const excluded = Boolean(record.fields?.Excluded);

        if (name && !excluded) {
          players.push({
            id: record.id,
            name,
          });
        }
      }

      offset = data.offset || null;
    } while (offset);

    players.sort((a, b) => a.name.localeCompare(b.name));

    return jsonResponse({ players });
  } catch (error) {
    console.error(error);

    return jsonResponse(
      {
        error: error.message || "Failed to load players.",
      },
      500
    );
  }
}

function homePage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Borderville Admin</title>

  <style>
    body {
      font-family: Arial, sans-serif;
      max-width: 760px;
      margin: 60px auto;
      padding: 0 20px;
      background: #f5f5f5;
      color: #222;
    }

    h1 {
      margin-bottom: 30px;
    }

    .menu {
      display: grid;
      gap: 15px;
    }

    a {
      display: block;
      padding: 20px;
      background: #fff;
      border: 1px solid #ddd;
      border-radius: 10px;
      text-decoration: none;
      color: #222;
      font-size: 18px;
    }

    a:hover {
      background: #eee;
    }
  </style>
</head>

<body>
  <h1>Borderville Admin</h1>

  <div class="menu">
    <a href="/match-entry">Enter Match Result</a>
    <a href="/subs">Record Subs Payment</a>
    <a href="/players">Manage Players</a>
  </div>
</body>
</html>`;
}

function comingSoonPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Borderville Admin</title>

  <style>
    body {
      font-family: Arial, sans-serif;
      max-width: 700px;
      margin: 60px auto;
      padding: 0 20px;
    }

    a {
      color: #222;
    }
  </style>
</head>

<body>
  <p><a href="/">← Admin home</a></p>
  <h1>Coming soon</h1>
</body>
</html>`;
}

function matchEntryPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Enter Match Result - Borderville Admin</title>

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      font-family: Arial, sans-serif;
      background: #f3f4f6;
      color: #202124;
    }

    .page {
      max-width: 1200px;
      margin: 0 auto;
      padding: 24px;
    }

    .topbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      margin-bottom: 24px;
    }

    .topbar a {
      color: #333;
      text-decoration: none;
    }

    h1,
    h2,
    h3 {
      margin-top: 0;
    }

    .card {
      background: #fff;
      border: 1px solid #ddd;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 20px;
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: 6px;
      max-width: 300px;
    }

    input[type="date"],
    input[type="search"],
    select {
      padding: 10px 12px;
      border: 1px solid #bbb;
      border-radius: 8px;
      font: inherit;
      background: #fff;
    }

    button {
      border: 0;
      border-radius: 8px;
      padding: 10px 14px;
      font: inherit;
      cursor: pointer;
    }

    button.primary {
      background: #202124;
      color: #fff;
    }

    button.secondary {
      background: #e8eaed;
      color: #202124;
    }

    button.danger {
      background: #fce8e6;
      color: #b3261e;
    }

    button.pink-btn {
      background: #ffd4e5;
    }

    button.blue-btn {
      background: #d7e8ff;
    }

    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .error {
      display: none;
      background: #fce8e6;
      color: #8c1d18;
      border: 1px solid #f1b5b0;
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 16px;
    }

    .loading {
      padding: 18px;
      color: #666;
    }

    .team-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 18px;
      align-items: start;
    }

    .panel {
      border: 1px solid #ddd;
      border-radius: 10px;
      overflow: hidden;
      background: #fff;
    }

    .panel-head {
      padding: 14px 16px;
      border-bottom: 1px solid #ddd;
      font-weight: bold;
      display: flex;
      justify-content: space-between;
      gap: 12px;
    }

    .panel-body {
      padding: 12px;
    }

    .pink .panel-head {
      background: #ffe5ef;
    }

    .blue .panel-head {
      background: #e5f0ff;
    }

    .player-list {
      display: grid;
      gap: 8px;
      max-height: 570px;
      overflow: auto;
    }

    .available-player {
      display: grid;
      grid-template-columns: 1fr auto auto;
      gap: 6px;
      align-items: center;
      padding: 8px;
      border: 1px solid #e3e3e3;
      border-radius: 8px;
    }

    .team-player {
      padding: 10px;
      border: 1px solid #e3e3e3;
      border-radius: 8px;
      margin-bottom: 8px;
    }

    .team-player-top {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: center;
      margin-bottom: 8px;
    }

    .roles {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      font-size: 14px;
    }

    .roles label {
      display: flex;
      gap: 5px;
      align-items: center;
    }

    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 18px;
      flex-wrap: wrap;
    }

    .score {
      font-size: 32px;
      font-weight: bold;
      text-align: center;
      margin: 10px 0 20px;
    }

    .goal-columns {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 18px;
    }

    .goal-team {
      border: 1px solid #ddd;
      border-radius: 10px;
      overflow: hidden;
    }

    .goal-team-head {
      padding: 14px 16px;
      font-weight: bold;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .goal-team.pink .goal-team-head {
      background: #ffe5ef;
    }

    .goal-team.blue .goal-team-head {
      background: #e5f0ff;
    }

    .goal-list {
      padding: 12px;
      display: grid;
      gap: 10px;
    }

    .goal-row {
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 12px;
      display: grid;
      grid-template-columns: 110px 1fr 1fr auto;
      gap: 8px;
      align-items: end;
    }

    .goal-row label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 13px;
    }

    .choice-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 8px;
    }

    .choice {
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 10px;
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .hint {
      color: #666;
      font-size: 14px;
      margin-top: 6px;
    }

    .hidden {
      display: none !important;
    }

    pre {
      white-space: pre-wrap;
      word-break: break-word;
      background: #111;
      color: #eee;
      padding: 16px;
      border-radius: 10px;
      overflow: auto;
    }

    @media (max-width: 900px) {
      .team-grid {
        grid-template-columns: 1fr;
      }

      .goal-columns {
        grid-template-columns: 1fr;
      }

      .goal-row {
        grid-template-columns: 1fr;
      }

      .page {
        padding: 14px;
      }
    }
  </style>
</head>

<body>
<div class="page">

  <div class="topbar">
    <div>
      <a href="/">← Admin home</a>
      <h1 style="margin:8px 0 0">Enter Match Result</h1>
    </div>
  </div>

  <div id="error" class="error"></div>

  <section id="step1">

    <div class="card">
      <h2>1. Date and teams</h2>

      <div class="field">
        <label for="datePlayed">Date played</label>
        <input id="datePlayed" type="date" required>
      </div>
    </div>

    <div id="loading" class="card loading">
      Loading players from Airtable…
    </div>

    <div id="teamsArea" class="team-grid hidden">

      <div class="panel">
        <div class="panel-head">
          <span>Available players</span>
          <span id="availableCount"></span>
        </div>

        <div class="panel-body">
          <input
            id="playerSearch"
            type="search"
            placeholder="Search players"
            style="width:100%;margin-bottom:10px"
          >

          <div id="availablePlayers" class="player-list"></div>
        </div>
      </div>

      <div class="panel pink">
        <div class="panel-head">
          <span>Pink team</span>
          <span id="pinkCount">0 / 9</span>
        </div>

        <div id="pinkPlayers" class="panel-body"></div>
      </div>

      <div class="panel blue">
        <div class="panel-head">
          <span>Blue team</span>
          <span id="blueCount">0 / 9</span>
        </div>

        <div id="bluePlayers" class="panel-body"></div>
      </div>

    </div>

    <div id="step1Actions" class="actions hidden">
      <button id="continueBtn" class="primary">
        Continue to goals
      </button>
    </div>

  </section>


  <section id="step2" class="hidden">

    <div class="card">
      <h2>2. Goals</h2>

      <div id="score" class="score">
        Pink 0 – 0 Blue
      </div>

      <div class="goal-columns">

        <div class="goal-team pink">
          <div class="goal-team-head">
            <span>Pink goals</span>
            <button
              id="addPinkGoal"
              class="pink-btn"
              type="button"
            >
              + Add Pink goal
            </button>
          </div>

          <div id="pinkGoals" class="goal-list"></div>
        </div>


        <div class="goal-team blue">
          <div class="goal-team-head">
            <span>Blue goals</span>
            <button
              id="addBlueGoal"
              class="blue-btn"
              type="button"
            >
              + Add Blue goal
            </button>
          </div>

          <div id="blueGoals" class="goal-list"></div>
        </div>

      </div>

      <p class="hint">
        For an own goal, the scorer list switches to the opposition.
        The assist remains an attacking-team player and may be blank.
      </p>
    </div>


    <div class="card">
      <h2>3. OTFs</h2>
      <div id="otfChoices" class="choice-grid"></div>
    </div>


    <div class="card">
      <h2>4. Player of the Match</h2>

      <div id="motmChoices" class="choice-grid"></div>

      <p class="hint">
        Choose 1 or 2. The current Borderville aggregation rules do not
        permit a losing-team player to be MoM.
      </p>
    </div>


    <div class="actions">
      <button id="backBtn" class="secondary" type="button">
        Back to teams
      </button>

      <button id="reviewBtn" class="primary" type="button">
        Review data
      </button>
    </div>


    <div
      id="reviewCard"
      class="card hidden"
      style="margin-top:20px"
    >
      <h2>Payload preview</h2>

      <p>
        This is not being saved yet. This is the object we will send
        to the Worker/Airtable next.
      </p>

      <pre id="payloadPreview"></pre>
    </div>

  </section>

</div>


<script>
(function () {

  var players = [];

  var state = {
    pink: {
      playerIds: [],
      captainId: null,
      goalkeeperId: null,
      defenderIds: []
    },

    blue: {
      playerIds: [],
      captainId: null,
      goalkeeperId: null,
      defenderIds: []
    },

    goals: [],
    otfIds: [],
    motmIds: []
  };


  var errorBox = document.getElementById("error");


  function showError(message) {
    errorBox.textContent = message;
    errorBox.style.display = "block";

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  }


  function clearError() {
    errorBox.textContent = "";
    errorBox.style.display = "none";
  }


  function playerById(id) {
    return players.find(function (p) {
      return p.id === id;
    });
  }


  function playerName(id) {
    var p = playerById(id);

    return p ? p.name : id;
  }


  function allSelectedIds() {
    return state.pink.playerIds.concat(
      state.blue.playerIds
    );
  }


  function otherTeam(team) {
    return team === "pink" ? "blue" : "pink";
  }


  function addPlayer(team, id) {
    clearError();

    if (state[team].playerIds.length >= 9) {
      showError(
        (team === "pink" ? "Pink" : "Blue") +
        " already has 9 players."
      );

      return;
    }

    if (allSelectedIds().indexOf(id) !== -1) {
      return;
    }

    state[team].playerIds.push(id);

    normaliseDependentState();
    renderStep1();
  }


  function removePlayer(team, id) {

    state[team].playerIds =
      state[team].playerIds.filter(function (x) {
        return x !== id;
      });


    state[team].defenderIds =
      state[team].defenderIds.filter(function (x) {
        return x !== id;
      });


    if (state[team].captainId === id) {
      state[team].captainId = null;
    }


    if (state[team].goalkeeperId === id) {
      state[team].goalkeeperId = null;
    }


    normaliseDependentState();
    renderStep1();
  }


  function normaliseDependentState() {

    var matchIds = allSelectedIds();


    state.otfIds =
      state.otfIds.filter(function (id) {
        return matchIds.indexOf(id) !== -1;
      });


    state.motmIds =
      state.motmIds.filter(function (id) {
        return matchIds.indexOf(id) !== -1;
      });


    state.goals.forEach(function (goal) {

      var attacking =
        state[goal.team].playerIds;

      var defending =
        state[otherTeam(goal.team)].playerIds;


      var validScorers =
        goal.type === "OWN_GOAL"
          ? defending
          : attacking;


      if (
        validScorers.indexOf(goal.scorerId) === -1
      ) {
        goal.scorerId = "";
      }


      if (
        attacking.indexOf(goal.assistId) === -1
      ) {
        goal.assistId = "";
      }


      if (
        goal.type === "NORMAL" &&
        goal.assistId === goal.scorerId
      ) {
        goal.assistId = "";
      }

    });
  }


  function renderStep1() {

    renderAvailablePlayers();

    renderTeam("pink");
    renderTeam("blue");


    document.getElementById("pinkCount")
      .textContent =
      state.pink.playerIds.length + " / 9";


    document.getElementById("blueCount")
      .textContent =
      state.blue.playerIds.length + " / 9";
  }


  function renderAvailablePlayers() {

    var container =
      document.getElementById("availablePlayers");


    var selected =
      allSelectedIds();


    var search =
      document
        .getElementById("playerSearch")
        .value
        .trim()
        .toLowerCase();


    var available =
      players.filter(function (p) {

        return (
          selected.indexOf(p.id) === -1 &&
          (
            !search ||
            p.name
              .toLowerCase()
              .indexOf(search) !== -1
          )
        );

      });


    document.getElementById("availableCount")
      .textContent =
      available.length;


    container.innerHTML = "";


    if (!available.length) {

      var empty =
        document.createElement("div");

      empty.className = "hint";
      empty.textContent =
        "No available players.";

      container.appendChild(empty);

      return;
    }


    available.forEach(function (p) {

      var row =
        document.createElement("div");

      row.className =
        "available-player";


      var name =
        document.createElement("span");

      name.textContent = p.name;


      var pink =
        document.createElement("button");

      pink.className = "pink-btn";
      pink.textContent = "Pink";

      pink.disabled =
        state.pink.playerIds.length >= 9;

      pink.addEventListener(
        "click",
        function () {
          addPlayer("pink", p.id);
        }
      );


      var blue =
        document.createElement("button");

      blue.className = "blue-btn";
      blue.textContent = "Blue";

      blue.disabled =
        state.blue.playerIds.length >= 9;

      blue.addEventListener(
        "click",
        function () {
          addPlayer("blue", p.id);
        }
      );


      row.appendChild(name);
      row.appendChild(pink);
      row.appendChild(blue);

      container.appendChild(row);

    });
  }


  function renderTeam(team) {

    var container =
      document.getElementById(
        team + "Players"
      );


    container.innerHTML = "";


    if (!state[team].playerIds.length) {

      var empty =
        document.createElement("div");

      empty.className = "hint";
      empty.textContent =
        "No players selected.";

      container.appendChild(empty);

      return;
    }


    state[team].playerIds.forEach(
      function (id) {

        var row =
          document.createElement("div");

        row.className =
          "team-player";


        var top =
          document.createElement("div");

        top.className =
          "team-player-top";


        var name =
          document.createElement("strong");

        name.textContent =
          playerName(id);


        var remove =
          document.createElement("button");

        remove.className = "danger";
        remove.textContent = "Remove";
        remove.type = "button";

        remove.addEventListener(
          "click",
          function () {
            removePlayer(team, id);
          }
        );


        top.appendChild(name);
        top.appendChild(remove);


        var roles =
          document.createElement("div");

        roles.className = "roles";


        /*
         * CAPTAIN
         */

        var captainLabel =
          document.createElement("label");

        var captain =
          document.createElement("input");

        captain.type = "radio";
        captain.name =
          team + "Captain";

        captain.checked =
          state[team].captainId === id;


        captain.addEventListener(
          "change",
          function () {
            state[team].captainId = id;
          }
        );


        captainLabel.appendChild(captain);

        captainLabel.appendChild(
          document.createTextNode("Captain")
        );


        /*
         * GOALKEEPER
         */

        var gkLabel =
          document.createElement("label");

        var gk =
          document.createElement("input");

        gk.type = "checkbox";

        gk.checked =
          state[team].goalkeeperId === id;


        gk.addEventListener(
          "change",
          function () {

            state[team].goalkeeperId =
              gk.checked
                ? id
                : null;

            renderTeam(team);

          }
        );


        gkLabel.appendChild(gk);

        gkLabel.appendChild(
          document.createTextNode("GK")
        );


        /*
         * DEFENDER
         */

        var defLabel =
          document.createElement("label");

        var def =
          document.createElement("input");

        def.type = "checkbox";

        def.checked =
          state[team].defenderIds
            .indexOf(id) !== -1;


        def.addEventListener(
          "change",
          function () {

            if (def.checked) {

              if (
                state[team]
                  .defenderIds
                  .length >= 3
              ) {

                showError(
                  "A team can have at most 3 defenders."
                );

                renderTeam(team);

                return;
              }

              state[team]
                .defenderIds
                .push(id);

            } else {

              state[team].defenderIds =
                state[team]
                  .defenderIds
                  .filter(function (x) {
                    return x !== id;
                  });

            }

            clearError();
          }
        );


        defLabel.appendChild(def);

        defLabel.appendChild(
          document.createTextNode("DEF")
        );


        roles.appendChild(captainLabel);
        roles.appendChild(gkLabel);
        roles.appendChild(defLabel);


        row.appendChild(top);
        row.appendChild(roles);


        container.appendChild(row);

      }
    );
  }


  function validateTeams() {

    clearError();


    var date =
      document
        .getElementById("datePlayed")
        .value;


    if (!date) {
      return "Date played is required.";
    }


    if (
      state.pink.playerIds.length < 1 ||
      state.pink.playerIds.length > 9
    ) {
      return "Pink must have between 1 and 9 players.";
    }


    if (
      state.blue.playerIds.length < 1 ||
      state.blue.playerIds.length > 9
    ) {
      return "Blue must have between 1 and 9 players.";
    }


    if (!state.pink.captainId) {
      return "Choose a Pink captain.";
    }


    if (!state.blue.captainId) {
      return "Choose a Blue captain.";
    }


    if (
      state.pink.defenderIds.length > 3 ||
      state.blue.defenderIds.length > 3
    ) {
      return "A team can have at most 3 defenders.";
    }


    return null;
  }


  function addGoal(team) {

    state.goals.push({
      id:
        String(Date.now()) +
        "-" +
        String(Math.random()),

      team: team,
      type: "NORMAL",
      scorerId: "",
      assistId: ""
    });


    renderStep2();
  }


  function removeGoal(id) {

    state.goals =
      state.goals.filter(function (g) {
        return g.id !== id;
      });


    renderStep2();
  }


  function goalCount(team) {

    return state.goals
      .filter(function (g) {
        return g.team === team;
      })
      .length;
  }


  function winningTeam() {

    var p =
      goalCount("pink");

    var b =
      goalCount("blue");


    if (p === b) {
      return "DRAW";
    }


    return p > b
      ? "PINK"
      : "BLUE";
  }


  function renderStep2() {

    normaliseDependentState();


    var p =
      goalCount("pink");

    var b =
      goalCount("blue");


    document.getElementById("score")
      .textContent =
      "Pink " +
      p +
      " – " +
      b +
      " Blue";


    renderGoals("pink");
    renderGoals("blue");

    renderChoices("otf");
    renderChoices("motm");
  }


  function populateSelect(
    select,
    options,
    selectedValue,
    includeBlank,
    blankLabel
  ) {

    select.innerHTML = "";


    if (includeBlank) {

      var blank =
        document.createElement("option");

      blank.value = "";

      blank.textContent =
        blankLabel || "None";

      select.appendChild(blank);
    }


    options.forEach(function (p) {

      var option =
        document.createElement("option");

      option.value = p.id;
      option.textContent = p.name;


      if (p.id === selectedValue) {
        option.selected = true;
      }


      select.appendChild(option);

    });
  }


  function renderGoals(team) {

    var container =
      document.getElementById(
        team + "Goals"
      );


    container.innerHTML = "";


    var goals =
      state.goals.filter(function (g) {
        return g.team === team;
      });


    if (!goals.length) {

      var empty =
        document.createElement("div");

      empty.className = "hint";
      empty.textContent = "No goals.";

      container.appendChild(empty);

      return;
    }


    goals.forEach(
      function (goal) {

        var row =
          document.createElement("div");

        row.className =
          "goal-row";


        /*
         * GOAL TYPE
         */

        var typeLabel =
          document.createElement("label");

        typeLabel.appendChild(
          document.createTextNode("Type")
        );


        var type =
          document.createElement("select");


        var normal =
          document.createElement("option");

        normal.value = "NORMAL";
        normal.textContent = "Normal";


        var own =
          document.createElement("option");

        own.value = "OWN_GOAL";
        own.textContent = "Own goal";


        type.appendChild(normal);
        type.appendChild(own);

        type.value =
          goal.type;


        type.addEventListener(
          "change",
          function () {

            goal.type =
              type.value;

            goal.scorerId = "";

            renderStep2();

          }
        );


        typeLabel.appendChild(type);


        /*
         * SCORER
         */

        var scorerLabel =
          document.createElement("label");

        scorerLabel.appendChild(
          document.createTextNode("Scorer")
        );


        var scorer =
          document.createElement("select");


        var scorerTeam =
          goal.type === "OWN_GOAL"
            ? otherTeam(team)
            : team;


        var scorerPlayers =
          state[scorerTeam]
            .playerIds
            .map(playerById)
            .filter(Boolean);


        populateSelect(
          scorer,
          scorerPlayers,
          goal.scorerId,
          true,
          "Choose scorer"
        );


        scorer.addEventListener(
          "change",
          function () {

            goal.scorerId =
              scorer.value;


            if (
              goal.type === "NORMAL" &&
              goal.assistId ===
                goal.scorerId
            ) {
              goal.assistId = "";
            }


            renderStep2();

          }
        );


        scorerLabel.appendChild(scorer);


        /*
         * ASSIST
         */

        var assistLabel =
          document.createElement("label");

        assistLabel.appendChild(
          document.createTextNode("Assist")
        );


        var assist =
          document.createElement("select");


        var assistPlayers =
          state[team]
            .playerIds
            .filter(function (id) {

              return (
                goal.type !== "NORMAL" ||
                id !== goal.scorerId
              );

            })
            .map(playerById)
            .filter(Boolean);


        populateSelect(
          assist,
          assistPlayers,
          goal.assistId,
          true,
          "No assist"
        );


        assist.addEventListener(
          "change",
          function () {

            goal.assistId =
              assist.value;

          }
        );


        assistLabel.appendChild(assist);


        /*
         * REMOVE GOAL
         */

        var remove =
          document.createElement("button");

        remove.type = "button";
        remove.className = "danger";
        remove.textContent = "Remove";


        remove.addEventListener(
          "click",
          function () {
            removeGoal(goal.id);
          }
        );


        row.appendChild(typeLabel);
        row.appendChild(scorerLabel);
        row.appendChild(assistLabel);
        row.appendChild(remove);


        container.appendChild(row);

      }
    );
  }


  function motmEligibleIds() {

    var winner =
      winningTeam();


    if (winner === "DRAW") {
      return allSelectedIds();
    }


    return winner === "PINK"
      ? state.pink.playerIds.slice()
      : state.blue.playerIds.slice();
  }


  function renderChoices(kind) {

    var container =
      document.getElementById(
        kind === "otf"
          ? "otfChoices"
          : "motmChoices"
      );


    container.innerHTML = "";


    var ids =
      kind === "otf"
        ? allSelectedIds()
        : motmEligibleIds();


    if (kind === "motm") {

      state.motmIds =
        state.motmIds.filter(
          function (id) {

            return (
              ids.indexOf(id) !== -1
            );

          }
        );

    }


    ids.forEach(function (id) {

      var label =
        document.createElement("label");

      label.className = "choice";


      var checkbox =
        document.createElement("input");

      checkbox.type =
        "checkbox";


      var selected =
        kind === "otf"
          ? state.otfIds
          : state.motmIds;


      checkbox.checked =
        selected.indexOf(id) !== -1;


      checkbox.addEventListener(
        "change",
        function () {

          if (kind === "otf") {

            if (checkbox.checked) {

              state.otfIds.push(id);

            } else {

              state.otfIds =
                state.otfIds.filter(
                  function (x) {
                    return x !== id;
                  }
                );

            }

            return;
          }


          if (checkbox.checked) {

            if (
              state.motmIds.length >= 2
            ) {

              showError(
                "Choose at most 2 Players of the Match."
              );

              renderChoices("motm");

              return;
            }


            state.motmIds.push(id);

          } else {

            state.motmIds =
              state.motmIds.filter(
                function (x) {
                  return x !== id;
                }
              );

          }


          clearError();

        }
      );


      label.appendChild(checkbox);

      label.appendChild(
        document.createTextNode(
          playerName(id)
        )
      );


      container.appendChild(label);

    });
  }


  function validateMatchDetails() {

    if (
      state.motmIds.length < 1 ||
      state.motmIds.length > 2
    ) {

      return (
        "Choose 1 or 2 Players of the Match."
      );

    }


    for (
      var i = 0;
      i < state.goals.length;
      i++
    ) {

      var goal =
        state.goals[i];


      if (!goal.scorerId) {
        return "Every goal needs a scorer.";
      }


      var scorerTeam =
        goal.type === "OWN_GOAL"
          ? otherTeam(goal.team)
          : goal.team;


      if (
        state[scorerTeam]
          .playerIds
          .indexOf(goal.scorerId) === -1
      ) {

        return (
          "A goal has an invalid scorer."
        );

      }


      if (
        goal.assistId &&
        state[goal.team]
          .playerIds
          .indexOf(goal.assistId) === -1
      ) {

        return (
          "A goal has an invalid assist."
        );

      }


      if (
        goal.type === "NORMAL" &&
        goal.assistId &&
        goal.assistId ===
          goal.scorerId
      ) {

        return (
          "A player cannot assist their own normal goal."
        );

      }

    }


    return null;
  }


  function buildPayload() {

    var p =
      goalCount("pink");

    var b =
      goalCount("blue");


    return {

      datePlayed:
        document
          .getElementById("datePlayed")
          .value,


      pinkTeam: {

        playerIds:
          state.pink.playerIds.slice(),

        captainId:
          state.pink.captainId,

        goalkeeperId:
          state.pink.goalkeeperId,

        defenderIds:
          state.pink.defenderIds.slice()

      },


      blueTeam: {

        playerIds:
          state.blue.playerIds.slice(),

        captainId:
          state.blue.captainId,

        goalkeeperId:
          state.blue.goalkeeperId,

        defenderIds:
          state.blue.defenderIds.slice()

      },


      pinkGoals: p,

      blueGoals: b,

      winningTeam:
        winningTeam(),


      goals:
        state.goals.map(
          function (goal) {

            return {

              team:
                goal.team.toUpperCase(),

              scorerId:
                goal.scorerId,

              assistId:
                goal.assistId || null,

              isOwnGoal:
                goal.type ===
                "OWN_GOAL"

            };

          }
        ),


      otfIds:
        state.otfIds.slice(),


      motmIds:
        state.motmIds.slice()

    };
  }


  document
    .getElementById("playerSearch")
    .addEventListener(
      "input",
      renderAvailablePlayers
    );


  document
    .getElementById("addPinkGoal")
    .addEventListener(
      "click",
      function () {
        addGoal("pink");
      }
    );


  document
    .getElementById("addBlueGoal")
    .addEventListener(
      "click",
      function () {
        addGoal("blue");
      }
    );


  document
    .getElementById("continueBtn")
    .addEventListener(
      "click",
      function () {

        var error =
          validateTeams();


        if (error) {

          showError(error);

          return;
        }


        clearError();


        document
          .getElementById("step1")
          .classList
          .add("hidden");


        document
          .getElementById("step2")
          .classList
          .remove("hidden");


        renderStep2();


        window.scrollTo({
          top: 0,
          behavior: "smooth"
        });

      }
    );


  document
    .getElementById("backBtn")
    .addEventListener(
      "click",
      function () {

        clearError();


        document
          .getElementById("step2")
          .classList
          .add("hidden");


        document
          .getElementById("step1")
          .classList
          .remove("hidden");


        document
          .getElementById("reviewCard")
          .classList
          .add("hidden");


        renderStep1();


        window.scrollTo({
          top: 0,
          behavior: "smooth"
        });

      }
    );


  document
    .getElementById("reviewBtn")
    .addEventListener(
      "click",
      function () {

        var error =
          validateMatchDetails();


        if (error) {

          showError(error);

          return;
        }


        clearError();


        var payload =
          buildPayload();


        document
          .getElementById("payloadPreview")
          .textContent =
          JSON.stringify(
            payload,
            null,
            2
          );


        document
          .getElementById("reviewCard")
          .classList
          .remove("hidden");


        document
          .getElementById("reviewCard")
          .scrollIntoView({
            behavior: "smooth",
            block: "start"
          });

      }
    );


  fetch(
    "/api/players",
    {
      headers: {
        "Accept": "application/json"
      }
    }
  )

    .then(function (response) {

      return response
        .json()
        .then(function (data) {

          if (!response.ok) {

            throw new Error(
              data.error ||
              "Failed to load players."
            );

          }

          return data;

        });

    })

    .then(function (data) {

      players =
        data.players || [];


      document
        .getElementById("loading")
        .classList
        .add("hidden");


      document
        .getElementById("teamsArea")
        .classList
        .remove("hidden");


      document
        .getElementById("step1Actions")
        .classList
        .remove("hidden");


      renderStep1();

    })

    .catch(function (error) {

      document
        .getElementById("loading")
        .textContent =
        "Could not load players.";


      showError(
        error.message
      );

    });

})();
</script>

</body>
</html>`;
}