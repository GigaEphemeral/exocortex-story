/**
 * 缓动函数表：chapterConfig.easing 从这里解析。
 * 全部函数满足 f(0)=0、f(1)=1，且单调递增——保证章节动画可正向播放、可逆播放。
 */

export const easingFunctions = Object.freeze({
  linear: (t) => t,
  easeOutCubic: (t) => 1 - (1 - t) ** 3,
  easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
});

/**
 * @param {string} name
 * @returns {(t: number) => number}
 */
export function resolveEasing(name) {
  return easingFunctions[name] ?? easingFunctions.easeInOutCubic;
}
