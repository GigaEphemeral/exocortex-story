/**
 * 应用装配层：能力检测 → 降级判断 → 3D 场景 + UI + 章节状态机 + 单一主循环。
 *
 * 关键顺序（需求 2.2-D）：必须先做 WebGL 检测，之后才动态 import Three.js 场景模块；
 * WebGL 不可用或模块加载失败时直接进入 2D 图文降级，页面不会空白。
 */
import { chapters } from './config/chapters.js';
import { researchData } from './config/research.js';
import { sceneStates } from './config/sceneStates.js';
import { cameraStates } from './config/cameraStates.js';
import { createUI } from './ui/createUI.js';
import { mountFallback } from './ui/fallback2d.js';
import {
  detectProfile,
  isWebGLAvailable,
  onReducedMotionChange,
  prefersReducedMotion,
} from './core/capabilities.js';
import { createChapterMachine } from './core/chapterMachine.js';
import { createScrollController } from './core/scrollController.js';
import { createPerformanceGuard } from './core/performance.js';

const dom = {
  boot: document.getElementById('boot'),
  bootText: document.getElementById('boot-text'),
  app: document.getElementById('app'),
  canvas: document.getElementById('scene-canvas'),
  panelScroll: document.getElementById('panel-scroll'),
};

/** @type {null | { scene: any, ui: any, machine: any, controller: any, guard: any, stop: () => void }} */
let app = null;
let fallbackMounted = false;

function setBootText(text) {
  if (dom.bootText) dom.bootText.textContent = text;
}

function hideBoot() {
  if (dom.boot) dom.boot.hidden = true;
  dom.app?.setAttribute('aria-busy', 'false');
}

/** 释放 3D 应用全部资源（场景、UI 监听、输入监听、rAF）。可重复调用。 */
function teardown() {
  if (!app) return;
  const current = app;
  app = null;
  try {
    current.stop();
  } catch (error) {
    console.error('[app] 停止主循环失败：', error);
  }
  try {
    current.controller.dispose();
  } catch (error) {
    console.error('[app] 释放输入监听失败：', error);
  }
  try {
    current.ui.dispose();
  } catch (error) {
    console.error('[app] 释放 UI 失败：', error);
  }
  try {
    current.scene.dispose();
  } catch (error) {
    console.error('[app] 释放 3D 资源失败：', error);
  }
}

/**
 * 进入 2D 图文降级：不依赖 WebGL / Three.js，完整可读、可导航。
 * @param {string} reason 展示给用户的降级原因
 */
function enterFallback(reason) {
  if (fallbackMounted) return;
  fallbackMounted = true;
  teardown();
  try {
    mountFallback({ chapters, research: researchData, reason });
  } catch (error) {
    console.error('[app] 2D 降级视图初始化失败：', error);
    setBootText('页面初始化失败，请刷新重试。');
  }
  hideBoot();
}

/** UI 按钮/章节节点触发的步进：过渡中最多缓存一个方向。 */
function handleStep(direction) {
  if (!app) return false;
  return app.machine.requestStep(direction, { queue: true });
}

/** 章节导航点：立即跳转并落到目标单元的停留态。 */
function handleJump(index) {
  if (!app) return false;
  return app.machine.requestJump(index);
}

async function boot() {
  const reducedMotion = prefersReducedMotion();
  const profile = detectProfile();

  // 1. WebGL 检测必须前置：失败时根本不去加载 Three.js。
  if (!isWebGLAvailable()) {
    enterFallback('当前浏览器或运行环境未提供 WebGL，已切换为 2D 图文视图；全部研究内容与导航仍然可用。');
    return;
  }

  // 2. 动态加载场景模块（Three.js 在模块顶层加载）。
  setBootText('正在加载 3D 场景…');
  let createScene;
  try {
    ({ createScene } = await import('./three/createScene.js'));
  } catch (error) {
    console.error('[app] 3D 模块加载失败：', error);
    enterFallback('3D 引擎加载失败（离线时请先执行 npm run vendor），已切换为 2D 图文视图。');
    return;
  }

  // 3. 创建场景。
  let scene;
  try {
    scene = createScene({
      canvas: dom.canvas,
      profile,
      reducedMotion,
      onContextLost: () => {
        window.setTimeout(() => {
          enterFallback('3D 渲染上下文丢失，已切换为 2D 图文视图。');
        }, 0);
      },
    });
  } catch (error) {
    console.error('[app] 3D 场景初始化失败：', error);
    enterFallback('3D 场景初始化失败，已切换为 2D 图文视图。');
    return;
  }

  // 4. 创建界面与状态机。
  let ui;
  try {
    ui = createUI({ chapters, research: researchData, onStep: handleStep, onJump: handleJump });
  } catch (error) {
    console.error('[app] 界面初始化失败：', error);
    try {
      scene.dispose();
    } catch (disposeError) {
      console.error('[app] 释放 3D 资源失败：', disposeError);
    }
    enterFallback('界面初始化失败，已切换为 2D 图文视图。');
    return;
  }

  const machine = createChapterMachine({ chapters, reducedMotion });
  const controller = createScrollController({
    onStep: (direction) => machine.requestStep(direction),
    isBusy: () => machine.getState().isTransitioning,
    canScrollCard: (direction, target) => ui.canScrollCard(direction, target),
    panelElement: dom.panelScroll,
  });

  const guard = createPerformanceGuard({
    targetFps: profile.targetFps,
    onDegrade: ({ fps }) => {
      console.warn(`[app] 帧率 ${fps.toFixed(1)} 低于目标 ${profile.targetFps}，执行一次性降级。`);
      scene.degrade();
      ui.setNotice('已自动降低渲染精度以保持流畅。');
      window.setTimeout(() => ui.setNotice(null), 6000);
    },
  });

  // 5. 单一主循环。帧对象复用，不每帧创建新对象。
  const frame = { from: null, to: null, t: 1, cameraFrom: null, cameraTo: null, elapsed: 0 };
  let rafId = 0;
  let lastTime = 0;
  let elapsed = 0;
  let renderedIndex = -1;
  let arrivalDirection = 1;
  let firstFrame = true;

  /**
   * 视觉过渡章节（type === 'camera'）不停留：
   * 播放完自己的运镜后立即自动衔接下一章，正反向都生效。
   */
  function passThroughCameraChapter() {
    const state = machine.getState();
    if (state.isTransitioning) return state;
    const unit = chapters[state.chapterIndex];
    if (!unit || unit.type !== 'camera') return state;

    const direction = arrivalDirection === -1 ? -1 : 1;
    const target = state.chapterIndex + direction;
    if (target < 0 || target >= chapters.length) return state;
    if (!machine.requestStep(direction)) return state;
    return machine.getState();
  }

  function drawFrame(now) {
    if (document.hidden) {
      lastTime = now;
      return;
    }
    const delta = lastTime === 0 ? 0 : Math.min(Math.max((now - lastTime) / 1000, 0), 0.05);
    lastTime = now;
    elapsed += delta;
    machine.tick(delta);

    let state = machine.getState();

    // 先记录进入当前单元的方向（用于判断运镜章节应向前还是向后自动衔接）。
    if (state.chapterIndex !== renderedIndex && renderedIndex >= 0) {
      arrivalDirection = state.chapterIndex > renderedIndex ? 1 : -1;
    }

    // 运镜章节播放完不停留：直接顺序播放到相邻章节。
    if (!state.isTransitioning) {
      state = passThroughCameraChapter();
      if (state.chapterIndex !== renderedIndex && renderedIndex >= 0) {
        arrivalDirection = state.chapterIndex > renderedIndex ? 1 : -1;
      }
    }

    if (state.chapterIndex !== renderedIndex) {
      renderedIndex = state.chapterIndex;
      ui.showChapter(state.chapterIndex);
    }

    const chapter = chapters[state.chapterIndex];
    frame.from = sceneStates[chapter.sceneFrom];
    frame.to = sceneStates[chapter.sceneTo];
    frame.t = state.chapterProgress;
    frame.cameraFrom = cameraStates[chapter.cameraFrom];
    frame.cameraTo = cameraStates[chapter.cameraTo];
    frame.elapsed = elapsed;

    scene.applyFrame(frame);
    scene.render();
    ui.setProgress(state.storyProgress);
    guard.sample(delta);

    if (firstFrame) {
      firstFrame = false;
      hideBoot();
    }
  }

  function loop(now) {
    rafId = window.requestAnimationFrame(loop);
    drawFrame(now);
  }

  function stop() {
    window.cancelAnimationFrame(rafId);
    rafId = 0;
  }

  // 首帧同步绘制一次，避免从加载遮罩切到黑屏的闪烁。
  ui.showChapter(0);
  renderedIndex = 0;
  drawFrame(window.performance.now());
  rafId = window.requestAnimationFrame(loop);

  // 页面隐藏/恢复：重置时间基准与帧率采样窗口，章节状态由状态机保持。
  const handleVisibility = () => {
    if (!document.hidden) {
      lastTime = 0;
      guard.resetWindow();
    }
  };
  document.addEventListener('visibilitychange', handleVisibility);

  // 系统级「减少动态效果」偏好变化时，同步状态机与场景。
  const unsubscribeReducedMotion = onReducedMotionChange((reduced) => {
    machine.setReducedMotion(reduced);
    scene.setReducedMotion?.(reduced);
    ui.setReducedMotion?.(reduced);
  });

  app = {
    scene,
    ui,
    machine,
    controller,
    guard,
    stop() {
      stop();
      document.removeEventListener('visibilitychange', handleVisibility);
      unsubscribeReducedMotion();
    },
  };
}

// 验收与调试钩子：只在 ?debug=1 时暴露，便于浏览器自动化读取状态、检查资源与强制降级。
if (new URLSearchParams(window.location.search).has('debug')) {
  window.__APP_DEBUG__ = {
    get app() {
      return app;
    },
    chapters,
    researchData,
    sceneStates,
    cameraStates,
    enterFallback,
  };
}

boot().catch((error) => {
  console.error('[app] 初始化失败：', error);
  enterFallback('页面初始化失败，已切换为 2D 图文视图。');
});
