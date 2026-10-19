/**
 * 固定种子随机数：粒子初始位置、目标布局、连线关系都必须在每次加载时一致，
 * 否则正向与反向动画会得到不同结果（违反「相同 progress 产生相同视觉」）。
 */

/**
 * mulberry32：32 位种子的小型伪随机数生成器，足够粒子布局使用。
 * @param {number} seed
 * @returns {() => number} 返回 [0, 1) 的浮点数
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
 * 在 mulberry32 之上附加常用采样方法。不需要高斯分布时可只用 mulberry32。
 * @param {number} seed
 */
export function createSeededRandom(seed) {
  const next = mulberry32(seed);
  let spare = null;

  return {
    next,
    /** @param {number} min @param {number} max */
    range: (min, max) => min + (max - min) * next(),
    /** @param {number} min @param {number} max 闭区间整数 */
    int: (min, max) => Math.floor(min + (max - min + 1) * next()),
    /** Box–Muller 标准正态分布（缓存另一半样本，避免浪费） */
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
