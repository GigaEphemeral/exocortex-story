/**
 * 3D 场景层唯一入口：createScene({ canvas, profile, reducedMotion, onContextLost })
 *
 * 返回 { applyFrame, render, degrade, dispose, setReducedMotion, getDiagnostics }。
 *
 * 设计要点（docs/architecture.md 3.3）：
 * - 人物 / 书桌 / 书 / 电脑 / 粒子 / 连线 / 大脑共用同一个 Scene / Camera / Renderer；
 * - applyFrame 是 (from, to, t) 的纯函数：只改写已有缓冲区与材质参数，不 new、不 dispose；
 * - 摄像机 position / target / fov 全部线性插值后 lookAt，不瞬移；
 * - 12 种粒子布局按固定种子预生成，正反向走同一条路径；
 * - degrade() 幂等；dispose() 释放资源表内全部 geometry / material / texture / renderer。
 */
import { THREE, threeSource } from './three.js';
import { DEFAULT_VALUES, PALETTE, WORLD } from './constants.js';
import { createResourceRegistry } from './resources.js';
import { createParticleLayouts } from './particleLayouts.js';
import { createParticles } from './particleSystem.js';
import { createConnections } from './connections.js';
import { createLighting } from './lighting.js';
import { createHuman } from './human.js';
import { createDesk } from './desk.js';
import { createBook } from './book.js';
import { createComputer } from './computer.js';
import { createBrainHalo } from './brainHalo.js';

const DEG2RAD = Math.PI / 180;

/** @param {any} source @param {string} key @param {number} fallback */
function readNumber(source, key, fallback) {
  if (!source) return fallback;
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** @param {any} array @param {number} index @param {number} fallback */
function readComponent(array, index, fallback) {
  if (!array) return fallback;
  const value = array[index];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** @param {any} from @param {any} to @param {string} key @param {number} t @param {number} fallback */
function interpolate(from, to, key, t, fallback) {
  const start = readNumber(from, key, fallback);
  const end = readNumber(to, key, fallback);
  return start + (end - start) * t;
}

/** @param {any} profile */
function normalizeProfile(profile) {
  const source = profile || {};
  const mobile = Boolean(source.mobile);
  const lowPower = Boolean(source.lowPower);
  const fallbackRatio = typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1;
  const rawRatio = typeof source.pixelRatio === 'number' ? source.pixelRatio : fallbackRatio;
  const particleCount = Math.floor(
    typeof source.particleCount === 'number' && source.particleCount > 0
      ? source.particleCount
      : mobile
        ? 800
        : lowPower
          ? 3000
          : 5000
  );
  return {
    mobile,
    lowPower,
    pixelRatio: Math.max(1, Math.min(mobile ? 1.5 : 2, rawRatio)),
    particleCount,
    shadows: typeof source.shadows === 'boolean' ? source.shadows : !mobile && !lowPower,
  };
}

/**
 * @param {{ canvas: HTMLCanvasElement, profile?: any, reducedMotion?: boolean,
 *   onContextLost?: () => void }} options
 */
export function createScene({ canvas, profile, reducedMotion, onContextLost }) {
  if (!canvas) throw new Error('createScene: 需要 canvas');

  const settings = normalizeProfile(profile);
  const reducedDefault = Boolean(reducedMotion);
  let reduced = reducedDefault;
  let disposed = false;
  let contextLost = false;
  let degraded = false;

  const registry = createResourceRegistry();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.background);
  scene.fog = new THREE.FogExp2(PALETTE.fog, DEFAULT_VALUES.fogDensity);

  const camera = new THREE.PerspectiveCamera(WORLD.camera.fov, 1, 0.05, 60);
  camera.position.set(WORLD.camera.position[0], WORLD.camera.position[1], WORLD.camera.position[2]);
  camera.lookAt(WORLD.camera.target[0], WORLD.camera.target[1], WORLD.camera.target[2]);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !settings.mobile,
    alpha: false,
    stencil: false,
    depth: true,
    powerPreference: 'high-performance',
  });
  // renderer 先登记，dispose 时逆序释放 → renderer 最后被释放。
  registry.add(renderer);
  renderer.setPixelRatio(settings.pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = settings.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(PALETTE.background, 1);

  // —— 场景内容：程序化几何 + 单套持久化粒子 / 连线 ——
  const layouts = createParticleLayouts(settings.particleCount);
  const lighting = createLighting({ THREE, scene, profile: { shadows: settings.shadows }, resources: registry });

  const desk = createDesk({ THREE, resources: registry });
  scene.add(desk.group);

  const book = createBook({ THREE, resources: registry });
  scene.add(book.group);

  const human = createHuman({ THREE, resources: registry });
  scene.add(human.group);

  const computer = createComputer({ THREE, resources: registry });
  scene.add(computer.group);

  const brainHalo = createBrainHalo({ THREE, resources: registry });
  scene.add(brainHalo.object);

  const particles = createParticles({
    THREE,
    count: settings.particleCount,
    layouts,
    resources: registry,
    reducedMotion: reduced,
  });
  scene.add(particles.object);

  const connections = createConnections({
    THREE,
    count: settings.particleCount,
    layouts,
    resources: registry,
    mobile: settings.mobile,
  });
  scene.add(connections.object);

  // —— 世界层淡出（终幕只剩数字大脑）——
  // 人物在 human.js 内按 worldFade 处理；书桌/书/电脑在这里统一处理。
  // 着色器材质（书页文字、电脑屏幕内部数据）由各自的 glow/power 参数控制，跳过 opacity。
  const worldFadeGroups = [desk.group, book.group, computer.group];
  /** @type {{ material: any, baseOpacity: number }[]} */
  const worldFadeMaterials = [];
  const seenFadeMaterials = new Set();
  for (const group of worldFadeGroups) {
    group.traverse((object) => {
      const material = object.material;
      if (!material) return;
      const list = Array.isArray(material) ? material : [material];
      for (const item of list) {
        if (seenFadeMaterials.has(item)) continue;
        seenFadeMaterials.add(item);
        if (item.isShaderMaterial) continue;
        const baseOpacity = typeof item.opacity === 'number' ? item.opacity : 1;
        // 进入透明队列后 opacity 才生效；depthWrite 保持默认，遮挡关系不变。
        item.transparent = true;
        worldFadeMaterials.push({ material: item, baseOpacity });
      }
    });
  }

  /** @param {number} fade 1 = 正常可见，0 = 完全退场 */
  function applyWorldFade(fade) {
    const clamped = fade < 0 ? 0 : fade > 1 ? 1 : fade;
    const visible = clamped > 0.004;
    for (let index = 0; index < worldFadeGroups.length; index += 1) {
      worldFadeGroups[index].visible = visible;
    }
    for (let index = 0; index < worldFadeMaterials.length; index += 1) {
      const entry = worldFadeMaterials[index];
      entry.material.opacity = entry.baseOpacity * clamped;
    }
  }

  // —— 逐帧插值目标（预分配，applyFrame 只改数值） ——
  const values = {
    warmLight: DEFAULT_VALUES.warmLight,
    coolLight: DEFAULT_VALUES.coolLight,
    ambient: DEFAULT_VALUES.ambient,
    fogDensity: DEFAULT_VALUES.fogDensity,
    coolBlend: DEFAULT_VALUES.coolBlend,
    particleIntensity: DEFAULT_VALUES.particleIntensity,
    particleSize: DEFAULT_VALUES.particleSize,
    linkOpacity: DEFAULT_VALUES.linkOpacity,
    linkWidth: DEFAULT_VALUES.linkWidth,
    humanFade: DEFAULT_VALUES.humanFade,
    bookGlow: DEFAULT_VALUES.bookGlow,
    pageGlow: DEFAULT_VALUES.pageGlow,
    screenPower: DEFAULT_VALUES.screenPower,
    screenDetail: DEFAULT_VALUES.screenDetail,
    brainGlow: DEFAULT_VALUES.brainGlow,
    worldFade: DEFAULT_VALUES.worldFade,
    linkDensity: DEFAULT_VALUES.linkDensity,
    linkDecay: DEFAULT_VALUES.linkDecay,
  };

  let cssWidth = 1;
  let cssHeight = 1;

  function updateViewportUniforms() {
    const fovRad = camera.fov * DEG2RAD;
    const viewportScale = cssHeight / (2 * Math.tan(fovRad / 2));
    const pixelRatio = renderer.getPixelRatio();
    particles.uniforms.uViewportScale.value = viewportScale;
    particles.uniforms.uPixelRatio.value = pixelRatio;
    computer.setPixelRatio(pixelRatio);
  }

  function resize() {
    if (disposed) return;
    let width = Math.round(canvas.clientWidth || 0);
    let height = Math.round(canvas.clientHeight || 0);
    if (!width || !height) {
      const rect = canvas.getBoundingClientRect();
      width = Math.round(rect.width) || (typeof window !== 'undefined' ? window.innerWidth : 1);
      height = Math.round(rect.height) || (typeof window !== 'undefined' ? window.innerHeight : 1);
    }
    width = Math.max(1, width);
    height = Math.max(1, height);
    if (width === cssWidth && height === cssHeight) return;
    cssWidth = width;
    cssHeight = height;
    // 不改 canvas 的 CSS 尺寸（由 main.css 的 100% 布局控制）。
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    updateViewportUniforms();
  }

  function handleContextLost(event) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    if (contextLost) return;
    contextLost = true;
    if (typeof onContextLost === 'function') {
      try {
        onContextLost();
      } catch (error) {
        console.warn('[scene] onContextLost 回调失败：', error?.message ?? error);
      }
    }
  }

  function handleContextRestored() {
    contextLost = false;
    resize();
  }

  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => resize()) : null;
  if (resizeObserver) resizeObserver.observe(canvas);
  if (typeof window !== 'undefined') window.addEventListener('resize', resize);
  canvas.addEventListener('webglcontextlost', handleContextLost, false);
  canvas.addEventListener('webglcontextrestored', handleContextRestored, false);

  /**
   * 每帧调用：只做数值插值与写入，不分配任何对象。
   * frame = { from, to, t, cameraFrom, cameraTo, elapsed }
   */
  function applyFrame(frame) {
    if (disposed || contextLost || !frame) return;

    const from = frame.from || DEFAULT_VALUES;
    const to = frame.to || from;
    const rawT = typeof frame.t === 'number' ? frame.t : 0;
    const t = rawT < 0 ? 0 : rawT > 1 ? 1 : rawT;
    const elapsed = typeof frame.elapsed === 'number' && Number.isFinite(frame.elapsed) ? frame.elapsed : 0;

    // —— 全部 sceneStateKeys 标量：逐帧线性插值后作用到场景 ——
    values.warmLight = interpolate(from, to, 'warmLight', t, DEFAULT_VALUES.warmLight);
    values.coolLight = interpolate(from, to, 'coolLight', t, DEFAULT_VALUES.coolLight);
    values.ambient = interpolate(from, to, 'ambient', t, DEFAULT_VALUES.ambient);
    values.fogDensity = interpolate(from, to, 'fogDensity', t, DEFAULT_VALUES.fogDensity);
    values.coolBlend = interpolate(from, to, 'coolBlend', t, DEFAULT_VALUES.coolBlend);
    values.particleIntensity = interpolate(from, to, 'particleIntensity', t, DEFAULT_VALUES.particleIntensity);
    values.particleSize = interpolate(from, to, 'particleSize', t, DEFAULT_VALUES.particleSize);
    values.linkOpacity = interpolate(from, to, 'linkOpacity', t, DEFAULT_VALUES.linkOpacity);
    values.linkWidth = interpolate(from, to, 'linkWidth', t, DEFAULT_VALUES.linkWidth);
    values.humanFade = interpolate(from, to, 'humanFade', t, DEFAULT_VALUES.humanFade);
    values.bookGlow = interpolate(from, to, 'bookGlow', t, DEFAULT_VALUES.bookGlow);
    values.pageGlow = interpolate(from, to, 'pageGlow', t, DEFAULT_VALUES.pageGlow);
    values.screenPower = interpolate(from, to, 'screenPower', t, DEFAULT_VALUES.screenPower);
    values.screenDetail = interpolate(from, to, 'screenDetail', t, DEFAULT_VALUES.screenDetail);
    values.brainGlow = interpolate(from, to, 'brainGlow', t, DEFAULT_VALUES.brainGlow);
    values.worldFade = interpolate(from, to, 'worldFade', t, DEFAULT_VALUES.worldFade);
    values.linkDensity = interpolate(from, to, 'linkDensity', t, DEFAULT_VALUES.linkDensity);
    values.linkDecay = interpolate(from, to, 'linkDecay', t, DEFAULT_VALUES.linkDecay);

    const layoutFrom = typeof from.layout === 'string' ? from.layout : DEFAULT_VALUES.layout;
    const layoutTo = typeof to.layout === 'string' ? to.layout : DEFAULT_VALUES.layout;

    // —— 摄像机：position / target / fov 全部插值后 lookAt ——
    const cameraFrom = frame.cameraFrom || WORLD.camera;
    const cameraTo = frame.cameraTo || cameraFrom;
    const fromPosition = cameraFrom.position || WORLD.camera.position;
    const toPosition = cameraTo.position || WORLD.camera.position;
    const fromTarget = cameraFrom.target || WORLD.camera.target;
    const toTarget = cameraTo.target || WORLD.camera.target;

    const px = readComponent(fromPosition, 0, WORLD.camera.position[0]);
    const py = readComponent(fromPosition, 1, WORLD.camera.position[1]);
    const pz = readComponent(fromPosition, 2, WORLD.camera.position[2]);
    const tx = readComponent(fromTarget, 0, WORLD.camera.target[0]);
    const ty = readComponent(fromTarget, 1, WORLD.camera.target[1]);
    const tz = readComponent(fromTarget, 2, WORLD.camera.target[2]);
    const endPx = readComponent(toPosition, 0, px);
    const endPy = readComponent(toPosition, 1, py);
    const endPz = readComponent(toPosition, 2, pz);
    const endTx = readComponent(toTarget, 0, tx);
    const endTy = readComponent(toTarget, 1, ty);
    const endTz = readComponent(toTarget, 2, tz);
    const fromFov = readNumber(cameraFrom, 'fov', WORLD.camera.fov);
    const toFov = readNumber(cameraTo, 'fov', fromFov);

    camera.position.set(px + (endPx - px) * t, py + (endPy - py) * t, pz + (endPz - pz) * t);
    camera.lookAt(tx + (endTx - tx) * t, ty + (endTy - ty) * t, tz + (endTz - tz) * t);
    const fov = fromFov + (toFov - fromFov) * t;
    if (Math.abs(camera.fov - fov) > 0.0005) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    updateViewportUniforms();

    // —— 环境与各领域对象 ——
    scene.fog.density = values.fogDensity;
    lighting.update(values, elapsed, reduced);
    human.update(elapsed, values.humanFade, reduced, values.worldFade);
    book.update(values.bookGlow, values.pageGlow, elapsed, reduced);
    computer.update(values.screenPower, values.screenDetail, elapsed, reduced);
    applyWorldFade(values.worldFade);
    particles.update(layoutFrom, layoutTo, t, values, elapsed);
    connections.update(
      particles.positions,
      values.linkOpacity,
      values.linkWidth,
      values.coolBlend,
      elapsed,
      values.linkDensity,
      values.linkDecay
    );
    brainHalo.update(values.brainGlow, values.coolBlend, elapsed, reduced, camera);
  }

  function render() {
    if (disposed || contextLost) return;
    renderer.render(scene, camera);
  }

  /** 一次性降级：降低像素比 + 关闭阴影；重复调用无副作用，且不回升。 */
  function degrade() {
    if (degraded || disposed) return;
    degraded = true;
    const targetRatio = Math.max(1, Math.min(settings.pixelRatio, 1.25));
    if (targetRatio < settings.pixelRatio) {
      settings.pixelRatio = targetRatio;
      renderer.setPixelRatio(targetRatio);
      renderer.setSize(cssWidth, cssHeight, false);
      updateViewportUniforms();
    }
    renderer.shadowMap.enabled = false;
    lighting.degrade();
  }

  /** @param {boolean} next */
  function setReducedMotion(next) {
    reduced = Boolean(next);
    particles.setMotion(reduced);
    connections.setMotion(reduced);
  }

  function getDiagnostics() {
    return {
      particles: settings.particleCount,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      drawCalls: renderer.info.render.calls,
      worldFade: values.worldFade,
      linkDensity: values.linkDensity,
      linkDecay: values.linkDecay,
      linkCount: connections.linkCount,
      threeSource,
    };
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (resizeObserver) {
      resizeObserver.disconnect();
    }
    if (typeof window !== 'undefined') window.removeEventListener('resize', resize);
    canvas.removeEventListener('webglcontextlost', handleContextLost);
    canvas.removeEventListener('webglcontextrestored', handleContextRestored);
    lighting.dispose();
    registry.dispose();
    scene.clear();
    if (!contextLost) {
      try {
        renderer.forceContextLoss();
      } catch (error) {
        // 上下文已丢失时忽略。
      }
    }
  }

  // 首帧状态：与 sceneStates.idle 对齐，先渲染一次，避免首屏空白。
  resize();
  applyFrame({
    from: DEFAULT_VALUES,
    to: DEFAULT_VALUES,
    t: 0,
    cameraFrom: WORLD.camera,
    cameraTo: WORLD.camera,
    elapsed: 0,
  });
  render();

  return {
    applyFrame,
    render,
    degrade,
    dispose,
    setReducedMotion,
    getDiagnostics,
  };
}
