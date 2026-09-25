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

// 是否偏好减少动态：是则全部动效降级为静态
var RM = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

/* ================= WebAudio 合成音效（无音频文件） ================= */
var SFX = {
  ctx: null, muted: false,
  ensure: function () {
    if (!this.ctx) {
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (AC) this.ctx = new AC();
      } catch (e) { this.ctx = null; }
    }
    if (this.ctx && this.ctx.state === 'suspended') { try { this.ctx.resume(); } catch (e) {} }
    return this.ctx;
  },
  tone: function (f, t0, dur, type, vol) {
    var ctx = this.ctx; if (!ctx) return;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.value = f;
    var t = ctx.currentTime + (t0 || 0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.08, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t + dur + 0.05);
  },
  noise: function (dur, vol) {
    var ctx = this.ctx; if (!ctx) return;
    var len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = ctx.createBufferSource(); src.buffer = buf;
    var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 850;
    var g = ctx.createGain(); g.gain.value = vol || 0.12;
    src.connect(f); f.connect(g); g.connect(ctx.destination); src.start();
  },
  play: function (name) {
    if (this.muted || ui.fast) return;
    if (!this.ensure()) return;
    try {
      if (name === 'click') this.tone(680, 0, 0.07, 'triangle', 0.055);
      else if (name === 'move') { this.tone(420, 0, 0.1, 'sine', 0.06); this.tone(640, 0.08, 0.12, 'sine', 0.06); }
      else if (name === 'fight') { this.noise(0.28, 0.13); this.tone(140, 0, 0.2, 'sawtooth', 0.045); }
      else if (name === 'win') { var self = this; [523, 659, 784, 1047].forEach(function (f, i) { self.tone(f, i * 0.11, 0.24, 'triangle', 0.085); }); }
      else if (name === 'meow') this.meow();
    } catch (e) {}
  },
  /* 喵叫：滑音合成，无音频文件 */
  meow: function () {
    var ctx = this.ctx; if (!ctx) return;
    try {
      var t = ctx.currentTime;
      var o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(520, t);
      o.frequency.exponentialRampToValueAtTime(880, t + 0.12);
      o.frequency.exponentialRampToValueAtTime(420, t + 0.34);
      f.type = 'lowpass'; f.frequency.value = 1500;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.085, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
      o.connect(f); f.connect(g); g.connect(ctx.destination);
      o.start(t); o.stop(t + 0.42);
    } catch (e) {}
  }
};

/* ================= 写实猫咪图片资源 ================= */
var CATIMG = {};
['orange', 'tabby', 'ragdoll', 'siamese', 'black', 'cow'].forEach(function (b) {
  CATIMG[b] = { idle: 'assets/cats/' + b + '-idle.webp', action: 'assets/cats/' + b + '-action.webp' };
});
function catImg(breed, action) {
  var e = CATIMG[breed]; if (!e) return '';
  return action ? e.action : e.idle;
}
/* 开局前预加载全部猫图，避免对局中途闪现 */
(function preloadCats() {
  try {
    Object.keys(CATIMG).forEach(function (b) {
      var a = new Image(); a.src = CATIMG[b].idle;
      var c = new Image(); c.src = CATIMG[b].action;
    });
    var sp = new Image(); sp.src = 'assets/cats/splash-hero.webp';
  } catch (e) {}
})();
function swapCatImg(catId, action) {
  try {
    var cat = game.catById(catId); if (!cat) return;
    var img = document.querySelector('.cat[data-cat="' + catId + '"] .cat-img');
    if (img) img.src = catImg(game.players[cat.player].breed, action);
  } catch (e) {}
}
function boingCat(el) {
  if (!el || RM || ui.fast) return;
  el.classList.remove('boing'); void el.offsetWidth; el.classList.add('boing');
  setTimeout(function () { el.classList.remove('boing'); }, 520);
}
/* 悬停猫咪：喵叫（节流） */
var lastMeowAt = 0, lastMeowCat = null;
document.addEventListener('mouseover', function (e) {
  if (ui.fast || RM || !game) return;
  var el = e.target && e.target.closest ? e.target.closest('#map .cat') : null;
  if (!el) return;
  var now = Date.now();
  if (el !== lastMeowCat || now - lastMeowAt > 2600) { lastMeowCat = el; lastMeowAt = now; SFX.play('meow'); }
});
/* 双击自己的猫：抚摸（爱心 + 呼噜），纯表现，不消耗行动点 */
document.addEventListener('dblclick', function (e) {
  if (ui.fast || RM || !game || game.phase !== 'turns') return;
  var el = e.target && e.target.closest ? e.target.closest('.cat.clickable') : null;
  if (!el) return;
  SFX.play('meow');
  el.classList.remove('purr'); void el.offsetWidth; el.classList.add('purr');
  fxEmo('💕', el.dataset.cat);
  setTimeout(function () { el.classList.remove('purr'); }, 1400);
  log('💕 你抚摸了小猫，它发出了呼噜声（不消耗行动点）');
});

/* ================= 特效层 helpers ================= */
function fxLayer() { return $('fx-layer'); }
function fxEl(cls, x, y, html) {
  var layer = fxLayer(); if (!layer) return null;
  var d = document.createElement('div');
  d.className = cls; d.style.left = x + 'px'; d.style.top = y + 'px';
  if (html) d.innerHTML = html;
  layer.appendChild(d);
  return d;
}
function fxLater(el, ms) {
  if (!el) return;
  setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, ms);
}
function fxFloat(txt, x, y) {
  var d = fxEl('float-txt', x - 24, y - 12);
  if (!d) return; d.textContent = txt; fxLater(d, 1250);
}
function fxDust(x, y) {
  for (var i = 0; i < 5; i++) {
    (function () {
      var d = fxEl('dust', x - 5 + (Math.random() * 34 - 17), y - 6);
      if (!d) return;
      d.style.setProperty('--dx', (Math.random() * 76 - 38) + 'px');
      fxLater(d, 760);
    })();
  }
}
function fxRing(x, y) {
  var d = fxEl('ringfx', x, y);
  if (!d) return; d.style.width = d.style.height = '76px'; fxLater(d, 1050);
}
function fxClaws(x, y) {
  var d = fxEl('claws', x - 48, y - 48, '<span></span><span></span><span></span>');
  fxLater(d, 950);
}
function fxEmo(emo, catId) {
  var el = document.querySelector('.cat[data-cat="' + catId + '"]');
  if (!el) return;
  var r = el.getBoundingClientRect();
  var d = fxEl('emofx', r.left + r.width / 2 - 12, r.top - 30);
  if (!d) return; d.textContent = emo; fxLater(d, 1950);
}
function fxDice(x, y) {
  var d = fxEl('dicefx', x - 18, y - 64);
  if (!d) return; d.textContent = '🎲'; fxLater(d, 1000);
}
function fxConfetti(modal) {
  if (!modal) return;
  var colors = ['#ffd98a', '#ff8a5c', '#7fd4a8', '#8ab8ff', '#f5ead3'];
  for (var i = 0; i < 36; i++) {
    (function (i) {
      var c = document.createElement('div');
      c.className = 'confetti';
      c.style.left = (Math.random() * 100) + '%';
      c.style.background = colors[i % colors.length];
      c.style.animationDuration = (1.7 + Math.random() * 1.7) + 's';
      c.style.animationDelay = (Math.random() * 0.9) + 's';
      modal.appendChild(c);
      fxLater(c, 4400);
    })(i);
  }
}
function catCenter(catId) {
  var el = document.querySelector('.cat[data-cat="' + catId + '"]');
  if (!el) return null;
  var r = el.getBoundingClientRect();
  return { el: el, x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
function tileCenter(tileId) {
  var t = document.querySelector('.tile[data-tile="' + tileId + '"]');
  if (!t) return null;
  var r = t.getBoundingClientRect();
  return { el: t, x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/* 行动后特效：移动跳跃 FLIP / 战斗爪击 / 飘字 / 光环 */
function afterActionFX(act, pre) {
  try {
    SFX.play(act.kind === 'fight' ? 'fight' : act.kind === 'move' ? 'move' : 'click');
    /* 移动 / 战斗时换腾跃动作图，结束后换回坐姿图 */
    if ((act.kind === 'move' || act.kind === 'fight') && act.cat) {
      swapCatImg(act.cat, true);
      setTimeout(function () { swapCatImg(act.cat, false); }, act.kind === 'fight' ? 780 : 640);
    }
    if (act.kind === 'move' && pre) {
      var now = catCenter(act.cat);
      if (now && now.el.animate) {
        var dx = pre.x - now.x, dy = pre.y - now.y;
        now.el.animate([
          { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(1,1)', offset: 0 },
          { transform: 'translate(' + (dx / 2) + 'px,' + (dy / 2 - 36) + 'px) scale(1.14,0.9)', offset: 0.45 },
          { transform: 'translate(0px,0px) scale(1.2,0.8)', offset: 0.8 },
          { transform: 'translate(0px,0px) scale(1,1)', offset: 1 }
        ], { duration: 520, easing: 'cubic-bezier(.3,.7,.4,1)' });
        fxDust(now.x, now.y + 12);
      }
    } else if (act.kind === 'fight' && pre && pre.dtile != null) {
      var tc = tileCenter(pre.dtile);
      if (tc) {
        fxClaws(tc.x, tc.y);
        fxDice(tc.x, tc.y);
        if (tc.el.animate) {
          tc.el.animate([
            { transform: 'translate(0,0)' }, { transform: 'translate(-8px,2px)' },
            { transform: 'translate(7px,-2px)' }, { transform: 'translate(-4px,0)' },
            { transform: 'translate(0,0)' }
          ], { duration: 400 });
        }
      }
      // 胜者前扑，败者抖动灰度
      var atk = game.catById(act.cat);
      var won = atk && atk.tile === pre.dtile;
      var atkNow = catCenter(act.cat);
      if (atkNow && atkNow.el.animate) {
        if (won) {
          atkNow.el.animate([
            { transform: 'translate(-30px,8px) scale(1.4)', offset: 0 },
            { transform: 'translate(0,0) scale(1)', offset: 1 }
          ], { duration: 300, easing: 'ease-out' });
        } else {
          atkNow.el.classList.add('hurt');
          setTimeout(function () { atkNow.el.classList.remove('hurt'); }, 650);
        }
      }
      if (act.target) {
        var defNow = catCenter(act.target);
        if (defNow && !won) {
          defNow.el.animate([
            { transform: 'translate(26px,-6px) scale(1.35)', offset: 0 },
            { transform: 'translate(0,0) scale(1)', offset: 1 }
          ], { duration: 300, easing: 'ease-out' });
        }
      }
    } else if (act.kind === 'rest') {
      fxEmo('💤', act.cat);
    } else if (act.kind === 'meow') {
      fxEmo('💕', act.cat);
    } else if (act.kind === 'occupy' || act.kind === 'nest') {
      var c = act.cat ? catCenter(act.cat) : null;
      if (c) fxRing(c.x, c.y);
      var cat = act.cat ? game.catById(act.cat) : null;
      if (cat) { var t2 = tileCenter(cat.tile); if (t2) fxFloat(act.kind === 'nest' ? '🪹 筑巢!' : '📍 占领!', t2.x, t2.y - 30); }
    } else if (act.kind === 'forage' && pre) {
      var ft = game.tileById(pre.tile);
      var ftxt = (ft && ft.type === 'boxpile') ? '+1📦' : '+2🐟';
      fxFloat(ftxt, pre.x, pre.y - 26);
    } else if (act.kind === 'sun' && pre) {
      fxFloat('+1☀️', pre.x, pre.y - 26);
    } else if (act.kind === 'mad') {
      fxFloat('+1⚡', pre ? pre.x : 0, pre ? pre.y - 26 : 0);
    }
  } catch (e) {}
}

/* 萤火虫环境粒子 */
function initFireflies() {
  if (RM || ui.fast) return;
  var layer = fxLayer(); if (!layer || layer.dataset.ff) return;
  layer.dataset.ff = '1';
  for (var i = 0; i < 24; i++) {
    var f = document.createElement('div');
    f.className = 'firefly';
    var s = 4 + Math.random() * 5;
    f.style.width = f.style.height = s + 'px';
    f.style.left = (Math.random() * 100) + 'vw';
    f.style.top = (38 + Math.random() * 58) + 'vh';
    f.style.setProperty('--fx', (Math.random() * 170 - 85) + 'px');
    f.style.setProperty('--fy', (-70 - Math.random() * 150) + 'px');
    f.style.animationDuration = (9 + Math.random() * 9) + 's';
    f.style.animationDelay = (-Math.random() * 14) + 's';
    layer.appendChild(f);
  }
}

/* 待机随机小动作：耳朵抖 / 眨眼 */
var idleTimer = null;
function startIdle() {
  stopIdle();
  if (RM || ui.fast) return;
  /* 环境小动作：每 4~6 秒随机一只猫伸懒腰 / 舔毛 / 环顾 */
  function tick() {
    idleTimer = setTimeout(function () {
      try {
        if (ui.screen === 'game' && !document.hidden) {
          var cats = document.querySelectorAll('#map .cat');
          if (cats.length) {
            var c = cats[Math.floor(Math.random() * cats.length)];
            var acts = ['stretch', 'groom', 'look'];
            var a = acts[Math.floor(Math.random() * acts.length)];
            if (!c.classList.contains('sel') && !c.classList.contains('debut') &&
                !c.classList.contains('hurt') && !c.classList.contains('boing')) {
              c.classList.add(a);
              (function (el, cls) { setTimeout(function () { el.classList.remove(cls); }, 1350); })(c, a);
            }
          }
        }
      } catch (e) {}
      tick();
    }, 4000 + Math.random() * 2200);
  }
  tick();
}
function stopIdle() { if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; } }

/* 卡片 3D tilt（桌面 mousemove；移动端用点击态） */
var tiltBound = false;
function enableTilt() {
  if (tiltBound || RM) return;
  /* 移动端关掉 tilt，保留浮动与换图 */
  if (window.matchMedia && !window.matchMedia('(pointer: fine)').matches) return;
  tiltBound = true;
  document.addEventListener('mousemove', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('.breed-card,.tile-pick') : null;
    if (!el) return;
    if (!el.dataset.tilt) {
      el.dataset.tilt = '1'; el.classList.add('tilt3d');
      el.addEventListener('mouseleave', function () { el.style.transform = ''; });
    }
    var r = el.getBoundingClientRect();
    if (!r.width) return;
    var px = (e.clientX - r.left) / r.width - 0.5;
    var py = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = 'perspective(750px) rotateX(' + (-py * 10).toFixed(2) +
      'deg) rotateY(' + (px * 12).toFixed(2) + 'deg) translateZ(6px)';
  });
}

/* 开屏 */
var splashBound = false;
function initSplash() {
  var sp = $('splash'); if (!sp) return;
  if (ui.fast || RM || window.__SMOKE__ || splashBound) {
    if (!splashBound) { sp.style.display = 'none'; }
    return;
  }
  splashBound = true;
  $('enter-btn').addEventListener('click', function () {
    SFX.ensure(); SFX.play('click');
    sp.classList.add('hide');
    setTimeout(function () { sp.style.display = 'none'; }, 550);
  });
}

/* 回合电影黑条横幅 */
function maybeBanner() {
  if (ui.fast || RM || !game) return;
  var key = game.round + '|' + (game.isDay() ? 'd' : 'n') + '|' + game.phase;
  if (ui._bannerKey === key) return;
  var first = (ui._bannerKey === undefined);
  ui._bannerKey = key;
  if (first) return;
  var b = $('banner'); if (!b) return;
  $('banner-text').textContent = '第 ' + game.round + ' 天 · ' + (game.isDay() ? '☀️ 白天' : '🌙 夜晚');
  b.classList.remove('hidden');
  requestAnimationFrame(function () { b.classList.add('show'); });
  setTimeout(function () {
    b.classList.remove('show');
    setTimeout(function () { b.classList.add('hidden'); }, 420);
  }, 1250);
}
/* 昼夜转场 */
function maybeDayNight() {
  if (ui.fast || RM || !game) return;
  var d = game.isDay() ? 'd' : 'n';
  if (ui._dnKey === undefined) { ui._dnKey = d; return; }
  if (ui._dnKey === d) return;
  ui._dnKey = d;
  var o = $('daynight'); if (!o) return;
  $('daynight-icon').textContent = d === 'd' ? '☀️' : '🌙';
  o.className = d === 'd' ? 'to-day play' : 'to-night play';
  void o.offsetWidth;
  setTimeout(function () { o.className = 'hidden'; }, 1200);
}
/* 回合开始：当前行动猫登场弹跳 */
function maybeDebut() {
  if (ui.fast || RM || !game || game.phase !== 'turns') return;
  var key = game.round + '-' + game.current;
  if (ui._debutKey === key) return;
  ui._debutKey = key;
  if (game.players[game.current].type !== 'human') return;
  game.players[game.current].cats.forEach(function (c) {
    var el = document.querySelector('.cat[data-cat="' + c.id + '"]');
    if (el && !el.classList.contains('debut')) {
      el.classList.add('debut');
      setTimeout(function () { el.classList.remove('debut'); }, 700);
    }
  });
}

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
stopIdle();
renderSetup();
$('game-screen').classList.add('hidden');
$('setup-screen').classList.remove('hidden');
ui.screen = 'setup';
// 立体版氛围初始化
initSplash(); initFireflies(); startIdle(); enableTilt();
};

function renderSetup() {
var n = ui.playerCount || 3;
ui.playerCount = n;
if (!ui.setupPlayers || ui.setupPlayers.length!== n) {
ui.setupPlayers = [];
for (var i = 0; i < n; i++) ui.setupPlayers.push({ name: CONFIG.PLAYER_NAMES[i], type: i === 0? 'human': 'ai'});
}
var h = '<div class="setup-card"><div class="setup-hero">' +
'<div class="cats-row"><img src="' + catImg('orange') + '" alt="橘猫"><img src="' + catImg('black') + '" alt="黑猫"><img src="' + catImg('cow') + '" alt="奶牛猫"></div><h1>街区猫王</h1>' +
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
'<div class="breed-top"><div class="bicon"><img src="' + catImg(b.id) + '" alt="' + esc(b.name) + '"></div>' +
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
ui._bannerKey = undefined; ui._dnKey = undefined; ui._debutKey = undefined;
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
if (!ui.fast) toast('💡 点选你的猫咪，再点发金光的格子就能走；先占领 🐟鱼摊 攒鱼吧！');
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
var act = a || { kind: 'pass'};
// 动作前记录棋子/地块位置，供特效做 FLIP
var pre = null;
if (!ui.fast &&!RM && act.cat) {
var cc = catCenter(act.cat);
var cat = game.catById(act.cat);
if (cc && cat) pre = { x: cc.x, y: cc.y, tile: cat.tile };
if (act.kind === 'fight' && act.target) {
var def = game.catById(act.target);
if (def) pre.dtile = def.tile;
}
}
var r = game.doAction(act);
if (!r.ok) { log('⚠️ ' + r.msg);}
if (selectedCat &&!game.catById(selectedCat)) selectedCat = null;
drive();
if (!ui.fast &&!RM) afterActionFX(act, pre);
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
// 电影包装：回合横幅 / 昼夜转场 / 登场弹跳
maybeBanner(); maybeDayNight(); maybeDebut();
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
'<button id="btn-sound">' + (SFX.muted? '🔇 静音': '🔊 音效') + '</button>' +
'<button id="btn-save">💾 存档</button>' +
'<button id="btn-load">📂 读档</button>' +
'<button id="btn-help">❓ 帮助</button>' +
'<button id="btn-restart">🔄 重开</button></div>';
$('topbar').innerHTML = h;
$('btn-sound').onclick = function () {
SFX.muted =!SFX.muted;
if (!SFX.muted) { SFX.ensure(); SFX.play('click');}
renderTopbar();
};
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
return '<div class="cat breed-' + pl.breed + sel + clickable + '" data-cat="' + c.id + '" data-pname="' + esc(pl.name) + '" ' +
'title="' + esc(pl.name) + ' 的' + br.name + (c.injured? '（受伤×' + c.injured + '）': '') + '"' +
' style="border-color:' + pl.color + '"><img class="cat-img" src="' + catImg(pl.breed) + '" alt="' + esc(br.name) + '" draggable="false">' +
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
var cid = catEl.dataset.cat;
selectedCat = cid;
SFX.play('meow');
renderMap(); renderActionPanel();
var nel = document.querySelector('.cat[data-cat="' + cid + '"]');
boingCat(nel);
return;
}
// 点别人家的猫：弹跳 + 喵叫，纯互动
var anyCat = e.target.closest('.cat');
if (anyCat && game && game.phase === 'turns' && !ui.fast) {
SFX.play('meow');
boingCat(anyCat);
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

// 待机小动作结束后自动摘掉 class，恢复呼吸循环
document.addEventListener('animationend', function (e) {
var t = e.target;
if (t && t.classList && (t.classList.contains('twitch') || t.classList.contains('blink'))) {
t.classList.remove('twitch'); t.classList.remove('blink');
}
});

function pickCell(x, y) {
ui.pickMode = null;
SFX.play('click');
game.resolvePending({ x: x, y: y});
drive();
}

function pickTileOnMap(tileId) {
ui.pickMode = null; ui.pickSub = null;
SFX.play('click');
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
'<div class="p-head"><div class="p-avatar breed-' + p.breed + '" style="border-color:' + p.color + '"><img src="' + catImg(p.breed) + '" alt="' + esc(br.name) + '"></div>' +
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
h += '<div class="ap-tip">💡 点选你的猫咪，发金光的格子可直接点过去；先占领 🐟鱼摊 攒鱼！</div>';
}
if (selectedCat) {
var cat = game.catById(selectedCat);
var t = game.tileById(cat.tile);
var tt = CONFIG.TILE_TYPES[t.type];
h += '<div class="ap-catsel">🐾 选中：' + br.icon + ' 位于 ' + tt.icon + tt.name +
(cat.injured? ' 🩹×' + cat.injured: '') +
(cat.trapped? ' 🥅被抓': '') +
'<br><span class="hint">点地图上的其他猫可切换 · 金光格子点格即走</span></div>';
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
'<div class="p-avatar breed-' + game.players[r.player].breed + '" style="border-color:' + r.color + '"><img src="' + catImg(game.players[r.player].breed) + '" alt="' + esc(br.name) + '"></div>' +
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
// 胜利包装：冠军欢呼 + 彩带 + 胜利音
SFX.play('win');
if (!RM &&!ui.fast) {
var champ = document.querySelector('#modal-root .pod.first .p-avatar');
if (champ) champ.classList.add('cheer');
var modal = document.querySelector('#modal-root .modal');
if (modal) fxConfetti(modal);
}
}

function showHelp() {
showModal('<div class="ev-art">❓</div><h3>玩法速查</h3><div class="help">' +
'<p>🐾 <b>目标</b>：12 天（2 人局 10 天）后地盘总分最高者成为街区猫王。</p>' +
'<p>🗺️ <b>每轮</b>：翻事件 → 起始玩家拼 1 张地块 → 每人 2 行动点（点自己的猫，再点行动按钮；发金光的格子可直接点过去）。</p>' +
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
