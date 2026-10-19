# 从人类记忆到数字大脑

人脑知识体系与 AI 外置知识库的**滚动驱动连续 3D 叙事单页**。

一条连续的视觉演化链：人物阅读 → 文字浮起为粒子 → 局部记忆簇 → 概念网络 → 汇入电脑 → 检索激活 → 离线重放 → 冲突再巩固 → 筛选遗忘 → 完整知识网络 → 蓝色电子点大脑。
页面可用鼠标滚轮 / 触控板 / 键盘 / 触屏逐格推进与回溯，右侧同步显示十阶段研究卡片。

- 纯静态项目：原生 ES Module + Three.js，**无构建步骤、无 npm 运行时依赖**。
- 全部 3D 内容为程序化几何 / Shader / 持久化粒子缓冲，不使用图片或视频冒充 3D 对象。
- 默认优先从本地 `vendor/` 加载 Three.js，可在完全离线环境运行；缺失时回退 CDN。

> 需求与内容依据：[docs/architecture.md](docs/architecture.md)（模块契约）与仓库根目录的 [memory_animation.md](memory_animation.md)（原始需求）。

## 快速开始

需要 Node.js ≥ 18（仅用于本地静态服务器与校验脚本）。

```bash
npm start                    # 启动本地预览：http://127.0.0.1:5173/
npm start -- --port 5555     # 指定端口（npm 官方推荐写法）
npm start --port 5555        # 也兼容这种写法（npm 会提示参数告警，但端口生效）
node scripts/serve.mjs 5555  # 直接调用脚本
```

端口被占用时会给出明确提示并退出，不会抛未捕获异常。

首次离线使用时可把固定版本的 Three.js 下载到 `vendor/`（已加入 .gitignore，不提交）：

```bash
npm run vendor       # 下载 three@0.169.0 到 vendor/three.module.js
```

> 必须通过 HTTP 打开页面（ES Module 不允许 `file://` 直接加载）。也可用任意静态服务器，
> 例如 `python3 -m http.server 5173`。

## 目录结构（按领域划分）

```
index.html                  入口 DOM：HUD / 3D 舞台 / 研究面板 / 导航 / 降级容器
src/
  main.js                   装配：能力检测 → 3D 加载 → UI/状态机/输入 → 单一主循环
  config/                   内容层（纯数据，不依赖 DOM / three）
    chapters.js             14 个内容单元 chapterConfig（唯一真值）
    research.js             10 个学术阶段 researchData（论文 verifiedUrl 全为 null）
    sceneStates.js          扁平场景状态表（sceneFrom / sceneTo 引用）
    cameraStates.js         扁平摄像机状态表（cameraFrom / cameraTo 引用）
  core/                     状态与输入层
    chapterMachine.js       chapterIndex / chapterProgress 状态机
    scrollController.js     滚轮 / 触摸 / 键盘步进与防连跳
    capabilities.js         WebGL 检测、设备档位、像素比、减少动态效果
    easing.js / rng.js      缓动函数、固定种子随机数
    performance.js          FPS 采样与一次性降级
  three/                    3D 场景层（单 Scene / Camera / Renderer）
    three.js                Three.js 加载器（vendor 优先，CDN 回退）
    createScene.js          场景装配与 SceneController（applyFrame / render / degrade / dispose）
    human.js desk.js book.js computer.js   程序化人物、书桌、书、电脑
    particleLayouts.js      12 种确定性粒子布局（书页→浮起→簇→概念→屏幕→网络→脑）
    particleSystem.js       单套持久化 Float32Array 粒子 + ShaderMaterial
    connections.js          单套持久化 LineSegments 知识网络
    brain.js                左右半球 / 纵裂 / 脑回起伏 / 小脑 / 脑干的电子点大脑
    lighting.js resources.js random.js pageText.js brainHalo.js
  ui/                       界面层（不依赖 three）
    createUI.js             HUD、研究卡片、词云、导航、滚动提示、进度
    renderResearchCard.js   共享卡片渲染（3D 卡片与 2D 降级复用）
    fallback2d.js           WebGL 不可用时的完整 2D 图文降级
  styles/main.css           全部样式（电影感科技风 / 响应式 / reduced-motion / 降级）
scripts/
  serve.mjs                 零依赖本地静态服务器
  vendor-three.mjs          下载固定版本 Three.js 到 vendor/
  validate.mjs              配置完整性、状态链、论文链接红线校验
  test-machine.mjs          章节状态机正反向 / 防连跳 / 确定性测试
docs/architecture.md        模块契约与状态模型说明
```

## 交付分轮说明

需求要求分三轮交付；本实现一次性完成三轮，但按轮次说明完成度与限制：

### 第一轮 · 动画主链骨架
- ✅ 程序化人物（坐姿阅读）、书桌、打开的书、笔记本电脑，均为真实 3D 几何体。
- ✅ 书页文字以细线形式存在，编码阶段连续浮起为粒子，并沿空间轨迹汇入电脑。
- ✅ 电脑屏幕点亮后数据扩散为知识网络。
- ✅ 14 个内容单元（10 学术 + 4 运镜）通过滚轮逐格推进，一次输入最多启动一次切换。
- ✅ 反向滚动沿同一插值路径返回；粒子系统只有一套、固定种子、跨章节复用。
- ✅ 快速上下滚动 20 次不跳变、不跳章，geometry / texture 数量不增长（无头浏览器实测）。

### 第二轮 · 大脑聚合与性能硬化
- ✅ 知识网络 → 脑形点云的连续插值（`brainSeed` → `brain`），不是预先存在的大脑模型直接切换。
- ✅ 单套持久化粒子缓冲：`Float32Array(count*3)` 初始化一次，运行时不增删、不重建 Points/Geometry。
- ✅ 显式资源表 + `dispose()` 批量释放；渲染循环内零对象分配、零 dispose。
- ✅ 像素比封顶（桌面 ≤2 / 移动 ≤1.5 / 低端 1.0）、移动端关闭阴影、桌面投射阴影光源 ≤2。
- ✅ 连续 3 秒低于目标 80% 时触发**一次** `degrade()`（降像素比 + 关阴影），之后不回升。
- ⚠️ 真实设备 FPS 需在目标机型复测；本次验收在无头 Chromium（SwiftShader 软件渲染）完成，仅验证功能与资源稳定性。

### 第三轮 · 学术内容注入与降级
- ✅ 十阶段研究卡片：核心问题 / 人脑机制 / AI 工程对应 / 关键差异 / 词云 / 代表性研究 / 待验证问题，
      并使用「生物学机制 / 工程类比 / 实证研究 / 理论假设 / 待验证问题」标签区分证据层级。
- ✅ 论文数据集中管理，**`verifiedUrl` 全部为 `null`**；渲染层在 null 时只显示纯文本，绝不生成链接。
- ✅ 4 个运镜单元显示「视觉过渡 · NN / 14」，不新增学术卡片。
- ✅ `prefers-reduced-motion`：缩短过渡、关闭装饰动画与环境运动，保留全部内容与导航。
- ✅ 终幕世界层淡出：人物、书桌、书籍、电脑与场景灯光随 `worldFade` 退场（`brain` 状态为 0），
      只保留高密度蓝色电子点大脑；表层粒子更亮、内部更暗，脑形轮廓与脑内连线更清晰。
- ✅ WebGL 不可用 / Three.js 加载失败时进入完整 2D 降级（内联 SVG 示意图 + 10 张研究卡 + 4 个运镜说明 + 进度 + 导航）。
- ✅ 2D 降级与 3D 模式共用同一份 config 数据，不会出现内容分叉。

## 交互说明

| 输入 | 行为 |
| --- | --- |
| 鼠标滚轮 / 触控板 | 一次有效滚动推进或返回一个内容单元；卡片仍可滚动时优先滚动卡片 |
| `ArrowDown` / `PageDown` / 空格 | 下一单元（焦点在面板或按钮内时不抢占原生行为） |
| `ArrowUp` / `PageUp` | 上一单元 |
| 触屏上滑 / 下滑 | 下一单元 / 上一单元；从卡片内滑动优先滚动卡片，到两端后继续滑动才切章 |
| 「上一章 / 下一章」按钮 | 过渡中最多缓存一个方向，避免连续跳章 |
| 底部 14 个章节点 | 直接跳转到对应内容单元 |

页面固定满屏滚动叙事，不产生浏览器页面滚动；研究卡片在右栏内部独立滚动。
首章 / 中间 / 末章的滚动提示会随位置与桌面/移动端切换；运镜单元与学术单元使用不同标签。

## 验收与自测

```bash
npm test             # = npm run validate + 章节状态机测试
npm run validate     # 17 项配置/结构/论文红线校验
```

浏览器端建议按以下清单手测（本次实现已用无头 Chromium 自动化验证 29 项）：

- [ ] 初始画面是清晰的人类阅读场景（人物 / 书 / 电脑均为 3D）。
- [ ] 逐格向下滚动 13 次到达「14 / 14」，再逐格向上返回第 1 章；反向画面沿同一路径回退。
- [ ] 快速连续滚动不会一次跳过多个学术阶段。
- [ ] 卡片内容可独立滚动；卡片滚到底后继续滚动才切换章节。
- [ ] 4 个运镜章节显示「视觉过渡」标签与简短说明，不显示研究卡片。
- [ ] 论文列表没有外链（`verifiedUrl: null`）。
- [ ] 移动端纵向布局无横向溢出，上滑/下滑可切章。
- [ ] 禁用 WebGL 后页面显示完整 2D 降级内容（可用浏览器的 WebGL 禁用开关验证）。
- [ ] 系统开启「减少动态效果」后动画收敛，章节与内容功能不受影响。

## 科学边界与数据

- 人脑与 AI 外置知识系统只在**信息编码、关联、检索、更新、筛选等功能层面**做比较；
  不宣称两者具有相同机制、意识或主观体验。
- 视觉上「大脑形成」是概念表达，不是 AI 已复现人脑结构的证据。
- 论文题录按原始文本呈现，未编造 DOI / arXiv / PubMed 链接；
  `verifiedUrl` 由项目所有者逐条人工核验后再决定是否填入，填入 http(s) 地址后渲染层才会生成外链。

## 已知限制

- 数字大脑为可辨识的概念化脑形点云（左右半球、纵裂、脑回起伏、小脑、脑干），非解剖学精确模型。
- 书页文字用细线线段表现（便于与粒子系统共用坐标），不是字体字形。
- WebGL 线宽上限通常为 1px，关系线的「粗细」通过材质参数与亮度补偿表达，未重建几何。
- 未启用后处理 / Bloom：发光依赖加法混合与 emissive，以保证移动端性能；终幕大脑在软渲染下可能略亮，
  实际 GPU 观感与点大小以浏览器为准。
- 终幕世界层淡出由 `worldFade` + 灯光压暗实现；若希望保留人物剪影作为比例参照，可把 `brain` 状态的
  `worldFade` 调为 0.05–0.15（仅改配置，无需改代码）。
- 无头环境为软件渲染，帧率与点大小观感与真实 GPU 存在差异；性能降级逻辑已实现，但仍建议在目标移动设备上复测。
- 论文数据是候选文献，不代表每篇都支持所在章节全部论述；部署前请按需求逐条核验。

## 部署

将仓库内容（除 `vendor/` 外）上传到任意静态站点即可；离线部署时在构建/发布环境执行
`npm run vendor`，把 `vendor/three.module.js` 一并发布。无需 Node.js 运行时。
