/* 街区猫王 — AI 启发式策略（零 DOM 依赖）
 * 浏览器：window.CKG_AI；Node：module.exports
 * 依赖：CKG_CONFIG、CKG_ENGINE（Node 下自动 require）
 */
(function (root, factory) {
  var CONFIG = root.CKG_CONFIG;
  var ENGINE = root.CKG_ENGINE;
  if (typeof require !== 'undefined') {
    try { CONFIG = CONFIG || require('./config.js'); } catch (e) {}
    try { ENGINE = ENGINE || require('./engine.js'); } catch (e) {}
  }
  var api = factory(CONFIG, ENGINE);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CKG_AI = api;
})(typeof self !== 'undefined' ? self : this, function (CONFIG, ENGINE) {

  // 精确胜率：P(攻击方 d6+aMod > 防守方 d6+dMod)
  function winProb(aMod, dMod) {
    var w = 0;
    for (var a = 1; a <= 6; a++) for (var d = 1; d <= 6; d++)
      if (a + aMod > d + dMod) w++;
    return w / 36;
  }

  function breedOf(game, p) { return p.breed; }

  // 地块对某玩家的战略价值（占领视角）
  function tileValue(game, tile, p) {
    var tt = CONFIG.TILE_TYPES[tile.type];
    var v = tt.score * 8;
    if (tt.sunTile) v += 14;
    if (tt.food) v += 5;
    if (tt.nestable) v += 8;
    // 与已有地盘相连加成（连片计分）
    var adj = 0;
    game.neighbors(tile).forEach(function (nb) { if (nb.owner === p.id) adj++; });
    v += adj * 6;
    return v;
  }

  // BFS：从 tileId 出发到满足 pred 的最近地块距离（限深 8）
  function bfsDist(game, fromId, pred) {
    var from = game.tileById(fromId);
    var seen = {}, q = [{ x: from.x, y: from.y, d: 0 }];
    seen[from.x + ',' + from.y] = true;
    while (q.length) {
      var cur = q.shift();
      if (cur.d > 8) continue;
      var t = game.tileAt(cur.x, cur.y);
      if (t && cur.d > 0 && pred(t)) return cur.d;
      if (cur.d === 8) continue;
      [[1,0],[-1,0],[0,1],[0,-1]].forEach(function (dd) {
        var x = cur.x + dd[0], y = cur.y + dd[1], k = x + ',' + y;
        if (seen[k]) return;
        var nt = game.tileAt(x, y);
        if (!nt) return;
        if (CONFIG.TILE_TYPES[nt.type].dangerous) return; // 寻路不穿危险格
        seen[k] = true;
        q.push({ x: x, y: y, d: cur.d + 1 });
      });
    }
    return 99;
  }

  function combatMods(game, cat, pl, sunSpend) {
    return (pl.breed === 'tabby' ? 2 : 0) +
           ((!game.isDay() && pl.breed === 'black') ? 2 : 0) -
           cat.injured * 2 + (sunSpend || 0);
  }

  function scoreAction(game, a, bestSoFar) {
    var p = game.players[game.current];
    var cat = a.cat ? game.catById(a.cat) : null;
    var t = cat ? game.tileById(cat.tile) : null;
    var tt = t ? CONFIG.TILE_TYPES[t.type] : null;
    switch (a.kind) {
      case 'pass': return 0;
      case 'peek': return 2;
      case 'mad':  // 花 1 鱼换 1 行动点：有好行动可做才值
        return (bestSoFar >= 12 && p.fish >= 2) ? bestSoFar + 1 : 1;
      case 'occupy': {
        var v = tileValue(game, t, p);
        var owned = 0;
        game.tiles.forEach(function (x) { if (x.owner === p.id) owned++; });
        if (owned >= 5) v *= 0.55; // 地盘够多时转向经营
        if (p.marks <= 2) v *= 0.5; // 爪印紧张时省着用
        return v + 6;
      }
      case 'forage': {
        var f = tt.forage, fish = f.fish || 0, box = f.box || 0;
        if (fish > 0) {
          if (p.breed === 'orange') fish++;
          fish += game.roundMods.forageFishBonus - game.roundMods.foragePenalty;
          fish = Math.max(0, fish);
        }
        if (t.type === 'bakery') box += game.roundMods.boxBonus;
        var need = (p.fish < 4) ? 1.8 : (p.fish < 8 ? 1.1 : 0.6);
        var boxNeed = (p.box < 3) ? 2.2 : 0.7;
        var s = fish * 4 * need + box * 10 * boxNeed;
        if (box > 0 && p.box < 3) s += 10; // 为筑巢做战略储备
        if (t.trap) s -= 25; // 陷阱！别去
        return s;
      }
      case 'sun':
        return 8 + (p.sun < 2 ? 5 : 0) + game.roundMods.sunBonus * 2;
      case 'fight': {
        var def = game.catById(a.target), dp = game.players[def.player];
        var am = combatMods(game, cat, p, a.sun);
        var dm = combatMods(game, def, dp, 0);
        var wp = winProb(am, dm);
        if (wp < 0.5) return 0.5;
        var base = tt.score * 3 + 6;
        if (t.owner === dp.id) base += 22;              // 能夺地
        if (game.roundMods.darkmoon && dp.fish > 0) base += 5;
        if (a.sun > 0 && wp < 0.72) base -= a.sun * 2;  // 阳光别乱花
        return base * wp;
      }
      case 'nest': return 46;
      case 'rest':
        return cat.injured >= 2 ? 17 : 8;
      case 'meow': return 13;
      case 'move': {
        // 朝最有价值的目标靠近
        var goals = [];
        game.tiles.forEach(function (gt) {
          var gtt = CONFIG.TILE_TYPES[gt.type];
          if (gt.owner == null && !gtt.neutral && gtt.occupiable !== false && p.marks > 0)
            goals.push({ id: gt.id, v: tileValue(game, gt, p) + 6 });
          else if (gt.type === 'boxpile' && p.box < 3)
            goals.push({ id: gt.id, v: 20 }); // 缺纸箱时优先去纸箱堆
          else if (gtt.forage && p.fish < 6)
            goals.push({ id: gt.id, v: 10 });
          else if (gtt.sunTile && p.sun < 3)
            goals.push({ id: gt.id, v: 12 });
        });
        if (p.box >= 3) game.tiles.forEach(function (gt) {
          if (gt.owner === p.id && gt.type === 'boxpile' && !gt.nest)
            goals.push({ id: gt.id, v: 44 });
        });
        // 去打占着我地盘的敌人
        game.tiles.forEach(function (gt) {
          if (gt.owner === p.id && !CONFIG.TILE_TYPES[gt.type].neutral) {
            var enemies = game.catsOn(gt.id).filter(function (c) { return c.player !== p.id; });
            if (enemies.length) goals.push({ id: gt.id, v: 18 });
          }
        });
        var best = 0;
        goals.forEach(function (gl) {
          var d = bfsDist(game, a.tileId, function (x) { return x.id === gl.id; });
          if (d < 90) best = Math.max(best, gl.v - d * 5);
        });
        var riskPenalty = a.risk ? 8 : 0;
        return Math.max(0.5, best - riskPenalty);
      }
    }
    return 0;
  }

  function chooseAction(game) {
    var acts = game.getLegalActions();
    if (!acts.length) return { kind: 'pass' };
    // 先评一轮（不含 mad），再决定 mad 是否值得
    var scored = acts.map(function (a) {
      return { a: a, s: (a.kind === 'mad') ? -1 : scoreAction(game, a, 0) };
    });
    var best = 0;
    scored.forEach(function (x) { if (x.s > best) best = x.s; });
    var mad = scored.filter(function (x) { return x.a.kind === 'mad'; })[0];
    if (mad) mad.s = scoreAction(game, mad.a, best);
    var pick = scored[0];
    scored.forEach(function (x) { if (x.s > pick.s) pick = x; });
    return pick.a;
  }

  /* ---- 待定输入（拼牌/事件抉择）的 AI 决策 ---- */

  function tileTypeValue(type) {
    var tt = CONFIG.TILE_TYPES[type];
    var v = tt.score * 4;
    if (tt.sunTile) v += 10;
    if (tt.food) v += 4;
    if (tt.nestable) v += 5;
    if (type === 'doghouse') v = -6;
    if (type === 'road') v = -1;
    return v;
  }

  function resolvePending(game, pending) {
    var p = game.players[pending.player != null ? pending.player :
                         (pending.choice ? pending.choice.player : game.current)];
    if (pending.kind === 'tileChoice') {
      var opts = pending.options;
      var i = tileTypeValue(opts[1]) > tileTypeValue(opts[0]) ? 1 : 0;
      return { index: i };
    }
    if (pending.kind === 'tilePos') {
      var cells = pending.cells, bestCell = cells[0], bestS = -1e9;
      cells.forEach(function (c) {
        var s = tileTypeValue(pending.tileType);
        var adjOwn = 0, adjDog = 0, adjVal = 0;
        [[1,0],[-1,0],[0,1],[0,-1]].forEach(function (d) {
          var t = game.tileAt(c.x + d[0], c.y + d[1]);
          if (!t) return;
          if (t.owner === p.id) adjOwn++;
          if (t.type === 'doghouse') adjDog++;
          adjVal += CONFIG.TILE_TYPES[t.type].score;
        });
        s += adjOwn * 6 + adjVal - adjDog * 8;
        if (s > bestS) { bestS = s; bestCell = c; }
      });
      return { x: bestCell.x, y: bestCell.y };
    }
    if (pending.kind === 'eventChoice') {
      var ch = pending.choice, me = game.players[ch.player];
      if (ch.sub === 'catchers') {
        // 抓最没价值的猫：优先在老垃圾场的
        var cats = me.cats.filter(function (c) { return !c.trapped; });
        cats.sort(function (a, b) {
          var ta = game.tileById(a.tile), tb = game.tileById(b.tile);
          var va = (ta.type === 'junkyard' ? 0 : 10) + a.injured * 3;
          var vb = (tb.type === 'junkyard' ? 0 : 10) + b.injured * 3;
          return va - vb;
        });
        return { catId: cats.length ? cats[0].id : null };
      }
      if (ch.sub === 'cleanup') {
        var cs = me.cats.filter(function (c) { return game.tileById(c.tile).type !== 'junkyard'; });
        cs.sort(function (a, b) { return b.injured - a.injured; });
        return { catId: cs.length ? cs[0].id : null };
      }
      if (ch.sub === 'dogwalker') {
        var bestT = null, bestN = -1;
        game.tiles.forEach(function (t) {
          if (CONFIG.TILE_TYPES[t.type].neutral) return;
          var enemies = game.catsOn(t.id).filter(function (c) { return c.player !== me.id; }).length;
          var total = game.catsOn(t.id).length;
          var score = enemies * 10 + total;
          if (score > bestN) { bestN = score; bestT = t; }
        });
        return { tileId: bestT ? bestT.id : 0 };
      }
      if (ch.sub === 'trap') {
        var bestF = null, bestS = -1;
        game.tiles.forEach(function (t) {
          var tt = CONFIG.TILE_TYPES[t.type];
          if (!tt.food || tt.neutral) return;
          var enemies = game.catsOn(t.id).filter(function (c) { return c.player !== me.id; }).length;
          var s = enemies * 10 + (tt.forage.fish || 0);
          if (s > bestS) { bestS = s; bestF = t; }
        });
        return { tileId: bestF ? bestF.id : 0 };
      }
    }
    return {};
  }

  // 品种轮选：70% 拿最强可用，否则随机（增加多样性）
  var BREED_TIER = ['tabby', 'orange', 'cow', 'black', 'ragdoll', 'siamese'];
  function chooseBreed(available, rng) {
    var r = (rng || Math.random)();
    if (r < 0.7) {
      for (var i = 0; i < BREED_TIER.length; i++)
        if (available.indexOf(BREED_TIER[i]) >= 0) return BREED_TIER[i];
    }
    return available[Math.floor(r * available.length) % available.length];
  }

  // 给定战斗行动的攻击方胜率（UI 显示用）
  function fightOdds(game, a) {
    var p = game.players[game.current];
    var cat = game.catById(a.cat), def = game.catById(a.target);
    var dp = game.players[def.player];
    return winProb(combatMods(game, cat, p, a.sun), combatMods(game, def, dp, 0));
  }

  return {
    chooseAction: chooseAction,
    resolvePending: resolvePending,
    chooseBreed: chooseBreed,
    winProb: winProb,
    fightOdds: fightOdds,
    scoreAction: scoreAction
  };
});
