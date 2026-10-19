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

## 交互说明

| 输入 | 行为 |
| --- | --- |
| 鼠标滚轮 / 触控板 | 一次有效滚动推进或返回一个内容单元；卡片仍可滚动时优先滚动卡片；
  卡片到文字底部/顶部后，需再继续滚动约一格（100px 冗余）才切换章节 |
| `ArrowDown` / `PageDown` / 空格 | 下一单元（焦点在面板或按钮内时不抢占原生行为） |
| `ArrowUp` / `PageUp` | 上一单元 |
| 触屏上滑 / 下滑 | 下一单元 / 上一单元；从卡片内滑动优先滚动卡片，到两端后继续滑动才切章 |
| 「上一章 / 下一章」按钮 | 过渡中最多缓存一个方向，避免连续跳章 |
| 底部 14 个章节点 | 直接跳转到对应内容单元 |

页面固定满屏滚动叙事，不产生浏览器页面滚动；研究卡片在右栏内部独立滚动。
首章 / 中间 / 末章的滚动提示会随位置与桌面/移动端切换；运镜单元只保留编号标签、无文字说明，并自动衔接下一章。

## 验收与自测

```bash
npm test             # = npm run validate + 章节状态机测试
npm run validate     # 18 项配置/结构/论文与外链红线校验
npm run check-links  # 仅检查前沿外链是否可访问（不读取正文）
```
## 科学边界与数据

- 人脑与 AI 外置知识系统只在**信息编码、关联、检索、更新、筛选等功能层面**做比较；
  不宣称两者具有相同机制、意识或主观体验。
- 视觉上「大脑形成」是概念表达，不是 AI 已复现人脑结构的证据。
- 论文题录按原始文本呈现，未编造 DOI / arXiv / PubMed 链接；
  `verifiedUrl` 由项目所有者逐条人工核验后再决定是否填入，填入 http(s) 地址后渲染层才会生成外链。
- 「前沿研究方向」中的 arXiv 链接来自联网检索，并用 `npm run check-links` 做可达性检查；
  它们只表示相关研究方向，**不代表每篇论文都直接支持本阶段全部论述**。


## 部署

将仓库内容（除 `vendor/` 外）上传到任意静态站点即可；离线部署时在构建/发布环境执行
`npm run vendor`，把 `vendor/three.module.js` 一并发布。无需 Node.js 运行时。
