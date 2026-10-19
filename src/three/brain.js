/**
 * 最终「数字大脑」的确定性粒子场。
 *
 * 目标不是光滑椭球，而是可辨认的：
 * - 左右半球：中线（x≈0）表面的粒子被向两侧推开，形成纵裂沟槽；
 * - 脑回/脑沟：半径方向叠加多频正弦 + 绝对值折痕，表面持续起伏；
 * - 额叶收窄、颞叶外扩、底部压平、小脑与脑干提供可读轮廓。
 *
 * 纯数学模块，不依赖 three，可在 Node 中直接验证（见自检脚本）。
 */
import { createRandom } from './random.js';
import { SEEDS, WORLD } from './constants.js';

const BRAIN = WORLD.brain;
const CENTER_X = BRAIN.center[0];
const CENTER_Y = BRAIN.center[1];
const CENTER_Z = BRAIN.center[2];
const COS_YAW = Math.cos(BRAIN.yaw);
const SIN_YAW = Math.sin(BRAIN.yaw);

/** 脑回起伏：确定性多频正弦 + 折痕（不是光滑椭球）。 */
function cortexFold(phi, theta) {
  return (
    0.062 * Math.sin(5.0 * phi + 2.1) * Math.sin(3.0 * theta + 0.7) +
    0.04 * Math.sin(9.0 * theta + 4.0 * phi) +
    0.025 * Math.sin(17.0 * phi + 6.0 * theta) +
    0.015 * Math.sin(29.0 * theta + 11.0 * phi) -
    0.036 * Math.pow(Math.abs(Math.sin(7.0 * phi + 3.0 * theta)), 4)
  );
}

/**
 * 写入 brain 布局（positions / intensities / kinds）。
 * @param {{ positions: Float32Array, intensities: Float32Array, kinds: Float32Array }} target
 * @param {number} count
 */
export function writeBrainLayout(target, count) {
  const positions = target.positions;
  const intensities = target.intensities;
  const kinds = target.kinds;
  const random = createRandom(SEEDS.brain);

  for (let i = 0; i < count; i += 1) {
    const offset = i * 3;
    const roll = random.next();
    let x = 0;
    let y = 0;
    let z = 0;
    let intensity = 1;
    let kind = 1;

    if (roll < 0.84) {
      // —— 大脑半球：左右各一个椭球体，中线处自然形成纵裂 ——
      const side = random.next() < 0.5 ? -1 : 1;
      const shell = random.next() < 0.82;
      const phi = Math.acos(random.next() * 2 - 1);
      const theta = random.next() * Math.PI * 2;
      const dx = Math.sin(phi) * Math.cos(theta);
      const dy = Math.cos(phi);
      const dz = Math.sin(phi) * Math.sin(theta);
      const fold = cortexFold(phi, theta);
      const shellRadius = shell ? 0.965 + random.next() * 0.06 : 0.4 + random.next() * 0.5;
      const radius = shellRadius * (1 + fold);

      // 每个半球：中心 x=±0.30，半轴 (0.40, 0.575, 0.80)
      let xLocal = dx * 0.40 * radius;
      y = dy * 0.575 * radius;
      z = dz * 0.8 * radius;

      // 额叶/枕叶收窄、颞叶外扩只作用在半球自身半径上，不平移半球中心
      const front = Math.max(0, dz);
      const back = Math.max(0, -dz);
      xLocal *= 1 - 0.11 * front * front - 0.06 * back * back;
      if (dy < -0.05 && dy > -0.62) xLocal *= 1.13;

      x = side * 0.3 + xLocal;

      // 纵裂：中线附近（表层 + 内部）的粒子一起向两侧让出沟槽，
      // 让裂缝贯穿整个脑体积，而不只是表面的一道折痕。
      {
        const inner = Math.exp(-(x * x) / 0.011);
        const upper = Math.min(1, Math.max(0, (y + 0.08) / 0.42));
        const groove = inner * upper * (shell ? 1 : 0.6);
        x += side * groove * 0.05;
        y -= groove * 0.018;
        z -= groove * 0.012;
      }

      // 顶部双凸：半球外侧略高，中线（纵裂）略低。
      y += Math.min(1, Math.abs(x) / 0.42) * Math.max(0, dy) * 0.035;
      // 底部压平，避免变成完整椭球；同时略向下补足颞叶底部，减少“心形”缺口。
      if (y < -0.38) y = -0.38 + (y + 0.38) * 0.32;

      intensity = shell ? 0.45 + random.next() * 0.35 : 0.24 + random.next() * 0.22;
      if (random.next() < 0.02) intensity = 0.95;
      kind = random.next() < 0.055 ? 0 : 1;
    } else if (roll < 0.94) {
      // —— 小脑：后下方左右两个带皱褶的小叶 ——
      const side = random.next() < 0.5 ? -1 : 1;
      const cphi = Math.acos(random.next() * 2 - 1);
      const ctheta = random.next() * Math.PI * 2;
      const cdx = Math.sin(cphi) * Math.cos(ctheta);
      const cdy = Math.cos(cphi);
      const cdz = Math.sin(cphi) * Math.sin(ctheta);
      const crease = 1 + 0.08 * Math.sin(13 * ctheta) * Math.sin(9 * cphi) + 0.05 * Math.sin(23 * cphi + 5 * ctheta);
      const cr = 0.88 + random.next() * 0.16;
      x = side * (0.2 + 0.155 * cdx * cr);
      y = -0.44 + 0.125 * cdy * cr * crease;
      z = -0.56 + 0.185 * cdz * cr * crease;
      intensity = 0.4 + random.next() * 0.25;
      kind = random.next() < 0.08 ? 0 : 1;
    } else {
      // —— 脑干：向下收窄的稀疏粒子柱 ——
      const t = random.next();
      const angle = random.next() * Math.PI * 2;
      const taper = 0.072 * (1 - 0.55 * t);
      x = Math.cos(angle) * taper * 0.9;
      y = -0.4 - t * 0.26;
      z = -0.3 - t * 0.1 + Math.sin(angle) * taper * 0.3;
      intensity = 0.3 + random.next() * 0.2;
      kind = 1;
    }

    positions[offset] = x * COS_YAW + z * SIN_YAW + CENTER_X;
    positions[offset + 1] = y + CENTER_Y;
    positions[offset + 2] = -x * SIN_YAW + z * COS_YAW + CENTER_Z;
    intensities[i] = intensity;
    kinds[i] = kind;
  }
}
