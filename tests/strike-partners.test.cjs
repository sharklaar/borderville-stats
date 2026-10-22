const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const c = vm.createContext({});
vm.runInContext(fs.readFileSync('scripts/leaderboards.js', 'utf8').replace(/main\(\);\s*$/, ''), c);

test('combines both directions once per goal and ranks pairs descending', () => {
  const players = {a: {name: 'Alice'}, b: {name: 'Bob'}, c: {name: 'Chris'}};
  const goal = (scorerId, assistId, extra = {}) => ({matchId: '1', scorerId, assistId, ...extra});
  const rows = c.computeStrikePartners([
    goal('a','b'), goal('b','a'), goal('c','a'),
    goal('a','b', {isOwnGoal:true}), goal('a',null),
    goal('a','b',{matchId:'2'}), goal('a','a')
  ], players, new Set(['1']));
  assert.equal(rows.length, 2);
  assert.match(rows[0], /Alice.*Bob/s);
  assert.match(rows[0], /lb-value">2</);
  assert.match(rows[1], /lb-value">1</);
});
