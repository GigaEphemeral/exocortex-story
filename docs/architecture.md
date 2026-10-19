# 架构与模块契约

本项目是一个**零构建、零运行时依赖**的静态单页（原生 ES Module + Three.js）。
所有视觉内容由程序化几何体与粒子实时生成，不使用图片/视频冒充 3D 对象。

> 需求来源：仓库根目录 [memory_animation.md](../memory_animation.md)。
> 本文件是模块边界与接口的唯一契约；改接口必须先改这里。

## 1. 目录结构（按领域划分）

```
index.html                  入口 DOM（HUD / 3D 舞台 / 研究卡片 / 导航）
src/
  main.js                   应用装配：能力检测 → 降级判断 → 场景 + UI + 状态机 + 主循环
  config/                   内容层（唯一真值，纯数据，不 import three）
    chapters.js             14 个内容单元 chapterConfig
    research.js             10 个学术阶段 researchData（verifiedUrl 全部为 null）
    sceneStates.js          扁平场景状态表（sceneFrom / sceneTo 引用）
    cameraStates.js         扁平摄像机状态表（cameraFrom / cameraTo 引用）
  core/                     状态与输入层（无 DOM 依赖优先，便于测试）
    chapterMachine.js       chapterIndex / chapterProgress 状态机（唯一真值）
    scrollController.js     滚轮 / 触摸 / 键盘的步进与防连跳
    capabilities.js         WebGL 检测、设备档位、像素比、prefers-reduced-motion
    easing.js               缓动函数表
    rng.js                  固定种子随机数（正反向动画一致）
    performance.js          FPS 采样与一次性降级
  three/                    3D 场景层（只依赖 three + config 数据形状）
    three.js                Three.js 加载器（本地 vendor 优先，CDN 回退）
    createScene.js          场景装配与 SceneController（对外唯一入口）
    ...                     人物 / 书桌 / 书 / 电脑 / 粒子 / 网络 / 大脑 / 资源表
  ui/                       界面层（只依赖 DOM + config 数据）
    createUI.js             HUD、研究卡片、导航、提示、进度
    renderResearchCard.js   研究卡片渲染（卡片与 2D 降级共用）
    fallback2d.js           WebGL 不可用时的 2D 图文降级
  styles/main.css           全部样式（电影感科技风、响应式、打印/降级样式）
scripts/                    零依赖工具：本地预览、vendor、配置校验、状态机测试
docs/architecture.md        本契约
```

## 2. 叙事状态模型（先读这一节）

14 个内容单元固定顺序：10 个 `research` + 4 个 `camera`。相邻单元的视觉状态首尾相接：

```
idle → reading → reading → encoding → clusters → concepts → concepts → screen
     → retrieval → replay → conflict → archive → networkWide → brainSeed → brain
```

- `chapterIndex`：当前内容单元，**唯一真值**，决定右侧显示哪张卡片。
- `chapterProgress`（0–1）：当前单元从 `sceneFrom` 到 `sceneTo` 的插值进度。
- 已停留状态 = `(chapterIndex, progress=1)`，画面是该单元的 `sceneTo`。

**正向推进**：先把 `chapterIndex` 设为 next，再让 progress 从 0 → 1。
因为 `sceneFrom(next) === sceneTo(current)`，第一帧与上一状态完全重合，不会跳变。

**反向返回**：保持 `chapterIndex` 不变，让 progress 从 1 → 0（沿同一插值路径退回），
到达 0 后再把 `chapterIndex` 减一、progress 置 1。视觉收尾处
`sceneFrom(current) === sceneTo(previous)`，同样连续。

因此任意一帧的画面只由 `(chapterIndex, chapterProgress)` 决定，是**纯函数**：
不依赖上一帧、不依赖滚动方向，正反向走同一条路径。

`storyProgress = (chapterIndex + chapterProgress) / 14`，只用于顶部进度展示，
不参与卡片索引计算。

## 3. 模块契约

### 3.1 config（纯数据，禁止 import three / import DOM 代码）

- `chapters`：14 项，字段 `id / type / stage / title / description / sceneFrom / sceneTo /
  cameraFrom / cameraTo / duration / easing / researchId / visualNote / showResearchCard / scrollHint`。
- `researchData`：10 项，字段 `stage / title / question / brain[] / ai[] / diff / tags[] /
  papers[] / open`；每条 paper 为 `{ authors, year, title, venue, note, verifiedUrl }`，
  **`verifiedUrl` 必须为 null**，渲染层不得生成链接。
- `sceneStates`：键固定为 `sceneStateKeys`，全部扁平标量 + `layout` 字符串。
- `cameraStates`：`{ position: [x,y,z], target: [x,y,z], fov }`（只读数组）。

### 3.2 core

```js
// chapterMachine.js
createChapterMachine({ chapters, reducedMotion }) => {
  getState(),                                  // { chapterIndex, chapterProgress, phase,
                                               //   isTransitioning, pendingDirection, storyProgress }
  requestStep(direction, { queue = false }),   // -1 | 1；返回是否立即开始
  requestJump(targetIndex),                    // 章节导航点显式跳转
  tick(dtSeconds),                             // 由 rAF 主循环驱动
  setReducedMotion(boolean),
}

// scrollController.js
createScrollController({ onStep, isBusy, canScrollCard, panelElement }) => { dispose() }
// onStep(direction, source) => boolean：true 表示已接受一次章节切换
// 规则：一次输入最多启动一次切换；过渡中忽略滚轮/触摸；单个待执行方向由状态机负责；
//       滚轮累计阈值 + 方向翻转重置 + 过渡结束后的短暂尾部锁；卡片可滚动时滚轮优先给卡片。

// capabilities.js
isWebGLAvailable(), detectProfile(), prefersReducedMotion(), onReducedMotionChange(cb)

// performance.js
createPerformanceGuard({ targetFps, onDegrade }) => { sample(dt), resetWindow(), isDegraded() }
```

### 3.3 three（3D 场景层）

```js
// createScene.js —— 对外唯一入口
export function createScene({ canvas, profile, reducedMotion, onContextLost }) => SceneController

SceneController = {
  applyFrame(frame),   // 每帧调用；禁止分配新对象/数组
  render(),
  degrade(),           // 一次性降级：降低像素比 + 关闭阴影（不回升）
  dispose(),           // 显式释放全部 geometry / material / texture / renderer
}
```

`frame = { from, to, t, cameraFrom, cameraTo, elapsed }`：
- `from / to`：`sceneStates` 中的扁平状态对象；
- `t`：0–1 的插值进度（已缓动）；
- `cameraFrom / cameraTo`：`cameraStates` 中的对象；
- `elapsed`：秒，用于呼吸/微光等环境动画。

**场景层必须满足的硬约束**
1. 只有一套持久化粒子缓冲：`Float32Array(particleCount * 3)`，初始化时按
   `profile.particleCount` 一次确定，运行时不增删、不重建 Points/BufferGeometry。
2. `applyFrame` 只改写已有缓冲区（位置、强度、连线端点、材质参数、摄像机）；
   不得 new Vector3 / new Array / dispose+create。临时向量在初始化时预分配。
3. 布局切换只改变目标缓冲：每帧 `lerp(layout(from), layout(to), t)` 写入活动缓冲；
   布局按固定种子确定性生成，正反向结果一致。
4. 粒子身份稳定：同一索引在不同阶段仍是同一颗粒子；颜色语义最多两类
   （概念=冷蓝、来源/证据=淡琥珀），关系用连线表达。
5. 连线是一套持久化 `LineSegments`，端点引用粒子索引，随粒子同步移动；
   `linkOpacity` / `linkWidth` 只调材质参数，不重建几何。
6. 资源统一登记（resource registry），`dispose()` 批量释放；`degrade()` 可重复调用无副作用。
7. 人物、书桌、书籍、电脑、粒子、网络、大脑共用同一个 Scene / Camera / Renderer，
   不通过销毁重建场景伪造连续变形。

```js
// three.js —— Three.js 加载器（顶层 await）
export const THREE = await import(本地 vendor 或 CDN 的 three.module.js);
export const threeSource = 'vendor' | 'cdn';
```
本地 `vendor/three.module.js` 由 `npm run vendor` 生成且被 .gitignore 忽略；
不存在时回退到 `https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js`。
加载失败会 reject，由 main.js 捕获并进入 2D 降级。

**世界坐标锚点（场景层按此摆放，摄像机/构图依赖它）**

| 对象 | 位置 / 尺寸 |
| --- | --- |
| 书桌台面 | 顶面 y=0.74，中心 (0, 0, 0)，约 1.8 × 0.06 × 0.9 |
| 人物 | 坐在桌前 z≈1.05，面向 -z，头部中心约 (0, 1.36, 1.0) |
| 打开的书 | 中心 (-0.28, 0.78, 0.33)，书页沿 x∈[-0.52,-0.04]、z∈[0.12,0.54] |
| 笔记本电脑 | 屏幕中心 (0.62, 1.02, 0.08)，朝向人物，键盘在桌面 y≈0.78 |
| 知识网络（wide） | x∈[-1.7,1.7]、y∈[0.5,2.3]、z∈[-0.4,1.4] |
| 归档区 | 约 (-1.35, 0.55–1.05, 0.1–0.7) |
| 数字大脑 | 中心 (0, 1.55, 0.8)，半径约 (0.72, 0.58, 0.82) |

**粒子布局名**（`layout` 字段取值，必须有语义差异，不得随机重生）：
`bookPage`（书页上）、`lifted`（浮起）、`clusters`（局部簇）、`concepts`（分层概念网络）、
`screen`（汇入屏幕）、`retrieval`（查询激活）、`replay`（离线重放）、`conflict`（矛盾节点）、
`archive`（弱化与归档）、`networkWide`（完整网络）、`brainSeed`（向脑形收拢）、
`brain`（蓝色电子点大脑：左右半球、纵裂、脑回起伏，禁止光滑椭球）。

### 3.4 ui（界面层）

```js
createUI({ chapters, research, onStep, onJump }) => {
  showChapter(index),   // 更新标签/卡片/词云/导航/提示；只在 index 变化时调用
  setProgress(ratio),   // 每帧调用；内部按 0.2% 节流写 DOM
  setLocked(locked),    // 可选：过渡态视觉（不阻止按钮点击，按钮由状态机排队）
  canScrollCard(direction, eventTarget), // 滚轮/触摸是否应优先滚动卡片
  setNotice(message | null),
  dispose(),
}

mountFallback({ chapters, research, reason }) => { dispose() }  // 2D 降级完整视图
```

UI 必须实现（需求 3、4、6、8 章）：
- 顶部：项目标题、`研究阶段 · 03 / 14` 或 `视觉过渡 · 02 / 14`、整体进度条、当前章节标题。
- 右侧研究卡片顺序：阶段标题 → 一句话概述 → 核心问题 → 人脑机制/AI 工程对照（折叠）
  → 关键差异（常驻）→ 学科标签词云（折叠）→ 论文列表（折叠）→ 待研究问题（常驻）。
- 词云 ≤8 个关键词、3 个字号层级（1 / 2 / 5）；移动端改为 3 个标签 + “更多关键词”。
- 论文 `verifiedUrl === null` 时只渲染纯文本，**不生成 `<a>`**。
- 卡片内部独立滚动：`#panel-scroll` 可滚，滚轮/触摸在卡片仍有滚动空间时优先卡片。
- 下方提示按需求 4.4：首章 / 中间 / 末章、桌面与移动端文案不同，轻微动画、不闪烁。
- 运镜章节：显示“视觉过渡”标签 + `visualNote`，不新增学术卡片。
- 导航：上一章/下一章按钮、14 个章节点（点击 `onJump(index)`），支持键盘焦点。
- 2D 降级：静态示意图（内联 SVG）+ 全部研究卡片 + 进度 + 导航，无 WebGL 依赖。
- 可访问性：语义结构、`aria-live` 适度使用、对比度足够、`prefers-reduced-motion` 下
  关闭装饰性动画；不依赖颜色作为唯一信息渠道。
- 样式为深黑/深蓝电影感，人脑暖白、数字侧冷蓝；避免彩虹色、过量霓虹与闪烁。

### 3.5 main.js（装配层）

1. 先做能力检测与降级判断，**之后**才动态 `import('./three/createScene.js')`（Three.js 在被
   import 时加载）。WebGL 不可用或动态 import 失败 → `mountFallback`，页面不得空白。
2. 创建场景 → 创建 UI → 创建状态机/滚动控制器 → 启动单一 rAF 主循环。
3. 每帧：`machine.tick(dt)` → 取 state → 解析 from/to/camera → `scene.applyFrame` →
   `scene.render()` → `ui.setProgress`；只有章节变化才 `ui.showChapter`。
4. 窗口尺寸、可见性、失焦：重置输入累计与时间步长，状态机不得失控。
5. 性能：连续 3 秒低于目标 FPS 的 80% 触发**一次** `scene.degrade()`，之后不再回升。

## 4. 性能红线（全部实现必须遵守）

- 渲染循环/滚动事件内：不创建 geometry/material/texture，不重建粒子。
- 桌面粒子 ≤5000、移动端 ≤800，初始化一次确定；像素比桌面 ≤2、移动 ≤1.5、低端 1.0。
- 移动端关闭阴影与后处理；桌面端投射阴影光源 ≤2。
- 页面隐藏时暂停 rAF 工作；恢复时重置时间步长，避免大 dt。
- 控制台不得持续报错或每帧打印调试信息。
- 相同 `(chapterIndex, chapterProgress)` 必须得到相同视觉结果；反向滚动沿原路径返回。

## 5. 文本与科学边界

- 只使用 `src/config/research.js` 中已有文案，不添加未经验证的强因果表述。
- 明确区分：生物学机制 / 工程类比 / 实证研究 / 理论假设 / 待验证问题。
- 视觉大脑是概念表达；不得暗示 AI 已拥有与人脑相同的记忆、意识或主观体验。

## 6. 文件所有权（并行开发时互不越界）

| 范围 | 所有者 |
| --- | --- |
| `src/three/**` | 3D 场景实现 |
| `src/ui/**`、`src/styles/main.css` | 界面实现 |
| `index.html`、`src/config/**`、`src/core/**`、`src/main.js`、`scripts/**`、`docs/**`、`README.md` | Lead |

## 7. 验证

```bash
npm run validate   # 配置完整性 + 状态链连续性 + 论文链接红线
npm test           # validate + 状态机正反向/防连跳测试
npm start          # http://127.0.0.1:5173/
npm run vendor     # 可选：下载 Three.js 到 vendor/，离线可用
```

浏览器验收：快速上下滚动 20 次粒子不跳变；14 单元逐格推进、一次滚动不跳过多个章节；
反向返回沿同一路径；卡片内部滚动与章节切换不冲突；移动端布局可用；
WebGL 不可用时 2D 降级完整；`prefers-reduced-motion` 生效。
