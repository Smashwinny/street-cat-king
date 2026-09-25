# 🐱 街区猫王 Street Cat King（网页单机版）

两只流浪猫到四只流浪猫的街区领地争夺桌游，网页单机版：**本地多人轮流 + AI 对手**，纯前端、零构建、零依赖，可直接部署到 GitHub Pages。

## 玩法速览

- 2–4 名玩家扮演不同品种的流浪猫（橘猫 / 狸花猫 / 布偶猫 / 暹罗猫 / 黑猫 / 奶牛猫，各有特殊能力）
- 每轮：翻 1 张昼夜事件 → 起始玩家拼 1 张街区地块 → 每人 2 行动点（移动 / 占领 / 觅食 / 晒太阳 / 战斗 / 筑巢 / 休息 / 卖萌）
- 2 人局 10 天、3–4 人局 12 天后结算：地盘分 + 巢穴分 + 连片奖励 + 鱼/阳光折分 + 称号，最高分成为街区猫王

## 本地运行

直接用浏览器打开 `index.html` 即可（建议用本地服务器避免 file 协议限制）：

```bash
cd street-cat-king
python3 -m http.server 8000
# 浏览器访问 http://localhost:8000
```

## 部署到 GitHub Pages

1. 把本目录全部文件推送到 GitHub 仓库根目录
2. 仓库 Settings → Pages → Source 选择 `Deploy from a branch`，分支选 `main`、目录 `/ (root)`
3. 等待 1–2 分钟，用 `https://<用户名>.github.io/<仓库名>/` 访问

## 文件结构

```text
street-cat-king/
├── index.html          # 入口页面
├── css/style.css       # 猫咪暖色 UI
├── js/
│   ├── config.js       # 地块 / 品种 / 事件 / 颜色等配置（浏览器+Node 通用，UMD）
│   ├── engine.js       # 游戏引擎：规则、回合、战斗、事件、计分、存档（零 DOM 依赖）
│   ├── ai.js           # AI 对手：启发式行动 / 拼图 / 事件选择 / 品种轮选（零 DOM 依赖）
│   └── ui.js           # 界面：设置、轮选、地图、行动面板、事件弹窗、日志、存档读档
└── tools/
    └── simulate.js     # Node 自动对战压测：node tools/simulate.js [局数]
```

存档保存在浏览器 `localStorage`（键 `ckg_save`），同一设备/浏览器可读档续玩。

## 开发测试

```bash
node --check js/config.js && node --check js/engine.js && node --check js/ai.js && node --check js/ui.js
node tools/simulate.js 8        # 8 局自动对战，应全部正常终局
```

`engine.js / ai.js / config.js` 零 DOM 依赖，可在 Node 里直接引用做测试；
`ui.js` 冒烟测试见 `~/workspace/smoketest/smoke.js`（jsdom：设置界面 → 品种轮选 →
2/3/4 人完整对局 → 终局结算；另有全 DOM 点击模式覆盖事件弹窗与地图拼放）。

## 规则简化与取舍（相对 v1.0 纸质规则）

- 纸质规则列出 12 张待拼地块，但每轮"翻 2 选 1、另 1 张弃掉"，12 轮需要 24 张牌：
  实现中把 12 张基础构成复制为 24 张牌堆（2 人局 20 张）。
- 资源 token（鱼/纸箱/阳光/爪印）不设全局数量上限，按无限资源池处理。
- 多只猫（无论敌我）可共处一格；战斗时逐只指定目标。
- 存档保存随机种子而非完整 RNG 状态：读档后续随机序列与存档前不完全一致，
  不影响规则正确性。
- 战斗夺地：胜者夺取败者占领地（含防守方胜利）；爪印按"败者爪印回供应、胜者消耗 1 个"处理。
- 暂不支持：真实网络联机、账号系统、跨设备同步存档。
