/**
 * FPS 采样与一次性降级（需求 8.1）。
 * 连续 3 秒低于目标帧率的 80% 时触发一次降级；降级后不再回升，避免振荡。
 */

export function createPerformanceGuard({
  targetFps,
  onDegrade = () => {},
  windowSeconds = 3,
  warmupSeconds = 2,
  threshold = 0.8,
} = {}) {
  let elapsed = 0;
  let frames = 0;
  let warmup = Math.max(0, warmupSeconds);
  let degraded = false;

  return {
    /** 主循环每帧调用一次，dt 单位秒。 */
    sample(dtSeconds) {
      if (degraded) return;
      const dt = Number.isFinite(dtSeconds) && dtSeconds > 0 ? Math.min(dtSeconds, 0.25) : 0;
      if (dt === 0) return;

      if (warmup > 0) {
        warmup -= dt;
        return;
      }

      elapsed += dt;
      frames += 1;
      if (elapsed < windowSeconds) return;

      const fps = frames / elapsed;
      elapsed = 0;
      frames = 0;
      if (fps < targetFps * threshold) {
        degraded = true;
        onDegrade({ fps, targetFps });
      }
    },

    /** 页面从隐藏恢复后重置采样窗口，避免把暂停时间计入帧率。 */
    resetWindow() {
      elapsed = 0;
      frames = 0;
    },

    isDegraded() {
      return degraded;
    },
  };
}
