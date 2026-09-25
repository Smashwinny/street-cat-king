/* 街区猫王 Street Cat King — 全局配置：地块 / 品种 / 事件 / 数值
 * 纯数据，无 DOM 依赖，浏览器与 Node 通用。 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CKG_CONFIG = api;
})(typeof self !== 'undefined' ? self : this, function () {

  // ---- 地块类型 ----
  // forage: {fish, box} 觅食产出；score: 终局占领分；sunTile: 产阳光
  // dangerous: 'dog' 狗窝 / 'road' 马路；occupiable: false 不可占领
  var TILE_TYPES = {
    junkyard: { name: '老垃圾场', icon: '🗑️', neutral: true, forage: { fish: 1 }, score: 0,
                desc: '中立区：觅食得 1 鱼，不可战斗，不可占领' },
    fishstall:{ name: '鱼摊', icon: '🐟', food: true, forage: { fish: 2 }, score: 2,
                desc: '觅食得 2 条鱼' },
    trashbin: { name: '垃圾桶', icon: '🛢️', food: true, forage: { fish: 1 }, score: 2,
                desc: '觅食得 1 条鱼' },
    bakery:   { name: '面包店后巷', icon: '🥖', food: true, forage: { fish: 1, box: 1 }, score: 2,
                desc: '觅食得 1 条鱼 + 1 个纸箱' },
    boxpile:  { name: '纸箱堆', icon: '📦', forage: { box: 1 }, score: 2, nestable: true,
                desc: '捡 1 个纸箱；可花 3 纸箱筑巢' },
    terrace:  { name: '天台', icon: '☀️', sunTile: true, score: 3,
                desc: '晒太阳得 1 阳光' },
    balcony:  { name: '阳台', icon: '🌤️', sunTile: true, score: 3,
                desc: '晒太阳得 1 阳光' },
    doghouse: { name: '狗窝', icon: '🐕', dangerous: 'dog', occupiable: false, score: 0,
                desc: '⚠️ 进入立即受伤并被赶回老垃圾场，不可占领' },
    road:     { name: '车流马路', icon: '🚗', dangerous: 'road', score: 1,
                desc: '⚠️ 进入掷骰：1-3 受伤退回原地，4-6 通过' },
    empty:    { name: '空地', icon: '🌱', score: 1,
                desc: '无产出，自由通行' }
  };

  // 地块堆构成：每轮翻 2 张选 1 张拼、另 1 张弃掉 → 需要 轮数×2 张
  // 12 轮局用 24 张（以下组合 ×2），2 人 10 轮局用 20 张
  var TILE_DECK_BASE = ['fishstall', 'fishstall', 'trashbin', 'trashbin', 'bakery',
                        'boxpile', 'boxpile', 'terrace', 'balcony',
                        'doghouse', 'road', 'empty'];

  // ---- 品种 ----
  var BREEDS = [
    { id: 'orange',  name: '橘猫',   icon: '🍊', title: '干饭魂',
      desc: '觅食时多拿 1 条鱼' },
    { id: 'tabby',   name: '狸花猫', icon: '🐯', title: '街头霸王',
      desc: '战斗掷骰结果 +2' },
    { id: 'ragdoll', name: '布偶猫', icon: '😻', title: '万人迷',
      desc: '白天在鱼摊/面包店可卖萌（1 行动点得 2 鱼）；免疫捕猫队' },
    { id: 'siamese', name: '暹罗猫', icon: '🐱', title: '顺风耳',
      desc: '移动 1 行动点走 2 格；每轮限 1 次免费查看事件牌堆顶' },
    { id: 'black',   name: '黑猫',   icon: '🌚', title: '夜行者',
      desc: '夜晚战斗 +2；免疫流浪狗群' },
    { id: 'cow',     name: '奶牛猫', icon: '🐄', title: '间歇性发疯',
      desc: '每轮限 1 次，花 1 条鱼多拿 1 个行动点' }
  ];

  // ---- 事件卡（12 张：6 白天 / 6 夜晚）----
  var EVENTS = [
    { id: 'goodman',   time: 'day',   name: '好心人投喂', icon: '🧓',
      desc: '本轮所有觅食 +1 条鱼' },
    { id: 'catchers',  time: 'day',   name: '捕猫队巡逻', icon: '🥅',
      desc: '每位玩家掷骰，1-2 则 1 只猫被抓，跳过本轮剩余行动（布偶猫免疫）' },
    { id: 'sunshine',  time: 'day',   name: '午后暖阳',   icon: '🌞',
      desc: '本轮圣地（天台/阳台）产出 +1 阳光' },
    { id: 'dogwalker', time: 'day',   name: '遛狗大妈',   icon: '🐩',
      desc: '战力 8 的恶犬出现在起始玩家指定的一张地块上，逐只与在场猫战斗' },
    { id: 'delivery',  time: 'day',   name: '外卖小哥',   icon: '🛵',
      desc: '本轮面包店后巷觅食额外多拿 1 个纸箱' },
    { id: 'cleanup',   time: 'day',   name: '社区大扫除', icon: '🧹',
      desc: '每位玩家可免费把 1 只猫移回老垃圾场（可跳过）' },
    { id: 'straydogs', time: 'night', name: '流浪狗群',   icon: '🐺',
      desc: '不在巢穴/纸箱堆/老垃圾场的猫掷骰，1-3 受伤（黑猫免疫）' },
    { id: 'rainstorm', time: 'night', name: '暴雨',       icon: '🌧️',
      desc: '本轮移动至多 1 格（暹罗猫也一样），觅食 -1 条鱼（至少 0）' },
    { id: 'catnip',    time: 'night', name: '猫薄荷狂欢', icon: '🌿',
      desc: '每位玩家获得 1 阳光' },
    { id: 'zoomies',   time: 'night', name: '凌晨跑酷',   icon: '💨',
      desc: '本轮每位玩家 +1 行动点' },
    { id: 'darkmoon',  time: 'night', name: '月黑风高',   icon: '🌙',
      desc: '本轮战斗胜者从败者处夺走 1 条鱼（若败者有鱼）' },
    { id: 'darktrap',  time: 'night', name: '捕猫陷阱',   icon: '🪤',
      desc: '起始玩家在一张食物地块放置陷阱：本轮在该地块觅食的猫受伤，且本轮行动结束' }
  ];

  var PLAYER_COLORS = ['#e4572e', '#2e86e4', '#2e9e5b', '#9b59e6'];
  var PLAYER_NAMES = ['一号猫帮', '二号猫帮', '三号猫帮', '四号猫帮'];

  return {
    TILE_TYPES: TILE_TYPES,
    TILE_DECK_BASE: TILE_DECK_BASE,
    BREEDS: BREEDS,
    EVENTS: EVENTS,
    PLAYER_COLORS: PLAYER_COLORS,
    PLAYER_NAMES: PLAYER_NAMES,
    breedById: function (id) {
      for (var i = 0; i < BREEDS.length; i++) if (BREEDS[i].id === id) return BREEDS[i];
      return null;
    },
    eventById: function (id) {
      for (var i = 0; i < EVENTS.length; i++) if (EVENTS[i].id === id) return EVENTS[i];
      return null;
    }
  };
});
