/* 街区猫王 Street Cat King — 规则引擎（纯逻辑，零 DOM 依赖）
* 浏览器：挂载为 window.CKG_ENGINE；Node：module.exports
* 用法：
* var game = new CKG_ENGINE.Game({players:[{name,type:'human'|'ai',breed,color}], seed});
* 驱动循环：按 game.pending 要求输入（resolvePending），或在 phase==='turns' 时
* 用 getLegalActions() 取当前玩家合法行动、doAction(a) 执行。
*/
(function (root, factory) {
var CONFIG = root.CKG_CONFIG;
if (!CONFIG && typeof require !== 'undefined') {
  try { CONFIG = require('./config.js'); } catch (e) {}
}
var api = factory(CONFIG);
if (typeof module!== 'undefined' && module.exports) module.exports = api;
else root.CKG_ENGINE = api;
})(typeof self!== 'undefined'? self: this, function (CONFIG) {

function mulberry32(a) {
return function () {
a |= 0; a = (a + 0x6D2B79F5) | 0;
var t = Math.imul(a ^ (a >>> 15), 1 | a);
t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
}

var DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function Game(opts) {
opts = opts || {};
var ps = opts.players || [];
if (ps.length < 2 || ps.length > 4) throw new Error('玩家数必须为 2-4');
var seen = {};
ps.forEach(function (p) {
if (!p.breed ||!CONFIG.breedById(p.breed)) throw new Error('品种缺失或非法');
if (seen[p.breed]) throw new Error('品种重复：' + p.breed);
seen[p.breed] = true;
});

this.seed = (opts.seed!= null)? opts.seed: Math.floor(Math.random() * 1e9);
this.rng = mulberry32(this.seed);

var self = this;
this.players = ps.map(function (p, i) {
return {
id: i, name: p.name || CONFIG.PLAYER_NAMES[i], type: p.type || 'human',
breed: p.breed, color: p.color || CONFIG.PLAYER_COLORS[i % 4],
fish: 2, box: 0, sun: 0, marks: 10,
cats: [0, 1, 2].map(function (n) {
return { id: i + '-' + n, player: i, tile: 0, injured: 0, trapped: false};
}),
madUsed: false, peeked: false
};
});

this.tiles = [{ id: 0, type: 'junkyard', x: 0, y: 0, owner: null, nest: false, trap: false}];
this.junkyardId = 0;
this.nextTileId = 1;
this.grid = { '0,0': 0};

var deck = CONFIG.TILE_DECK_BASE.concat(CONFIG.TILE_DECK_BASE); // 24 张
this.shuffle(deck);
if (ps.length === 2) deck.splice(0, 4); // 2 人局 10 轮 → 20 张
this.tileDeck = deck;

var ev = CONFIG.EVENTS.map(function (e) { return e.id;});
this.shuffle(ev);
if (ps.length === 2) ev = ev.slice(0, 10); // 2 人局只用 10 张事件
this.eventDeck = ev;

this.maxRounds = (ps.length === 2)? 10: 12;
this.round = 0;
this.startPlayer = Math.floor(this.rng() * ps.length);
this.phase = 'event'; // event → place → turns → over
this.pending = null; // {kind:'eventChoice'|'tileChoice'|'tilePos',...}
this.current = 0;
this.ap = 0;
this.roundMods = this.freshMods();
this.log = [];
this._choiceQueue = [];
this.scores = null;

this.startRound();
}

Game.prototype.freshMods = function () {
return { forageFishBonus: 0, sunBonus: 0, moveLimit: 0, foragePenalty: 0,
boxBonus: 0, zoomies: false, darkmoon: false};
};

Game.prototype.shuffle = function (arr) {
for (var i = arr.length - 1; i > 0; i--) {
var j = Math.floor(this.rng() * (i + 1));
var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
}
return arr;
};

Game.prototype.d6 = function () { return 1 + Math.floor(this.rng() * 6);};

Game.prototype.isDay = function () { return this.round % 2 === 1;};

Game.prototype.logMsg = function (msg) {
this.log.push({ round: this.round, msg: msg});
if (this.log.length > 500) this.log.splice(0, this.log.length - 500);
};

Game.prototype.tileById = function (id) {
for (var i = 0; i < this.tiles.length; i++) if (this.tiles[i].id === id) return this.tiles[i];
return null;
};

Game.prototype.tileAt = function (x, y) {
var id = this.grid[x + ',' + y];
return (id == null)? null: this.tileById(id);
};

Game.prototype.neighbors = function (tile) {
var out = [], self = this;
DIRS.forEach(function (d) {
var t = self.tileAt(tile.x + d[0], tile.y + d[1]);
if (t) out.push(t);
});
return out;
};

Game.prototype.catsOn = function (tileId) {
var out = [];
this.players.forEach(function (p) {
p.cats.forEach(function (c) { if (c.tile === tileId) out.push(c);});
});
return out;
};

Game.prototype.catById = function (id) {
var parts = String(id).split('-');
var p = this.players[+parts[0]];
return p? p.cats[+parts[1]]: null;
};

/* ---------------- 回合流程 ---------------- */

Game.prototype.startRound = function () {
var self = this;
this.round++;
this.roundMods = this.freshMods();
this.players.forEach(function (p) {
p.madUsed = false; p.peeked = false;
p.cats.forEach(function (c) { c.trapped = false;});
});
this.tiles.forEach(function (t) { t.trap = false;});
var eid = this.eventDeck[this.round - 1];
var ev = CONFIG.eventById(eid);
this.logMsg('—— 第 ' + this.round + ' 天（' + (this.isDay()? '☀️ 白天': '🌙 夜晚') + '）：' +
ev.icon + '' + ev.desc + ' ——');
this.applyEvent(eid);
this._afterEvent();
};

Game.prototype.applyEvent = function (eid) {
var self = this, m = this.roundMods;
this.pendingEvent = eid;
switch (eid) {
case 'goodman': m.forageFishBonus = 1; break;
case 'sunshine': m.sunBonus = 1; break;
case 'delivery': m.boxBonus = 1; break;
case 'rainstorm': m.moveLimit = 1; m.foragePenalty = 1; break;
case 'zoomies': m.zoomies = true; break;
case 'darkmoon': m.darkmoon = true; break;
case 'catnip':
this.players.forEach(function (p) { p.sun++;});
this.logMsg('🌿 每位玩家获得 1 阳光');
break;
case 'catchers':
this.players.forEach(function (p) {
if (p.breed === 'ragdoll') { self.logMsg('😻 ' + p.name + '（布偶猫）萌混过关，免疫捕猫队'); return;}
var r = self.d6();
if (r <= 2) {
self._choiceQueue.push({ sub: 'catchers', player: p.id});
self.logMsg('🥅 ' + p.name + ' 掷出 ' + r + ' 点，有 1 只猫被捕猫队盯上！');
} else {
self.logMsg('🥅 ' + p.name + ' 掷出 ' + r + ' 点，躲过了捕猫队');
}
});
break;
case 'dogwalker':
this._choiceQueue.push({ sub: 'dogwalker', player: this.startPlayer});
break;
case 'trap':
this._choiceQueue.push({ sub: 'trap', player: this.startPlayer});
break;
case 'cleanup':
this.players.forEach(function (p) {
self._choiceQueue.push({ sub: 'cleanup', player: p.id});
});
break;
case 'straydogs':
this.players.forEach(function (p) {
p.cats.forEach(function (c) {
var t = self.tileById(c.tile);
var safe = t.nest || t.type === 'boxpile' || t.type === 'junkyard';
if (safe) return;
if (p.breed === 'black') return; // 夜行者无视流浪狗群
var r = self.d6();
if (r <= 3) {
c.injured++;
self.logMsg('🐺 ' + p.name + ' 的猫在被流浪狗咬伤（掷出 ' + r + '）');
}
});
});
break;
}
};

// 事件结算后：还有抉择则挂 pending，否则进入拼地块
Game.prototype._afterEvent = function () {
if (this._choiceQueue.length) {
this.pending = { kind: 'eventChoice', choice: this._choiceQueue[0]};
this.phase = 'event';
return;
}
var a = this.tileDeck.shift(), b = this.tileDeck.shift();
this.pending = { kind: 'tileChoice', player: this.startPlayer, options: [a, b]};
this.phase = 'place';
};

Game.prototype._resolveEventChoice = function (choice, data) {
var p = this.players[choice.player];
var breedName = function (pl) { return CONFIG.breedById(pl.breed).name;};
if (choice.sub === 'catchers') {
var cat = this.catById(data.catId);
if (cat && cat.player === p.id &&!cat.trapped) {
cat.trapped = true;
this.logMsg('🥅 ' + p.name + ' 的' + breedName(p) + '被抓走，本轮剩余行动跳过');
}
} else if (choice.sub === 'cleanup') {
if (data.catId) {
var c2 = this.catById(data.catId);
if (c2 && c2.player === p.id) {
c2.tile = this.junkyardId;
this.logMsg('🧹 ' + p.name + ' 把 1 只猫送回了老垃圾场');
}
} else {
this.logMsg('🧹 ' + p.name + ' 放弃了大扫除顺风车');
}
} else if (choice.sub === 'dogwalker') {
var t = this.tileById(data.tileId);
if (t) {
this.logMsg('🐩 遛狗大妈的恶犬（战力 8）冲进了！');
var self = this;
this.catsOn(t.id).slice().forEach(function (c) {
var pl = self.players[c.player];
var mod = (pl.breed === 'tabby'? 2: 0) + ((!self.isDay() && pl.breed === 'black')? 2: 0) - c.injured * 2;
var r = self.d6();
if (r + mod >= 8) {
self.logMsg('🐱 ' + pl.name + ' 的猫掷出 ' + r + '+' + mod + '，赶跑了恶犬！');
} else {
c.injured++; c.tile = self.junkyardId;
self.logMsg('🐱 ' + pl.name + ' 的猫掷出 ' + r + '+' + mod + '，被恶犬咬伤逃回老垃圾场');
}
});
}
} else if (choice.sub === 'trap') {
var t2 = this.tileById(data.tileId);
if (t2) {
t2.trap = true;
this.logMsg('🪤 起始玩家在布下了捕猫陷阱');
}
}
};

Game.prototype.resolvePending = function (data) {
var p = this.pending;
if (!p) return { ok: false, msg: '没有待处理的输入'};
data = data || {};
if (p.kind === 'eventChoice') {
this._resolveEventChoice(p.choice, data);
this._choiceQueue.shift();
this.pending = null;
this._afterEvent();
return { ok: true};
}
if (p.kind === 'tileChoice') {
var idx = (data.index === 1)? 1: 0;
var chosen = p.options[idx];
var tt = CONFIG.TILE_TYPES[chosen];
this.logMsg('🧱 ' + this.players[p.player].name + ' 翻出，拼入街区');
this.pending = { kind: 'tilePos', player: p.player, tileType: chosen,
cells: this.candidateCells()};
return { ok: true};
}
if (p.kind === 'tilePos') {
var cell = null, i;
var cells = this.candidateCells();
for (i = 0; i < cells.length; i++) {
if (cells[i].x === data.x && cells[i].y === data.y) { cell = cells[i]; break;}
}
if (!cell) return { ok: false, msg: '非法拼接位置'};
var tile = { id: this.nextTileId++, type: p.tileType, x: cell.x, y: cell.y,
owner: null, nest: false, trap: false};
this.tiles.push(tile);
this.grid[cell.x + ',' + cell.y] = tile.id;
this.logMsg('🧱 拼在了街区边缘');
this.pending = null;
this._beginTurns();
return { ok: true};
}
return { ok: false, msg: '未知 pending 类型'};
};

Game.prototype.candidateCells = function () {
var seen = {}, out = [], self = this;
this.tiles.forEach(function (t) {
DIRS.forEach(function (d) {
var x = t.x + d[0], y = t.y + d[1], k = x + ',' + y;
if (!self.grid[k] &&!seen[k]) { seen[k] = true; out.push({ x: x, y: y});}
});
});
return out;
};

Game.prototype._beginTurns = function () {
this.phase = 'turns';
this.current = this.startPlayer;
this.ap = 2 + (this.roundMods.zoomies? 1: 0);
var p = this.players[this.current];
this.logMsg('▶️ ' + p.name + '（' + CONFIG.breedById(p.breed).name + '）开始行动，' + this.ap + ' 行动点');
};

/* ---------------- 行动 ---------------- */

// 可达目的地（BFS，steps 步内；穿过危险格不允许，只能以其为终点）
Game.prototype._reachable = function (fromTile, steps) {
var out = [], seen = {}, self = this;
seen[fromTile.x + ',' + fromTile.y] = true;
var frontier = [{ x: fromTile.x, y: fromTile.y, s: 0}];
while (frontier.length) {
var cur = frontier.shift();
if (cur.s >= steps) continue;
DIRS.forEach(function (d) {
var x = cur.x + d[0], y = cur.y + d[1], k = x + ',' + y;
if (seen[k]) return;
var t = self.tileAt(x, y);
if (!t) return;
var dang = CONFIG.TILE_TYPES[t.type].dangerous;
if (dang) {
seen[k] = true;
out.push({ x: x, y: y, tileId: t.id, risk: dang});
return; // 危险格只能作为终点
}
seen[k] = true;
out.push({ x: x, y: y, tileId: t.id, risk: null});
frontier.push({ x: x, y: y, s: cur.s + 1});
});
}
return out;
};

Game.prototype.moveRange = function (p) {
if (this.roundMods.moveLimit) return this.roundMods.moveLimit;
return (p.breed === 'siamese')? 2: 1;
};

Game.prototype.getLegalActions = function () {
if (this.phase!== 'turns') return [];
var self = this, p = this.players[this.current], acts = [];
var range = this.moveRange(p);
p.cats.forEach(function (cat) {
if (cat.trapped) return;
var t = self.tileById(cat.tile), tt = CONFIG.TILE_TYPES[t.type];
// 移动
self._reachable(t, range).forEach(function (d) {
acts.push({ kind: 'move', cat: cat.id, to: { x: d.x, y: d.y}, tileId: d.tileId, risk: d.risk});
});
// 占领
if (t.owner == null &&!tt.neutral && tt.occupiable!== false && p.marks > 0)
acts.push({ kind: 'occupy', cat: cat.id});
// 觅食（含捡纸箱）
if (tt.forage) acts.push({ kind: 'forage', cat: cat.id});
// 晒太阳
if (tt.sunTile) acts.push({ kind: 'sun', cat: cat.id});
// 战斗（老垃圾场不可战斗）
if (!tt.neutral) {
self.catsOn(t.id).forEach(function (e) {
if (e.player === p.id) return;
var maxSun = Math.min(2, p.sun);
for (var s = 0; s <= maxSun; s++)
acts.push({ kind: 'fight', cat: cat.id, target: e.id, tileId: t.id, sun: s});
});
}
// 筑巢
if (t.owner === p.id && t.type === 'boxpile' &&!t.nest && p.box >= 3)
acts.push({ kind: 'nest', cat: cat.id});
// 休息
if (cat.injured > 0) acts.push({ kind: 'rest', cat: cat.id});
// 卖萌（布偶猫）
if (p.breed === 'ragdoll' && self.isDay() && (t.type === 'fishstall' || t.type === 'bakery'))
acts.push({ kind: 'meow', cat: cat.id});
});
// 免费行动：查看牌堆顶（暹罗猫）、发疯（奶牛猫）
if (p.breed === 'siamese' &&!p.peeked) acts.push({ kind: 'peek'});
if (p.breed === 'cow' &&!p.madUsed && p.fish >= 1) acts.push({ kind: 'mad'});
acts.push({ kind: 'pass'});
return acts;
};

Game.prototype._findAction = function (a) {
var list = this.getLegalActions();
for (var i = 0; i < list.length; i++) {
if (JSON.stringify(list[i]) === JSON.stringify(a)) return list[i];
}
return null;
};

Game.prototype.doAction = function (a) {
if (this.phase!== 'turns') return { ok: false, msg: '现在不能行动'};
var p = this.players[this.current];
var act = this._findAction(a);
if (!act) return { ok: false, msg: '非法行动'};
var res = { ok: true, logs: []};
var self = this;
var say = function (m) { self.logMsg(m); res.logs.push(m);};

// 免费行动：不消耗行动点
if (act.kind === 'peek') {
p.peeked = true;
var nid = this.eventDeck[this.round]; // 下一轮的事件
res.peek = nid? CONFIG.eventById(nid): null;
say('🐱 ' + p.name + '（暹罗猫）打探到下一张事件：' +
(res.peek? res.peek.icon + '': '（牌堆已空）'));
return res;
}
if (act.kind === 'mad') {
p.fish--; p.madUsed = true; this.ap++;
say('🐄 ' + p.name + '（奶牛猫）发疯！花 1 条鱼多拿 1 个行动点');
return res;
}
if (act.kind === 'pass') {
say('⏭️ ' + p.name + ' 提前结束了回合');
this.endTurn();
return res;
}

this.ap--;
var cat = this.catById(act.cat);
var t = this.tileById(cat.tile), tt = CONFIG.TILE_TYPES[t.type];
var bname = CONFIG.breedById(p.breed).name;

if (act.kind === 'move') {
var dest = this.tileById(act.tileId);
var dtt = CONFIG.TILE_TYPES[dest.type];
if (act.risk === 'road') {
var r = this.d6(); res.roll = r;
if (r <= 3) {
cat.injured++;
say('🚗 ' + p.name + ' 的' + bname + '横穿马路掷出 ' + r + ' 点，被车蹭伤退回原地');
} else {
cat.tile = dest.id;
say('🚗 ' + p.name + ' 的' + bname + '掷出 ' + r + ' 点，飞速穿过马路到达');
}
} else if (act.risk === 'dog') {
cat.injured++; cat.tile = this.junkyardId;
say('🐕 ' + p.name + ' 的' + bname + '误入狗窝，被恶犬赶回老垃圾场（受伤）');
} else {
cat.tile = dest.id;
say('🐾 ' + p.name + ' 的' + bname + '移动到');
}
} else if (act.kind === 'occupy') {
t.owner = p.id; p.marks--;
say('📍 ' + p.name + ' 在撒下气味，占领了这块地盘（剩余爪印 ' + p.marks + '）');
} else if (act.kind === 'forage') {
var f = tt.forage, fish = f.fish || 0, box = f.box || 0;
if (fish > 0) {
if (p.breed === 'orange') fish++;
fish += this.roundMods.forageFishBonus;
fish -= this.roundMods.foragePenalty;
fish = Math.max(0, fish);
}
if (t.type === 'bakery') box += this.roundMods.boxBonus;
p.fish += fish; p.box += box;
var gain = [];
if (fish) gain.push(fish + ' 条鱼'); if (box) gain.push(box + ' 个纸箱');
say('🍽️ ' + p.name + ' 的' + bname + '在觅食，获得 ' + (gain.join('、') || '空气'));
if (t.trap) {
t.trap = false; cat.injured++; cat.trapped = true;
say('🪤 踩中捕猫陷阱！' + p.name + ' 的' + bname + '受伤，本轮行动结束');
}
} else if (act.kind === 'sun') {
var s = 1 + this.roundMods.sunBonus;
p.sun += s;
say('☀️ ' + p.name + ' 的' + bname + '在晒太阳，获得 ' + s + ' 阳光');
} else if (act.kind === 'fight') {
var def = this.catById(act.target), dp = this.players[def.player];
var am = (p.breed === 'tabby'? 2: 0) + ((!this.isDay() && p.breed === 'black')? 2: 0) -
cat.injured * 2 + act.sun;
var dm = (dp.breed === 'tabby'? 2: 0) + ((!this.isDay() && dp.breed === 'black')? 2: 0) -
def.injured * 2;
p.sun -= act.sun;
var ra = this.d6(), rd = this.d6();
res.roll = { a: ra, d: rd, am: am, dm: dm};
var win = (ra + am) > (rd + dm);
var winner = win? p: dp, loser = win? dp: p;
var wcat = win? cat: def, lcat = win? def: cat;
lcat.injured++; lcat.tile = this.junkyardId;
var detail = '⚔️ ' + p.name + '（' + ra + '+' + am + '）vs ' + dp.name +
'（' + rd + '+' + dm + '）：' + winner.name + ' 获胜！' +
loser.name + ' 的猫受伤逃回老垃圾场';
if (this.roundMods.darkmoon && loser.fish > 0) {
loser.fish--; winner.fish++;
detail += '；🌙 月黑风高，胜者夺走 1 条鱼';
}
if (win && t.owner === dp.id && p.marks > 0) {
t.owner = p.id; p.marks--;
detail += '；📍 顺势夺取了';
res.captured = true;
}
say(detail);
} else if (act.kind === 'nest') {
p.box -= 3; t.nest = true;
say('🪹 ' + p.name + ' 在用 3 个纸箱筑起了温暖的巢穴！');
} else if (act.kind === 'rest') {
if (t.nest && t.owner === p.id) {
cat.injured = 0;
say('💤 ' + p.name + ' 的' + bname + '在巢穴里美美睡了一觉，伤全好了');
} else {
cat.injured--;
say('💤 ' + p.name + ' 的' + bname + '休息了一下，恢复 1 点伤（剩余 ' + cat.injured + '）');
}
} else if (act.kind === 'meow') {
p.fish += 2;
say('😻 ' + p.name + '（布偶猫）在卖萌，路人投喂 2 条鱼');
}

if (this.ap <= 0) this.endTurn();
return res;
};

Game.prototype.endTurn = function () {
if (this.phase!== 'turns') return;
var n = this.players.length;
this.current = (this.current + 1) % n;
if (this.current === this.startPlayer) { this._endRound(); return;}
this.ap = 2 + (this.roundMods.zoomies? 1: 0);
var p = this.players[this.current];
this.logMsg('▶️ ' + p.name + '（' + CONFIG.breedById(p.breed).name + '）开始行动，' + this.ap + ' 行动点');
};

Game.prototype._endRound = function () {
if (this.round >= this.maxRounds) {
this.phase = 'over';
this.pending = null;
this.scores = this.getScores();
var w = this.scores[0];
this.logMsg('🏁 游戏结束！街区猫王是（' + w.total + ' 分）！');
return;
}
this.startPlayer = (this.startPlayer + 1) % this.players.length;
this.startRound();
};

Game.prototype.isOver = function () { return this.phase === 'over';};

/* ---------------- 计分 ---------------- */

Game.prototype.getScores = function () {
var self = this;
var rows = this.players.map(function (p) {
var tileScore = 0, tileCount = 0, nestCount = 0;
self.tiles.forEach(function (t) {
if (t.owner === p.id) {
tileScore += CONFIG.TILE_TYPES[t.type].score;
tileCount++;
if (t.nest) nestCount++;
}
});
// 连片加成：正交相连分组，每满 3 块 +2
var seen = {}, connected = 0;
self.tiles.forEach(function (t) {
if (t.owner!== p.id || seen[t.id]) return;
var size = 0, stack = [t];
seen[t.id] = true;
while (stack.length) {
var c = stack.pop(); size++;
self.neighbors(c).forEach(function (nb) {
if (nb.owner === p.id &&!seen[nb.id]) { seen[nb.id] = true; stack.push(nb);}
});
}
connected += Math.floor(size / 3) * 2;
});
return {
player: p.id, name: p.name, color: p.color,
breed: CONFIG.breedById(p.breed).name,
tileScore: tileScore, tileCount: tileCount,
nestCount: nestCount, nestScore: nestCount * 4,
connected: connected,
fish: p.fish, sun: p.sun,
fishPts: Math.floor(p.fish / 3), sunPts: Math.floor(p.sun / 2),
titles: 0, titleNames: [], total: 0
};
});
var maxT = Math.max.apply(null, rows.map(function (r) { return r.tileCount;}));
var maxF = Math.max.apply(null, rows.map(function (r) { return r.fish;}));
rows.forEach(function (r) {
if (r.tileCount === maxT && maxT > 0) { r.titles += 3; r.titleNames.push('地盘王 +3');}
if (r.fish === maxF) { r.titles += 2; r.titleNames.push('干饭王 +2');}
r.total = r.tileScore + r.nestScore + r.connected + r.fishPts + r.sunPts + r.titles;
});
rows.sort(function (a, b) { return (b.total - a.total) || (b.fish - a.fish);});
return rows;
};

/* ---------------- 存档 ---------------- */

Game.prototype.serialize = function () {
return JSON.stringify({
v: 1, seed: this.seed, round: this.round, maxRounds: this.maxRounds,
startPlayer: this.startPlayer, phase: this.phase, current: this.current, ap: this.ap,
players: this.players, tiles: this.tiles, nextTileId: this.nextTileId, grid: this.grid,
tileDeck: this.tileDeck, eventDeck: this.eventDeck, roundMods: this.roundMods,
pending: this.pending, choiceQueue: this._choiceQueue,
pendingEvent: this.pendingEvent, log: this.log.slice(-200)
});
};

Game.load = function (json) {
var d = (typeof json === 'string')? JSON.parse(json): json;
var g = Object.create(Game.prototype);
g.seed = d.seed; g.rng = mulberry32(d.seed ^ 0x9e3779b9);
g.round = d.round; g.maxRounds = d.maxRounds;
g.startPlayer = d.startPlayer; g.phase = d.phase;
g.current = d.current; g.ap = d.ap;
g.players = d.players; g.tiles = d.tiles;
g.nextTileId = d.nextTileId; g.grid = d.grid;
g.tileDeck = d.tileDeck; g.eventDeck = d.eventDeck;
g.roundMods = d.roundMods; g.pending = d.pending;
g._choiceQueue = d.choiceQueue || [];
g.pendingEvent = d.pendingEvent; g.log = d.log || [];
g.junkyardId = 0;
g.scores = (g.phase === 'over')? g.getScores(): null;
return g;
};

return { Game: Game, DIRS: DIRS};
});
