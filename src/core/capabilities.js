/**
 * 运行时能力检测。**必须在加载 Three.js 之前调用**，以便 WebGL 不可用时直接降级。
 */

/** @returns {boolean} 当前环境能否创建 WebGL 上下文 */
export function isWebGLAvailable() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return false;
    // 检测完立即释放探测用的上下文，避免占用一个 WebGL slot。
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * 监听减少动态效果偏好的变化。
 * @param {(reduced: boolean) => void} callback
 * @returns {() => void} 取消监听
 */
export function onReducedMotionChange(callback) {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  const handler = (event) => callback(event.matches);
  query.addEventListener('change', handler);
  return () => query.removeEventListener('change', handler);
}

/**
 * 设备档位：粒子数、像素比、阴影、目标帧率在初始化时一次确定，运行时不改粒子数。
 * 桌面端粒子 ≤ 5000、移动端 ≤ 800（需求 2.2 / 8.1）。
 */
export function detectProfile() {
  const mobileLayout = window.matchMedia('(max-width: 820px)').matches;
  const mobileUserAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const mobile = mobileLayout || mobileUserAgent;

  const cores = navigator.hardwareConcurrency || 8;
  const memory = navigator.deviceMemory ?? 8;
  const lowPower = !mobile && (cores <= 4 || memory <= 4);

  const devicePixelRatio = window.devicePixelRatio || 1;
  const pixelRatio = mobile
    ? Math.min(devicePixelRatio, 1.5)
    : lowPower
      ? 1
      : Math.min(devicePixelRatio, 2);

  return Object.freeze({
    mobile,
    lowPower,
    // 低端设备固定 1.0；移动端 1.5；桌面端 2.0。
    pixelRatio: lowPower ? 1 : pixelRatio,
    particleCount: mobile ? 800 : lowPower ? 3000 : 5000,
    shadows: !mobile && !lowPower,
    targetFps: mobile ? 30 : 60,
    touch: window.matchMedia('(pointer: coarse)').matches,
    reduceMotion: prefersReducedMotion(),
  });
}
