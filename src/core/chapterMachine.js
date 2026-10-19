import { resolveEasing } from './easing.js';

const MIN_DURATION_SECONDS = 0.18;
const REDUCED_MOTION_FACTOR = 0.45;

/**
 * 章节状态机：chapterIndex 与 chapterProgress 的唯一真值。
 *
 * 语义（与 docs/architecture.md 第 2 节一致）：
 * - 停留态 = (chapterIndex, chapterProgress=1)，画面为该单元的 sceneTo；
 * - 正向：chapterIndex 先加一，progress 从 0 → 1（sceneFrom(next) === sceneTo(current)，无跳变）；
 * - 反向：chapterIndex 不变，progress 从 1 → 0（沿同一路径退回），归零后 chapterIndex 减一、progress 置 1；
 * - 任意一帧画面只由 (chapterIndex, chapterProgress) 决定，不依赖历史状态。
 *
 * 状态机本身不接触 DOM / Three.js，可直接在 Node 中测试（scripts/test-machine.mjs）。
 */
export function createChapterMachine({ chapters, reducedMotion = false }) {
  if (!Array.isArray(chapters) || chapters.length === 0) {
    throw new Error('createChapterMachine 需要至少一个章节');
  }

  const total = chapters.length;
  const lastIndex = total - 1;

  let chapterIndex = 0;
  let chapterProgress = 1;
  /** @type {'settled' | 'forward' | 'backward'} */
  let phase = 'settled';
  let pendingDirection = 0;
  let elapsed = 0;
  let duration = 0;
  let reduced = Boolean(reducedMotion);

  const snapshot = {
    chapterIndex,
    chapterProgress,
    phase,
    isTransitioning: false,
    pendingDirection,
    storyProgress: 1 / total,
  };

  /** 单元动画时长；减少动态效果时缩短，但保留可感知的过渡。 */
  function durationFor(index) {
    const base = Number(chapters[index]?.duration) || 1;
    return Math.max(MIN_DURATION_SECONDS, base * (reduced ? REDUCED_MOTION_FACTOR : 1));
  }

  function syncSnapshot() {
    snapshot.chapterIndex = chapterIndex;
    snapshot.chapterProgress = chapterProgress;
    snapshot.phase = phase;
    snapshot.isTransitioning = phase !== 'settled';
    snapshot.pendingDirection = pendingDirection;
    snapshot.storyProgress = Math.min(1, Math.max(0, (chapterIndex + chapterProgress) / total));
    return snapshot;
  }

  /** 过渡结束后最多执行一次被缓存的输入，避免连续跳章。 */
  function flushPending() {
    if (pendingDirection === 0) return;
    const direction = pendingDirection;
    pendingDirection = 0;
    requestStep(direction);
  }

  /**
   * 请求一次章节步进。
   * @param {-1 | 1} direction 1 向下（下一章），-1 向上（上一章）
   * @param {{ queue?: boolean }} [options] queue=true 时在过渡中缓存一个方向（仅按钮使用）
   * @returns {boolean} 是否立即开始过渡
   */
  function requestStep(direction, options = {}) {
    const dir = direction === 1 ? 1 : direction === -1 ? -1 : 0;
    if (dir === 0) return false;

    if (phase !== 'settled') {
      if (options.queue) pendingDirection = dir;
      return false;
    }

    if (dir === 1) {
      if (chapterIndex >= lastIndex) return false;
      chapterIndex += 1;
      chapterProgress = 0;
      phase = 'forward';
      elapsed = 0;
      duration = durationFor(chapterIndex);
      return true;
    }

    if (chapterIndex <= 0) return false;
    phase = 'backward';
    chapterProgress = 1;
    elapsed = 0;
    duration = durationFor(chapterIndex);
    return true;
  }

  /**
   * 章节点显式跳转：立即落到目标单元的停留态，不做过渡动画。
   * @param {number} targetIndex
   */
  function requestJump(targetIndex) {
    const target = Math.trunc(Number(targetIndex));
    if (!Number.isFinite(target)) return false;
    chapterIndex = Math.min(lastIndex, Math.max(0, target));
    chapterProgress = 1;
    phase = 'settled';
    pendingDirection = 0;
    elapsed = 0;
    duration = 0;
    return true;
  }

  /** 由主循环驱动；dt 单位秒。 */
  function tick(dtSeconds) {
    if (phase === 'settled') return;

    const dt = Number.isFinite(dtSeconds) ? Math.max(0, dtSeconds) : 0;
    elapsed += dt;
    const raw = duration > 0 ? Math.min(1, elapsed / duration) : 1;
    const ease = resolveEasing(chapters[chapterIndex]?.easing);

    if (phase === 'forward') {
      chapterProgress = ease(raw);
      if (raw >= 1) {
        chapterProgress = 1;
        phase = 'settled';
        elapsed = 0;
        flushPending();
      }
      return;
    }

    // backward：沿正向路径倒退，progress 从 1 回到 0
    chapterProgress = ease(1 - raw);
    if (raw >= 1) {
      chapterIndex = Math.max(0, chapterIndex - 1);
      chapterProgress = 1;
      phase = 'settled';
      elapsed = 0;
      flushPending();
    }
  }

  function setReducedMotion(value) {
    reduced = Boolean(value);
  }

  return {
    getState: syncSnapshot,
    requestStep,
    requestJump,
    tick,
    setReducedMotion,
  };
}
