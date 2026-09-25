/* 街区猫王 — 界面层（DOM 操作与流程驱动）· 绘本版
* 依赖：CKG_CONFIG、CKG_ENGINE、CKG_AI（按此顺序用 <script> 引入）
* 纯前端，无构建步骤；file:// 双击可直接运行。
* 注意：本文件只负责表现层，规则逻辑一律调用 CKG_ENGINE / CKG_AI。
*/
(function (root) {
var CONFIG = root.CKG_CONFIG, ENGINE = root.CKG_ENGINE, AI = root.CKG_AI;

var UI = {};
var game = null;
var selectedCat = null;
var ui = { screen: 'setup', pickMode: null, fast: false, draft: null};
var $ = function (id) { return document.getElementById(id);};

function esc(s) {
return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

var ACT_ICONS = { move: '🐾', occupy: '📍', forage: '🍽️', sun: '☀️', fight: '⚔️',
  nest: '🪹', rest: '💤', meow: '😻', peek: '👀', mad: '🐄', pass: '⏭️' };

function toast(msg, ms) {
var rootEl = $('toast-root'); if (!rootEl) return;
var d = document.createElement('div');
d.className = 'toast'; d.textContent = msg;
rootEl.appendChild(d);
setTimeout(function () {
d.classList.add('out');
setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d);}, 450);
}, ms || 6000);
}

/* ================= 设置界面 ================= */

UI.init = function () {
renderSetup();
$('game-screen').classList.add('hidden');
$('setup-screen').classList.remove('hidden');
};

function renderSetup() {
var n = ui.playerCount || 3;
ui.playerCount = n;
if (!ui.setupPlayers || ui.setupPlayers.length!== n) {
ui.setupPlayers = [];
for (var i = 0; i < n; i++) ui.setupPlayers.push({ name: CONFIG.PLAYER_NAMES[i], type: i === 0? 'human': 'ai'});
}
var h = '<div class="setup-card"><div class="setup-hero">' +
'<div class="cats-row">🐱🐈🐈‍⬛</div><h1>街区猫王</h1>' +
'<p class="subtitle">流浪猫策略领地争夺 · 2-4 人 · 约60分钟</p></div>' +
'<div class="setup-row"><span>玩家人数：</span><div class="seg" id="pcount-seg">' +
[2, 3, 4].map(function (x) {
return '<button data-n="' + x + '" class="' + (x === n? 'on': '') + '">' + x + ' 人</button>';
}).join('') + '</div></div><div id="prows">' +
ui.setupPlayers.map(function (p, i) {
return '<div class="prow">' +
'<span class="pdot" style="background:' + CONFIG.PLAYER_COLORS[i] + '"></span>' +
'<input data-i="' + i + '" class="pname" value="' + esc(p.name) + '" maxlength="10">' +
'<div class="seg">' +
'<button data-i="' + i + '" data-t="human" class="' + (p.type === 'human'? 'on': '') + '">🧑 人类</button>' +
'<button data-i="' + i + '" data-t="ai" class="' + (p.type === 'ai'? 'on': '') + '">🤖 AI</button>' +
'</div></div>';
}).join('') + '</div>' +
'<button id="to-draft" class="primary" style="width:100%">下一步：选择品种 →</button>' +
'<p class="hint" style="text-align:center">人类玩家在同一台设备上轮流操作；AI 由电脑托管。</p></div>';
$('setup-screen').innerHTML = h;

$('pcount-seg').addEventListener('click', function (e) {
var b = e.target.closest('button'); if (!b) return;
ui.playerCount = +b.dataset.n; ui.setupPlayers = null; renderSetup();
});
$('prows').addEventListener('click', function (e) {
var b = e.target.closest('button'); if (!b) return;
ui.setupPlayers[+b.dataset.i].type = b.dataset.t; renderSetup();
});
$('prows').addEventListener('change', function (e) {
var inp = e.target.closest('.pname'); if (!inp) return;
ui.setupPlayers[+inp.dataset.i].name = inp.value.trim() || CONFIG.PLAYER_NAMES[+inp.dataset.i];
});
$('to-draft').addEventListener('click', renderDraft);
}

// 品种轮选
function renderDraft() {
ui.draft = { order: ui.setupPlayers.map(function (_, i) { return i;}), idx: 0,
taken: {}, breeds: {}};
// 简单随机打乱选秀顺序
var o = ui.draft.order;
for (var i = o.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = o[i]; o[i] = o[j]; o[j] = t;}
renderDraftStep();
}

function renderDraftStep() {
var d = ui.draft;
if (d.idx >= d.order.length) { startGame(); return;}
var pi = d.order[d.idx], sp = ui.setupPlayers[pi];
var avail = CONFIG.BREEDS.filter(function (b) { return!d.taken[b.id];});
var h = '<div class="setup-card"><div class="setup-hero">' +
'<div class="cats-row">🐾</div><h2>品种轮选</h2></div>' +
'<p style="text-align:center">轮到 <b style="color:' + CONFIG.PLAYER_COLORS[pi] + '">' + esc(sp.name) + '</b> 选择品种 ' +
(sp.type === 'ai'? '(AI 托管)': '') + '</p><div class="breed-grid">' +
avail.map(function (b) {
return '<button class="breed-card auto-pick" data-b="' + b.id + '">' +
'<div class="breed-top"><div class="bicon">' + b.icon + '</div>' +
'<div><b>' + b.name + '</b><div class="btitle">' + b.title + '</div></div></div>' +
'<div class="bdesc">' + b.desc + '</div></button>';
}).join('') + '</div></div>';
$('setup-screen').innerHTML = h;
var cards = $('setup-screen').querySelectorAll('.breed-card');
var picked = false;
function pick(bid) {
if (picked) return; picked = true;
d.taken[bid] = true; d.breeds[pi] = bid; d.idx++;
setTimeout(renderDraftStep, ui.fast? 0: 350);
}
// 只有人类回合才可点选；AI 回合卡片不可点，避免抢选或重复选
if (sp.type === 'human' &&!ui.fast) {
cards.forEach(function (c) { c.addEventListener('click', function () { pick(c.dataset.b);});});
}
if (sp.type === 'ai' || ui.fast) {
setTimeout(function () {
var ids = avail.map(function (b) { return b.id;});
pick(AI.chooseBreed(ids));
}, ui.fast? 0: 700);
}
}

function startGame() {
var players = ui.setupPlayers.map(function (sp, i) {
return { name: sp.name, type: sp.type, breed: ui.draft.breeds[i], color: CONFIG.PLAYER_COLORS[i]};
});
game = new ENGINE.Game({ players: players});
selectedCat = null;
renderMap._prev = {};
ui.screen = 'game';
$('setup-screen').classList.add('hidden');
$('game-screen').classList.remove('hidden');
// 日志折叠开关（手机默认收起）
$('log-wrap').classList.remove('collapsed');
if (window.innerWidth < 960) $('log-wrap').classList.add('collapsed');
$('log-toggle').onclick = function () { $('log-wrap').classList.toggle('collapsed');};
log('🎮 游戏开始！' + players.map(function (p) {
return p.name + '(' + CONFIG.breedById(p.breed).name + ')';
}).join('、'));
drive();
if (!ui.fast) toast('💡 点选你的猫咪，再点发绿光的格子就能走；先占领 🐟鱼摊 攒鱼吧！');
}

/* ================= 主驱动 ================= */

// fast 模式用队列 + 泵消除递归：整局同步跑完也不会爆栈
var driveQueue = [], pumping = false;
function pump() {
  if (pumping) return;
  pumping = true;
  try { while (driveQueue.length) driveQueue.shift()(); }
  finally { pumping = false; }
}
function schedule(fn) { if (ui.fast) { driveQueue.push(fn); pump(); } else setTimeout(fn, 450);}

function pendingPlayer(p) {
var i = (p.player!= null)? p.player: p.choice.player;
return game.players[i];
}

function drive() {
if (!game) return;
if (ui.fast) { ui.steps = (ui.steps || 0) + 1; if (ui.steps > 200000) throw new Error('fast 模式步数超限，疑似死循环'); }
render();
if (game.isOver()) { onGameOver(); return;}
var p = game.pending;
if (p) {
var pl = pendingPlayer(p);
if (pl.type === 'human' &&!ui.fast) { renderPending(p); return;}
schedule(autoResolvePendingUI);
return;
}
if (game.phase === 'turns') {
var cur = game.players[game.current];
if (cur.type === 'human' &&!ui.fast) return; // 等待玩家点按钮
schedule(function () {
if (cur.type === 'ai') doAction(AI.chooseAction(game));
else autoHumanAction();
});
}
}

function doAction(a) {
if (!game || game.phase!== 'turns') return;
var r = game.doAction(a || { kind: 'pass'});
if (!r.ok) { log('⚠️ ' + r.msg);}
if (selectedCat &&!game.catById(selectedCat)) selectedCat = null;
drive();
}

// 战斗二次确认（fast/冒烟模式直接执行，避免卡住）
function onActionClick(a) {
if (a.kind === 'fight' &&!ui.fast) { confirmFight(a); return;}
doAction(a);
}

function confirmFight(a) {
var def = game.catById(a.target), dp = game.players[def.player];
var me = game.players[game.current];
var odds = Math.round(AI.fightOdds(game, a) * 100);
showModal('<div class="ev-art">⚔️</div><h3>确认开战？</h3>' +
'<div class="ev-desc">' + esc(me.name) + ' 的猫咪 vs ' + esc(dp.name) + ' 的猫咪<br>' +
'预估胜率 <b>' + odds + '%</b>' + (a.sun? '（将花费 ' + a.sun + ' ☀️）': '') +
'<br><small>败者受伤并被赶回老垃圾场，胜者可夺取地盘。</small></div>' +
'<div class="btn-col"><button id="fight-ok" class="primary">⚔️ 开打！</button>' +
'<button id="fight-no" class="ghost">再想想</button></div>');
$('fight-ok').addEventListener('click', function () { closeModal(); doAction(a);});
$('fight-no').addEventListener('click', closeModal);
}

// fast/冒烟模式：走真实 UI 控件完成待定输入
function autoResolvePendingUI() {
var p = game.pending; if (!p) { drive(); return;}
renderPending(p);
var btn = document.querySelector('#modal-root .auto-pick');
if (btn) { btn.click(); return;}
if (ui.pickMode === 'tilePos') {
var c = game.pending.cells[0];
pickCell(c.x, c.y); return;
}
if (ui.pickMode === 'pickTile') {
var d = AI.resolvePending(game, game.pending);
pickTileOnMap(d.tileId); return;
}
drive();
}

function autoHumanAction() {
renderActionPanel();
var btn = document.querySelector('#action-panel button[data-kind]:not([data-kind="pass"])') ||
document.querySelector('#action-panel button[data-kind="pass"]');
if (btn) btn.click(); else doAction({ kind: 'pass'});
}

/* ================= 渲染 ================= */

function log(msg) {
var el = $('log');
if (!el) return;
var div = document.createElement('div');
div.textContent = msg;
el.appendChild(div);
while (el.children.length > 120) el.removeChild(el.firstChild);
el.scrollTop = el.scrollHeight;
}

function render() {
if (!game) return;
renderTopbar(); renderMap(); renderPlayers(); renderActionPanel();
// 把引擎日志同步到界面
if (game.log.length!== render._n) {
for (var i = render._n || 0; i < game.log.length; i++) log(game.log[i].msg);
render._n = game.log.length;
}
}
render._n = 0;

function renderTopbar() {
var ev = game.pendingEvent? CONFIG.eventById(game.pendingEvent): null;
var timePill = game.isDay()? '<span class="pill day">☀️ 白天</span>': '<span class="pill night">🌙 夜晚</span>';
var h = '<div class="tb-left"><span class="tb-title">🐱 街区猫王</span>' +
'<span class="pill">🗓️ 第 ' + game.round + ' / ' + game.maxRounds + ' 天</span>' + timePill +
(ev? '<span class="pill ev">' + ev.icon + ' ' + ev.name + '</span>': '');
if (game.phase === 'turns') {
var cp = game.players[game.current];
h += '<span class="pill ap">⚡ ' + game.ap + ' 行动点</span>' +
'<span class="pill res">🐟 ' + cp.fish + '</span>' +
'<span class="pill res">📦 ' + cp.box + '</span>' +
'<span class="pill res">☀️ ' + cp.sun + '</span>' +
'<span class="pill res">📍 ' + cp.marks + '</span>';
}
h += '</div><div class="tb-right">' +
'<button id="btn-save">💾 存档</button>' +
'<button id="btn-load">📂 读档</button>' +
'<button id="btn-help">❓ 帮助</button>' +
'<button id="btn-restart">🔄 重开</button></div>';
$('topbar').innerHTML = h;
$('btn-save').onclick = function () {
try { localStorage.setItem('ckg_save', game.serialize()); log('💾 已存档'); toast('💾 已存档');}
catch (e) { log('⚠️ 存档失败：' + e.message);}
};
$('btn-load').onclick = function () {
try {
var s = localStorage.getItem('ckg_save');
if (!s) { log('⚠️ 没有存档'); return;}
game = ENGINE.Game.load(s);
selectedCat = null; render._n = 0; renderMap._prev = {}; $('log').innerHTML = '';
log('📂 读档成功，继续游戏'); drive();
} catch (e) { log('⚠️ 读档失败：' + e.message);}
};
$('btn-help').onclick = showHelp;
$('btn-restart').onclick = function () {
if (ui.fast || confirm('确定要放弃本局、回到设置界面吗？')) UI.init();
};
}

function tileLabel(t) {
var tt = CONFIG.TILE_TYPES[t.type];
return tt.icon + ' ' + tt.name;
}

function renderMap() {
var map = $('map');
var xs = game.tiles.map(function (t) { return t.x;});
var ys = game.tiles.map(function (t) { return t.y;});
var minx = Math.min.apply(null, xs), miny = Math.min.apply(null, ys);
var CELL = 104;
var w = (Math.max.apply(null, xs) - minx + 1) * CELL;
var h = (Math.max.apply(null, ys) - miny + 1) * CELL;
map.style.width = w + 'px'; map.style.height = h + 'px';
var prevIds = renderMap._prev || {};
var curIds = {};
// 合法移动目标：选中己方猫后自动高亮，点格即走
var moveTargets = {};
if (ui.pickMode == null && game.phase === 'turns' &&!ui.fast &&
game.players[game.current].type === 'human' && selectedCat) {
game.getLegalActions().forEach(function (a) {
if (a.kind === 'move' && a.cat === selectedCat) moveTargets[a.tileId] = true;
});
}
var html = '';
// 拼接候选格
if (ui.pickMode === 'tilePos' && game.pending && game.pending.kind === 'tilePos') {
var tt = CONFIG.TILE_TYPES[game.pending.tileType];
game.pending.cells.forEach(function (c) {
html += '<div class="cell-pick" data-x="' + c.x + '" data-y="' + c.y + '" ' +
'style="left:' + ((c.x - minx) * CELL) + 'px;top:' + ((c.y - miny) * CELL) + 'px">' +
'<div class="cp-icon">' + tt.icon + '</div><div class="cp-name">拼在这里</div></div>';
});
}
game.tiles.forEach(function (t) {
curIds[t.id] = true;
var ttype = CONFIG.TILE_TYPES[t.type];
var owner = (t.owner!= null)? game.players[t.owner]: null;
var tileCats = game.catsOn(t.id);
var cats = tileCats.map(function (c) {
var pl = game.players[c.player];
var br = CONFIG.breedById(pl.breed);
var sel = (selectedCat === c.id)? ' sel': '';
var clickable = (game.phase === 'turns' && game.players[game.current].type === 'human' &&
c.player === game.current)? ' clickable': '';
return '<div class="cat' + sel + clickable + '" data-cat="' + c.id + '" data-pname="' + esc(pl.name) + '" ' +
'title="' + esc(pl.name) + ' 的' + br.name + (c.injured? '（受伤×' + c.injured + '）': '') + '"' +
' style="border-color:' + pl.color + '">' + br.icon +
(c.injured? '<span class="inj">🩹' + c.injured + '</span>': '') +
(c.trapped? '<span class="inj">🥅</span>': '') + '</div>';
}).join('');
var badges = (t.nest? '<span class="badge">🪹巢穴</span>': '') +
(t.trap? '<span class="badge warn">🪤陷阱</span>': '');
var cls = 'tile terr-' + t.type;
if (ui.pickMode === 'pickTile' && tileEligible(t)) cls += ' pickable';
if (moveTargets[t.id]) cls += ' movetarget';
if (tileCats.some(function (c) { return c.id === selectedCat;})) cls += ' has-sel';
if (!prevIds[t.id]) cls += ' drop';
html += '<div class="' + cls + '" data-tile="' + t.id + '" ' +
'style="left:' + ((t.x - minx) * CELL) + 'px;top:' + ((t.y - miny) * CELL) + 'px;' +
(owner? 'box-shadow:0 0 0 3px ' + owner.color + ';': '') + '">' +
'<div class="t-icon">' + ttype.icon + '</div>' +
'<div class="t-name">' + ttype.name + '</div>' +
(owner? '<div class="t-owner" style="background:' + owner.color + '">' + esc(owner.name) + '</div>': '') +
'<div class="t-badges">' + badges + '</div>' +
'<div class="t-cats">' + cats + '</div></div>';
});
renderMap._prev = curIds;
map.innerHTML = html;
}
renderMap._prev = {};

function tileEligible(t) {
var sub = ui.pickSub;
if (sub === 'dogwalker') return!CONFIG.TILE_TYPES[t.type].neutral;
if (sub === 'trap') { var tt = CONFIG.TILE_TYPES[t.type]; return tt.food &&!tt.neutral;}
return false;
}

// 地图点击委托：选猫 / 点格直走 / 拼接 / 事件选地块
document.addEventListener('click', function (e) {
var cp = e.target.closest('.cell-pick');
if (cp && ui.pickMode === 'tilePos') { pickCell(+cp.dataset.x, +cp.dataset.y); return;}
var tileEl = e.target.closest('.tile');
if (tileEl && ui.pickMode === 'pickTile') { pickTileOnMap(+tileEl.dataset.tile); return;}
var catEl = e.target.closest('.cat.clickable');
if (catEl) {
selectedCat = catEl.dataset.cat;
renderMap(); renderActionPanel();
return;
}
// 选中猫后点发光格直接移动
if (!ui.pickMode && selectedCat && game && game.phase === 'turns') {
var mv = e.target.closest('.tile.movetarget');
if (mv) {
var acts = game.getLegalActions();
for (var i = 0; i < acts.length; i++) {
var a = acts[i];
if (a.kind === 'move' && a.cat === selectedCat && a.tileId === +mv.dataset.tile) {
doAction(a); return;
}
}
}
}
});

function pickCell(x, y) {
ui.pickMode = null;
game.resolvePending({ x: x, y: y});
drive();
}

function pickTileOnMap(tileId) {
ui.pickMode = null; ui.pickSub = null;
game.resolvePending({ tileId: tileId});
drive();
}

function renderPlayers() {
$('players-bar').innerHTML = game.players.map(function (p, i) {
var br = CONFIG.breedById(p.breed);
var active = (game.phase === 'turns' && game.current === i)? ' active': '';
var cats = p.cats.map(function (c) {
var t = game.tileById(c.tile);
return '<span title="' + CONFIG.TILE_TYPES[t.type].name + (c.injured? ' 🩹×' + c.injured: '') +
(c.trapped? ' 🥅被抓': '') + '">' + br.icon + '</span>';
}).join('');
return '<div class="player' + active + '">' +
'<div class="p-head"><div class="p-avatar" style="border-color:' + p.color + '">' + br.icon + '</div>' +
'<div><div class="p-name" style="color:' + p.color + '">' + esc(p.name) + '</div>' +
'<div class="ptype">' + br.name + ' · ' + (p.type === 'ai'? '🤖 AI': '🧑 人类') + '</div></div></div>' +
'<div class="pres"><span class="pill res">🐟 ' + p.fish + '</span>' +
'<span class="pill res">📦 ' + p.box + '</span>' +
'<span class="pill res">☀️ ' + p.sun + '</span>' +
'<span class="pill res">📍 ' + p.marks + '</span></div>' +
'<div class="pcats">' + cats + '</div></div>';
}).join('');
}

function actionLabel(a) {
var p = game.players[game.current];
var cat = a.cat? game.catById(a.cat): null;
var t = cat? game.tileById(cat.tile): null;
var tt = t? CONFIG.TILE_TYPES[t.type]: null;
switch (a.kind) {
case 'move': {
var dt = game.tileById(a.tileId), dtt = CONFIG.TILE_TYPES[dt.type];
var risk = a.risk === 'road'? ' ⚠️马路': (a.risk === 'dog'? ' ⚠️狗窝！': '');
return '🐾 移动 → ' + dtt.icon + dtt.name + risk;
}
case 'occupy': return '📍 占领';
case 'forage': return (t.type === 'boxpile'? '📦 捡纸箱': '🍽️ 觅食') + '';
case 'sun': return '☀️ 晒太阳';
case 'fight': {
var def = game.catById(a.target), dp = game.players[def.player];
var odds = Math.round(AI.fightOdds(game, a) * 100);
var sun = a.sun? '（花' + a.sun + '☀️）': '';
return '⚔️ 打 ' + esc(dp.name) + ' 的猫' + sun + ' — 胜率' + odds + '%';
}
case 'nest': return '🪹 筑巢（花 3📦）';
case 'rest': return '💤 休息' + (t.nest && t.owner === p.id? '（巢穴：全恢复）': '');
case 'meow': return '😻 卖萌（得 2🐟）';
case 'peek': return '🐱 打探事件牌堆顶（免费）';
case 'mad': return '🐄 发疯：花 1🐟 +1 行动点（免费）';
case 'pass': return '⏭️ 跳过剩余行动';
}
return a.kind;
}

function actButton(a, i) {
var label = actionLabel(a).replace(/^\S+\s*/, '');
var icon = ACT_ICONS[a.kind] || '🐾';
if (a.kind === 'forage') {
var cat = game.catById(a.cat), t = game.tileById(cat.tile);
if (t.type === 'boxpile') icon = '📦';
}
var cls = 'act-btn' + (a.kind === 'fight'? ' danger': '');
return '<button class="' + cls + '" data-kind="' + a.kind + '" data-i="' + i + '">' +
'<span class="a-icon">' + icon + '</span><span>' + label + '</span></button>';
}

function renderActionPanel() {
var el = $('action-panel');
if (!game || game.phase!== 'turns') { el.innerHTML = '<div class="ap-hint">等待中…</div>'; return;}
var p = game.players[game.current];
var br = CONFIG.breedById(p.breed);
var h = '<div class="ap-head" style="border-color:' + p.color + '"><b>' + esc(p.name) + '</b> ' +
br.icon + br.name + ' <span class="pill ap">⚡ ' + game.ap + '</span></div>';
if (p.type === 'ai' &&!ui.fast) {
el.innerHTML = h + '<div class="ai-thinking">🤖 AI 思考中<span class="dots"></span></div>';
return;
}
var acts = game.getLegalActions();
// 默认选中第一只可行动的猫
if (!selectedCat ||!acts.some(function (a) { return a.cat === selectedCat;})) {
var first = acts.filter(function (a) { return a.cat;})[0];
selectedCat = first? first.cat: null;
}
if (game.round === 1 &&!ui.fast) {
h += '<div class="ap-tip">💡 点选你的猫咪，发绿光的格子可直接点过去；先占领 🐟鱼摊 攒鱼！</div>';
}
if (selectedCat) {
var cat = game.catById(selectedCat);
var t = game.tileById(cat.tile);
var tt = CONFIG.TILE_TYPES[t.type];
h += '<div class="ap-catsel">🐾 选中：' + br.icon + ' 位于 ' + tt.icon + tt.name +
(cat.injured? ' 🩹×' + cat.injured: '') +
(cat.trapped? ' 🥅被抓': '') +
'<br><span class="hint">点地图上的其他猫可切换 · 绿光格子点格即走</span></div>';
var mine = acts.filter(function (a) { return a.cat === selectedCat;});
// 排序：占领/战斗/觅食优先
var ord = { occupy: 1, fight: 2, nest: 3, forage: 4, sun: 5, meow: 6, move: 7, rest: 8};
mine.sort(function (a, b) { return (ord[a.kind] || 9) - (ord[b.kind] || 9);});
h += '<div class="act-grid">' + mine.map(function (a, i) { return actButton(a, i);}).join('') + '</div>';
el.innerHTML = h;
var btns = el.querySelectorAll('button[data-kind]');
btns.forEach(function (b) {
var a = mine[+b.dataset.i];
b.addEventListener('click', function () { onActionClick(a);});
});
} else {
el.innerHTML = h + '<div class="ap-hint">没有可行动的猫</div>';
}
// 全局免费行动 + 结束回合
var foot = document.createElement('div');
foot.className = 'ap-foot';
var globals = acts.filter(function (a) { return!a.cat && a.kind!== 'pass';});
globals.forEach(function (a) {
var b = document.createElement('button');
b.className = 'act-btn wide';
b.dataset.kind = a.kind;
b.innerHTML = '<span class="a-icon">' + (ACT_ICONS[a.kind] || '✨') + '</span><span>' +
actionLabel(a).replace(/^\S+\s*/, '') + '</span>';
b.addEventListener('click', function () { onActionClick(a);});
foot.appendChild(b);
});
var endb = document.createElement('button');
endb.textContent = '⏭️ 结束回合'; endb.className = 'primary';
endb.dataset.kind = 'pass';
endb.addEventListener('click', function () { doAction({ kind: 'pass'});});
foot.appendChild(endb);
el.appendChild(foot);
}

/* ================= 待定输入的 UI ================= */

function showModal(html) { $('modal-root').innerHTML = '<div class="modal-mask"><div class="modal">' + html + '</div></div>';}
function closeModal() { $('modal-root').innerHTML = '';}

function renderPending(p) {
closeModal(); ui.pickMode = null; ui.pickSub = null;
var pl = pendingPlayer(p);
if (p.kind === 'tileChoice') {
var cards = p.options.map(function (tid, i) {
var tt = CONFIG.TILE_TYPES[tid];
return '<button class="tile-pick auto-pick terr-' + tid + '" data-i="' + i + '">' +
'<div class="bicon">' + tt.icon + '</div><b>' + tt.name + '</b>' +
'<div class="bdesc">' + tt.desc + '</div>' +
'<div class="bdesc">占领分：' + tt.score + '</div></button>';
}).join('');
showModal('<div class="ev-art">🧱</div><h3>' + esc(pl.name) + ' · 拼接街区</h3>' +
'<p>翻出 2 张，选 1 张拼到地图边缘：</p>' +
'<div class="tile-pick-row">' + cards + '</div>');
$('modal-root').querySelectorAll('.tile-pick').forEach(function (b) {
b.addEventListener('click', function () {
closeModal();
game.resolvePending({ index: +b.dataset.i});
drive();
});
});
return;
}
if (p.kind === 'tilePos') {
ui.pickMode = 'tilePos';
var t2 = CONFIG.TILE_TYPES[p.tileType];
log('🧱 ' + pl.name + ' 选择了' + t2.name + '，请在地图上点击虚线格拼接');
render(); // 画出候选格
return;
}
if (p.kind === 'eventChoice') {
var ch = p.choice, me = game.players[ch.player];
if (ch.sub === 'catchers') {
var btns = me.cats.filter(function (c) { return!c.trapped;}).map(function (c) {
return '<button class="auto-pick" data-cat="' + c.id + '">' + CONFIG.breedById(me.breed).icon +
' 在' + (c.injured? '🩹': '') + '</button>';
}).join('');
showModal('<div class="ev-art">🥅</div><h3>捕猫队巡逻</h3>' +
'<p>' + esc(me.name) + ' 选择 1 只猫被抓走（本轮剩余行动跳过）：</p>' +
'<div class="btn-col">' + btns + '</div>');
$('modal-root').querySelectorAll('button[data-cat]').forEach(function (b) {
b.addEventListener('click', function () {
closeModal(); game.resolvePending({ catId: b.dataset.cat}); drive();
});
});
} else if (ch.sub === 'cleanup') {
var c2 = me.cats.map(function (c) {
var t = game.tileById(c.tile);
if (t.type === 'junkyard') return '';
return '<button class="auto-pick" data-cat="' + c.id + '">' + CONFIG.breedById(me.breed).icon +
' 从回老垃圾场</button>';
}).join('');
showModal('<div class="ev-art">🧹</div><h3>社区大扫除</h3>' +
'<p>' + esc(me.name) + ' 可免费把 1 只猫送回老垃圾场：</p>' +
'<div class="btn-col">' + c2 +
'<button data-cat="" class="auto-pick">跳过</button></div>');
$('modal-root').querySelectorAll('button[data-cat]').forEach(function (b) {
b.addEventListener('click', function () {
closeModal(); game.resolvePending({ catId: b.dataset.cat || null}); drive();
});
});
} else if (ch.sub === 'dogwalker') {
ui.pickMode = 'pickTile'; ui.pickSub = 'dogwalker';
showModal('<div class="ev-art">🐩</div><h3>遛狗大妈</h3>' +
'<div class="ev-desc">' + esc(me.name) +
' 点击<b>一张地块</b>，恶犬（战力 8）将冲进去逐只战斗。</div>' +
'<div class="btn-col"><button id="mclose" class="ghost">关闭提示</button></div>');
$('mclose').addEventListener('click', closeModal);
render();
} else if (ch.sub === 'trap') {
ui.pickMode = 'pickTile'; ui.pickSub = 'trap';
showModal('<div class="ev-art">🪤</div><h3>捕猫陷阱</h3>' +
'<div class="ev-desc">' + esc(me.name) +
' 点击<b>一张食物地块</b>（鱼摊/垃圾桶/面包店）布下陷阱。</div>' +
'<div class="btn-col"><button id="mclose" class="ghost">关闭提示</button></div>');
$('mclose').addEventListener('click', closeModal);
render();
}
}
}

/* ================= 终局 ================= */

function onGameOver() {
render();
var rows = game.getScores();
var w = rows[0];
var medals = ['🥇', '🥈', '🥉'];
var podium = rows.slice(0, 3).map(function (r, i) {
var br = CONFIG.breedById(game.players[r.player].breed);
return '<div class="pod' + (i === 0? ' first': '') + '"><div class="medal">' + medals[i] + '</div>' +
'<div class="p-avatar" style="border-color:' + r.color + '">' + br.icon + '</div>' +
'<div class="p-name" style="color:' + r.color + '">' + esc(r.name) + '</div>' +
'<div class="p-breed">' + r.breed + '</div><div class="p-score">' + r.total + ' 分</div></div>';
}).join('');
var trs = rows.map(function (r, i) {
return '<tr class="' + (i === 0? 'winner': '') + '">' +
'<td>' + (i === 0? '👑 ': '') + '<b style="color:' + r.color + '">' + esc(r.name) + '</b><br><small>' +
r.breed + '</small></td>' +
'<td>' + r.tileScore + '<br><small>' + r.tileCount + '块地</small></td>' +
'<td>' + r.nestScore + '<br><small>' + r.nestCount + '巢穴</small></td>' +
'<td>' + r.connected + '</td>' +
'<td>' + r.fishPts + '<br><small>' + r.fish + '🐟</small></td>' +
'<td>' + r.sunPts + '<br><small>' + r.sun + '☀️</small></td>' +
'<td>' + r.titles + '<br><small>' + r.titleNames.join('、') + '</small></td>' +
'<td><b>' + r.total + '</b></td></tr>';
}).join('');
showModal('<h2>🏁 游戏结束！</h2>' +
'<div class="winner-banner">👑 街区猫王是 <b>' + esc(w.name) + '</b> ' +
CONFIG.breedById(game.players[w.player].breed).icon + '（' + w.total + ' 分）！</div>' +
'<div class="podium">' + podium + '</div>' +
'<table class="scores"><tr><th>玩家</th><th>地盘分</th><th>巢穴</th><th>连片</th><th>鱼</th><th>阳光</th><th>称号</th><th>总分</th></tr>' +
trs + '</table>' +
'<div class="btn-col"><button id="again" class="primary auto-pick">🔄 再来一局</button></div>');
$('again').addEventListener('click', function () { closeModal(); UI.init();});
}

function showHelp() {
showModal('<div class="ev-art">❓</div><h3>玩法速查</h3><div class="help">' +
'<p>🐾 <b>目标</b>：12 天（2 人局 10 天）后地盘总分最高者成为街区猫王。</p>' +
'<p>🗺️ <b>每轮</b>：翻事件 → 起始玩家拼 1 张地块 → 每人 2 行动点（点自己的猫，再点行动按钮；发绿光的格子可直接点过去）。</p>' +
'<p>📍 <b>占领</b>：在无主地块放爪印；⚔️ <b>战斗</b>：d6+修正，高者胜，平局守方胜，败者受伤回老垃圾场，胜方可夺地。</p>' +
'<p>🐟 觅食 / ☀️ 晒太阳 / 📦 捡纸箱攒资源；🪹 3 纸箱在已占领纸箱堆筑巢（4 分）；💤 休息回血。</p>' +
'<p>🏆 <b>计分</b>：地块分（食物2/纸箱2/圣地3/空地马路1）+ 巢穴4 + 连片（每满3连块+2）+ 每3鱼1分 + 每2阳光1分 + 称号（地盘王+3/干饭王+2）。</p>' +
'<div class="btn-col"><button id="hclose" class="primary auto-pick">知道了</button></div></div>');
$('hclose').addEventListener('click', closeModal);
}

/* ================= 冒烟测试钩子 ================= */

// 被 tools/smoke.html 调用：快速跑完一整局（1 人类自动点 + 1 AI），验证无 JS 报错
UI.smokeRun = function () {
ui.fast = true;
ui.steps = 0;
ui.playerCount = 2;
ui.setupPlayers = [
{ name: '测试人类', type: 'human'},
{ name: 'AI对手', type: 'ai'}
];
ui.draft = { order: [0, 1], idx: 0, taken: {}, breeds: { 0: 'orange', 1: 'tabby'}};
var players = ui.setupPlayers.map(function (sp, i) {
return { name: sp.name, type: sp.type, breed: ui.draft.breeds[i], color: CONFIG.PLAYER_COLORS[i]};
});
game = new ENGINE.Game({ players: players, seed: 4242});
selectedCat = null;
renderMap._prev = {};
ui.screen = 'game';
$('setup-screen').classList.add('hidden');
$('game-screen').classList.remove('hidden');
// 存档/读档也走一遍
try {
var s = game.serialize();
game = ENGINE.Game.load(s);
} catch (e) {
document.title = 'SMOKE_FAIL save/load: ' + e.message;
return;
}
render._n = 0;
drive();
// fast 模式是同步递归，drive 返回时已终局
if (game.isOver()) {
var rows = game.getScores();
document.title = 'SMOKE_OK rounds=' + game.round + ' winner=' + rows[0].total;
} else {
document.title = 'SMOKE_FAIL not over, phase=' + game.phase;
}
};

UI._game = function () { return game;};
root.CKG_UI = UI;
})(typeof self!== 'undefined'? self: this);
