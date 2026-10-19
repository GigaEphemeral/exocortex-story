/**
 * 场景层共享常量：世界坐标锚点、颜色、布局名、默认标量。
 *
 * 只含纯数据，**不 import three**，因此布局/大脑等纯数学模块可以在 Node 中直接验证。
 * 世界坐标锚点与 docs/architecture.md 3.3 节保持一致。
 */

/** 12 种粒子布局名，顺序即叙事链（与 sceneStates.js 的 layout 取值一一对应）。 */
export const LAYOUT_NAMES = Object.freeze([
  'bookPage',
  'lifted',
  'clusters',
  'concepts',
  'screen',
  'retrieval',
  'replay',
  'conflict',
  'archive',
  'networkWide',
  'brainSeed',
  'brain',
]);

const LAYOUT_SEED_BASE = 0x1a2b3c4d;

/** 每种布局的固定种子，保证正反向看到同一套坐标。 */
export function layoutSeed(name) {
  const index = LAYOUT_NAMES.indexOf(name);
  return (LAYOUT_SEED_BASE + index * 7919) >>> 0;
}

export const SEEDS = Object.freeze({
  particles: 0x51ce2026,
  connections: 0x2f13a1b7,
  pageText: 0x50a9e1c3,
  screenContent: 0x3c9e51a7,
  brain: 0x6b7a1e05,
});

/** 着色器颜色（直接写入帧缓冲的显示空间数值，不用 THREE.Color 做色彩管理转换）。 */
export const SHADER_COLORS = Object.freeze({
  concept: Object.freeze([0.36, 0.68, 1.0]),
  evidence: Object.freeze([1.0, 0.76, 0.44]),
  ice: Object.freeze([0.6, 0.86, 1.0]),
});

/** 程序化几何体材质色板（由 THREE.Color 做 sRGB → linear 转换）。 */
export const PALETTE = Object.freeze({
  background: 0x05080f,
  // 与背景同色：远处地板完全融入雾中，不会出现"房间边缘"的硬地平线。
  fog: 0x05080f,
  paper: 0xe6dcc6,
  ink: 0x231a12,
  cover: 0x3d2a1c,
  coverEdge: 0x20140d,
  wood: 0x493526,
  woodDark: 0x2c2018,
  metal: 0x20262e,
  casing: 0x1a2028,
  bezel: 0x090c11,
  keys: 0x252c36,
  floor: 0x070a10,
  skin: 0xcf9f7d,
  hair: 0x17151b,
  cloth: 0x3a4150,
  clothDark: 0x2b303c,
  trouser: 0x232733,
  shoe: 0x14161d,
  warmKey: 0xffd2a1,
  coolKey: 0x8ec6ff,
  bookWarm: 0xffb066,
  pageWarm: 0xffd39a,
  screenGlow: 0x8fd4ff,
  brainIce: 0x9fdcff,
});

/** 世界坐标锚点（architecture.md 3.3「世界坐标锚点」表）。 */
export const WORLD = Object.freeze({
  desk: Object.freeze({
    topY: 0.74,
    center: Object.freeze([0, 0.71, 0]),
    size: Object.freeze([1.8, 0.06, 0.9]),
  }),
  human: Object.freeze({
    seatZ: 1.05,
    headCenter: Object.freeze([0, 1.36, 1.0]),
  }),
  book: Object.freeze({
    center: Object.freeze([-0.28, 0.78, 0.33]),
    leftPage: Object.freeze({ x0: -0.52, x1: -0.28 }),
    rightPage: Object.freeze({ x0: -0.28, x1: -0.04 }),
    z0: 0.12,
    z1: 0.54,
    pageTopY: 0.7865,
    particleY: 0.7895,
  }),
  screen: Object.freeze({
    center: Object.freeze([0.62, 1.02, 0.08]),
    tilt: -0.12,
    width: 0.6,
    height: 0.4,
    contentZ: 0.012,
  }),
  network: Object.freeze({
    min: Object.freeze([-1.7, 0.5, -0.4]),
    max: Object.freeze([1.7, 2.3, 1.4]),
  }),
  archive: Object.freeze({
    min: Object.freeze([-1.55, 0.55, 0.1]),
    max: Object.freeze([-1.1, 1.05, 0.7]),
  }),
  brain: Object.freeze({
    center: Object.freeze([0, 1.55, 0.8]),
    radii: Object.freeze([0.72, 0.58, 0.82]),
    /** 绕 Y 轴旋转，让摄像机看到 3/4 视角而不是正对额叶（更接近大脑侧轮廓）。 */
    yaw: 0.72,
  }),
  camera: Object.freeze({
    position: Object.freeze([0, 2.05, 5.4]),
    target: Object.freeze([0, 1.0, 0.55]),
    fov: 40,
  }),
});

/**
 * 首帧默认标量（与 sceneStates.idle 对齐）。
 * 仅用于 createScene 初始化与 applyFrame 的缺失字段兜底；正常帧以 main 传入的
 * sceneFrom / sceneTo 为准。
 */
export const DEFAULT_VALUES = Object.freeze({
  layout: 'bookPage',
  warmLight: 1.5,
  coolLight: 0.2,
  ambient: 0.32,
  fogDensity: 0.034,
  coolBlend: 0.08,
  particleIntensity: 0.1,
  particleSize: 0.8,
  linkOpacity: 0,
  linkWidth: 1,
  humanFade: 1,
  bookGlow: 0,
  pageGlow: 0.12,
  screenPower: 0.08,
  screenDetail: 0,
  brainGlow: 0,
  worldFade: 1,
});

/**
 * 各布局的粒子视觉尺寸系数：网络广角镜头距离远、点需要更大；
 * 大脑特写距离近、点更小，避免加法混合糊成一团。
 */
export const LAYOUT_PARTICLE_SIZE = Object.freeze({
  bookPage: 0.85,
  lifted: 1,
  clusters: 1,
  concepts: 1,
  screen: 0.78,
  retrieval: 1.05,
  replay: 1,
  conflict: 1,
  archive: 0.95,
  networkWide: 1.4,
  brainSeed: 1.2,
  brain: 0.82,
});

/** 需要逐帧插值并作用到场景的数值字段（layout 单独处理）。 */
export const SCALAR_KEYS = Object.freeze([
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
  'worldFade',
]);
