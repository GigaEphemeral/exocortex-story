/**
 * 场景状态表：唯一一份「扁平参数」视觉状态，供 chapterConfig 的 sceneFrom / sceneTo 引用。
 *
 * 设计约束（对应需求 5.3.3）：
 * - 全部参数都是一层扁平标量或布局名字符串，不做多层嵌套；
 * - updateScene 只在这两个状态之间按 chapterProgress 做线性插值，结果是纯函数，
 *   不依赖上一帧、不依赖滚动方向；
 * - `layout` 指向粒子目标布局（见 src/three/particleLayouts.js）。切换布局时粒子沿
 *   同一条持久化 Float32Array 轨迹插值，Points / BufferGeometry / 粒子身份都不重建；
 * - 键集合冻结在 sceneStateKeys 中，scripts/validate.mjs 会校验每个状态字段齐全。
 *
 * 数值范围约定：光照与强度为 0–3 的无量纲相对值，其余为 0–1 的比例。
 */

export const sceneStateKeys = Object.freeze([
  'layout',
  'warmLight',
  'coolLight',
  'ambient',
  'fogDensity',
  'coolBlend',
  'particleIntensity',
  'particleSize',
  'linkOpacity',
  'linkWidth',
  'humanFade',
  'bookGlow',
  'pageGlow',
  'screenPower',
  'screenDetail',
  'brainGlow',
]);

/** @typedef {typeof sceneStates[keyof typeof sceneStates]} SceneState */

const base = Object.freeze({
  layout: 'bookPage',
  warmLight: 1.6,
  coolLight: 0.3,
  ambient: 0.35,
  fogDensity: 0.03,
  coolBlend: 0.1,
  particleIntensity: 0.12,
  particleSize: 0.85,
  linkOpacity: 0,
  linkWidth: 1,
  humanFade: 1,
  bookGlow: 0,
  pageGlow: 0.15,
  screenPower: 0.1,
  screenDetail: 0,
  brainGlow: 0,
});

/** @param {Partial<typeof base>} overrides */
const state = (overrides) => Object.freeze({ ...base, ...overrides });

/**
 * 状态链：idle → reading → encoding → clusters → concepts → screen → retrieval
 *          → replay → conflict → archive → networkWide → brainSeed → brain
 * chapterConfig 中相邻单元的 sceneTo / sceneFrom 必须首尾相接（validate 校验）。
 */
export const sceneStates = Object.freeze({
  /** 初始待机：人物在暖光下阅读，粒子几乎不可见。 */
  idle: state({ layout: 'bookPage', warmLight: 1.5, coolLight: 0.2, ambient: 0.32, fogDensity: 0.034, coolBlend: 0.08, particleIntensity: 0.1, particleSize: 0.8, pageGlow: 0.12, screenPower: 0.08 }),

  /** 阶段 0：阅读与信息感知。 */
  reading: state({ layout: 'bookPage', warmLight: 2.5, coolLight: 0.3, ambient: 0.62, fogDensity: 0.026, coolBlend: 0.12, particleIntensity: 0.22, particleSize: 0.9, linkOpacity: 0.05, bookGlow: 0.08, pageGlow: 0.4, screenPower: 0.14, screenDetail: 0.05 }),

  /** 阶段 1：理解与编码，文字浮起为粒子。 */
  encoding: state({ layout: 'lifted', warmLight: 2.1, coolLight: 0.55, ambient: 0.55, fogDensity: 0.028, coolBlend: 0.22, particleIntensity: 0.7, particleSize: 1, linkOpacity: 0.1, bookGlow: 0.45, pageGlow: 0.9, screenPower: 0.2, screenDetail: 0.1 }),

  /** 阶段 2：模式分离，粒子形成可区分的局部簇。 */
  clusters: state({ layout: 'clusters', warmLight: 1.8, coolLight: 0.8, ambient: 0.5, coolBlend: 0.34, particleIntensity: 0.85, particleSize: 1, linkOpacity: 0.2, bookGlow: 0.2, pageGlow: 0.55, screenPower: 0.3, screenDetail: 0.15 }),

  /** 阶段 3：抽象与知识整合，簇间建立分层连接。 */
  concepts: state({ layout: 'concepts', warmLight: 1.4, coolLight: 1.2, ambient: 0.52, coolBlend: 0.46, particleIntensity: 0.95, particleSize: 1, linkOpacity: 0.34, bookGlow: 0.1, pageGlow: 0.3, screenPower: 0.5, screenDetail: 0.35 }),

  /** 阶段 4：知识数字化，粒子汇入电脑屏幕。 */
  screen: state({ layout: 'screen', warmLight: 0.8, coolLight: 1.6, ambient: 0.45, fogDensity: 0.032, coolBlend: 0.6, particleIntensity: 1.05, particleSize: 1, linkOpacity: 0.3, screenPower: 1, screenDetail: 0.85, humanFade: 0.92 }),

  /** 阶段 5：检索与模式补全，查询脉冲沿连接传播。 */
  retrieval: state({ layout: 'retrieval', warmLight: 0.7, coolLight: 1.8, ambient: 0.4, fogDensity: 0.034, coolBlend: 0.68, particleIntensity: 1.2, particleSize: 1.05, linkOpacity: 0.5, screenPower: 1, screenDetail: 0.95, humanFade: 0.85 }),

  /** 阶段 6：离线重放与巩固，整体压暗、局部反复激活。 */
  replay: state({ layout: 'replay', warmLight: 0.55, coolLight: 1.5, ambient: 0.3, fogDensity: 0.036, coolBlend: 0.62, particleIntensity: 0.8, particleSize: 0.95, linkOpacity: 0.42, screenPower: 0.85, screenDetail: 0.8, humanFade: 0.8 }),

  /** 阶段 7：冲突检测与再巩固，两组矛盾节点同时亮起。 */
  conflict: state({ layout: 'conflict', warmLight: 0.8, coolLight: 1.6, ambient: 0.36, fogDensity: 0.034, coolBlend: 0.58, particleIntensity: 1.05, particleSize: 1, linkOpacity: 0.46, screenPower: 0.9, screenDetail: 0.85, humanFade: 0.75 }),

  /** 阶段 8：主动遗忘与信息筛选，弱化与归档可见。 */
  archive: state({ layout: 'archive', warmLight: 0.6, coolLight: 1.4, ambient: 0.32, fogDensity: 0.036, coolBlend: 0.52, particleIntensity: 0.8, particleSize: 0.95, linkOpacity: 0.36, screenPower: 0.7, screenDetail: 0.6, humanFade: 0.7 }),

  /** 运镜 C：完整知识网络。 */
  networkWide: state({ layout: 'networkWide', warmLight: 0.5, coolLight: 1.5, ambient: 0.38, fogDensity: 0.038, coolBlend: 0.7, particleIntensity: 1.05, particleSize: 1, linkOpacity: 0.6, screenPower: 0.6, screenDetail: 0.5, humanFade: 0.62 }),

  /** 运镜 D：网络开始向脑形轮廓收拢，建立视觉预期。 */
  brainSeed: state({ layout: 'brainSeed', warmLight: 0.45, coolLight: 1.7, ambient: 0.4, fogDensity: 0.04, coolBlend: 0.82, particleIntensity: 1.15, particleSize: 1.05, linkOpacity: 0.55, screenPower: 0.5, screenDetail: 0.4, humanFade: 0.55, brainGlow: 0.5 }),

  /** 阶段 9：数字大脑。 */
  brain: state({ layout: 'brain', warmLight: 0.3, coolLight: 2.4, ambient: 0.34, fogDensity: 0.042, coolBlend: 1, particleIntensity: 1.55, particleSize: 1.2, linkOpacity: 0.3, linkWidth: 0.9, screenPower: 0.25, screenDetail: 0.2, humanFade: 0.32, brainGlow: 1 }),
});
