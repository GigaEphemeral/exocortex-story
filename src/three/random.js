/**
 * 固定种子随机数（mulberry32 + Box–Muller）。
 *
 * 场景层所有「一次性预生成」的数据——粒子目标布局、书页文字线段、网络连线、
 * 粒子静态属性——都通过它生成，保证每次加载、以及正向/反向滚动看到的结构完全一致。
 * 本模块是纯函数，不依赖 three，可在 Node 中直接测试。
 */

/**
 * @param {number} seed
 * @returns {() => number} [0, 1) 均匀分布
 */
export function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {number} seed
 */
export function createRandom(seed) {
  const next = mulberry32(seed);
  let spare = null;
  return {
    next,
    /** @param {number} min @param {number} max */
    range: (min, max) => min + (max - min) * next(),
    /** 标量高斯分布（均值 0，标准差 1） */
    gaussian: () => {
      if (spare !== null) {
        const value = spare;
        spare = null;
        return value;
      }
      const u = Math.max(next(), Number.EPSILON);
      const v = next();
      const radius = Math.sqrt(-2 * Math.log(u));
      spare = radius * Math.sin(2 * Math.PI * v);
      return radius * Math.cos(2 * Math.PI * v);
    },
  };
}
