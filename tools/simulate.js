/* 街区猫王 — Node 自动对战模拟（只依赖 engine.js + ai.js）
 * 用法：node tools/simulate.js [局数] [种子]
 * 验证：多局 AI 对战无报错、无死循环、正常终局并输出计分。
 */
var CONFIG = require('../js/config.js');
var ENGINE = require('../js/engine.js');
var AI = require('../js/ai.js');

function draftBreeds(n, rng) {
  var avail = CONFIG.BREEDS.map(function (b) { return b.id; });
  var out = [];
  for (var i = 0; i < n; i++) {
    var b = AI.chooseBreed(avail, rng);
    out.push(b);
    avail.splice(avail.indexOf(b), 1);
  }
  return out;
}

function playOne(numPlayers, seed) {
  var rng = (function (s) {
    return function () { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  })(seed);
  var breeds = draftBreeds(numPlayers, rng);
  var players = breeds.map(function (b, i) {
    return { name: 'AI-' + CONFIG.breedById(b).name, type: 'ai', breed: b,
             color: CONFIG.PLAYER_COLORS[i] };
  });
  var game = new ENGINE.Game({ players: players, seed: seed });
  var steps = 0, actions = 0;
  while (!game.isOver()) {
    if (++steps > 60000) throw new Error('疑似死循环（步数超限），seed=' + seed);
    var p = game.pending;
    if (p) {
      var res = game.resolvePending(AI.resolvePending(game, p));
      if (!res.ok) throw new Error('resolvePending 失败: ' + JSON.stringify(res) + ' seed=' + seed);
      continue;
    }
    var a = AI.chooseAction(game);
    var r = game.doAction(a);
    if (!r.ok) throw new Error('AI 给出非法行动: ' + JSON.stringify(a) + ' seed=' + seed);
    actions++;
  }
  return { scores: game.getScores(), actions: actions, rounds: game.round };
}

function main() {
  var games = parseInt(process.argv[2] || '6', 10);
  var seedBase = parseInt(process.argv[3] || '20260925', 10);
  var configs = [2, 3, 4, 2, 3, 4, 4, 2];
  var ok = 0;
  for (var g = 0; g < games; g++) {
    var n = configs[g % configs.length];
    var seed = seedBase + g * 7919;
    var t0 = Date.now();
    var r = playOne(n, seed);
    var ms = Date.now() - t0;
    var line = r.scores.map(function (s) {
      return s.name + s.total + '分(地' + s.tileScore + '/巢' + s.nestScore +
             '/连' + s.connected + '/鱼' + s.fishPts + '/阳' + s.sunPts + '/衔' + s.titles + ')';
    }).join(' | ');
    console.log('第' + (g + 1) + '局 [' + n + '人 seed=' + seed + '] ' + r.rounds +
                '轮/' + r.actions + '行动/' + ms + 'ms → ' + line);
    if (r.rounds !== (n === 2 ? 10 : 12)) throw new Error('轮数不对: ' + r.rounds);
    ok++;
  }
  console.log('✅ 全部 ' + ok + ' 局正常终局，无报错、无死循环');
}

main();
