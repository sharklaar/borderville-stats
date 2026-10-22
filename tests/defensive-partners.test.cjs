const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const cp = require('node:child_process');
const c = vm.createContext({});
vm.runInContext(fs.readFileSync('scripts/fpl-scoring.js', 'utf8'), c);
vm.runInContext(fs.readFileSync('scripts/leaderboards.js', 'utf8').replace(/main\(\);\s*$/, ''), c);
const players = Object.fromEntries(['a', 'b', 'c', 'g'].map(id => [id, {name: id}]));
const match = (id, extra = {}) => ({id, countsForStats: true, playersPink: ['a','b','c','g'], pinkDefs: ['a','b'], pinkGKId: 'g', pinkGoals: 2, blueGoals: 1, winningTeam: 'PINK', ...extra});

test('totals FPL points only while defending together, ranking cumulative rather than average', () => {
  const matches = [match('1'), match('2', {pinkDefs:['b','a']}), match('3', {pinkDefs:['a','c'], blueGoals:0}), match('4', {pinkDefs:['a']})];
  const goals = [{matchId:'1', scorerId:'a'}, {matchId:'4', scorerId:'a'}];
  // a+b: 18 + 6 goal points in first game, 18 in second = 42.
  // a+c: 24 in their single game, higher average but lower total.
  const rows = c.rankDefensivePartners(matches, goals, players, new Set(matches.map(m=>m.id)));
  assert.equal(rows[0].ids.join(','), 'a,b');
  assert.equal(rows[0].points, 42);
  assert.equal(rows[0].games, 2);
  assert.equal(rows[1].points, 24);
  assert.equal(c.rankDefensivePartners(matches, goals, players, new Set(['2']))[0].points, 18);
});

test('forms duos in trios and excludes keepers, duplicate defenders and non-stat matches', () => {
  const matches = [match('1', {pinkDefs:['a','b','c','g','a']}),match('2',{countsForStats:false})];
  const rows = c.rankDefensivePartners(matches, [], players, new Set(['1','2']));
  assert.equal(rows.length, 3);
  assert.ok(rows.every(r=>r.games===1 && r.points===18 && !r.ids.includes('g')));
});

test('shared scorer preserves all existing FPL totals', () => {
  const original = cp.execFileSync('git',['show','HEAD:scripts/fpl-view.js'],{encoding:'utf8'});
  const old = vm.createContext({});
  vm.runInContext(original.slice(0,original.indexOf('function renderSummary')), old);
  const data = JSON.parse(fs.readFileSync('data/aggregated.json','utf8'));
  assert.equal(JSON.stringify(c.buildFplTable(data)), JSON.stringify(old.buildFplTable(data)));
});
