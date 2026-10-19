/**
 * 书页文字细线的确定性生成：book.js（可见文字）与 particleLayouts.js（bookPage 粒子）
 * 共用同一份线段表，因此「文字浮起为粒子」在空间上严格对应。
 *
 * 纯数学模块，不依赖 three，可在 Node 中直接测试。
 */
import { createRandom } from './random.js';
import { SEEDS, WORLD } from './constants.js';

/** 打开的书：左页 x∈[-0.52,-0.28]、右页 x∈[-0.28,-0.04]、z∈[0.12,0.54]。 */
export const PAGE = Object.freeze({
  rows: 14,
  z0: WORLD.book.z0 + 0.018,
  z1: WORLD.book.z1 - 0.018,
  topY: WORLD.book.pageTopY,
  particleY: WORLD.book.particleY,
  pages: Object.freeze([
    Object.freeze({ x0: WORLD.book.leftPage.x0 + 0.014, x1: WORLD.book.leftPage.x1 - 0.012 }),
    Object.freeze({ x0: WORLD.book.rightPage.x0 + 0.012, x1: WORLD.book.rightPage.x1 - 0.014 }),
  ]),
});

/**
 * 文字线段表：每页 14 行、每行 3–5 个「词」线段，行距与页宽固定。
 * @type {ReadonlyArray<{ page: number, row: number, z: number, x0: number, x1: number, glow: number }>}
 */
export const TEXT_SEGMENTS = (() => {
  const random = createRandom(SEEDS.pageText);
  const segments = [];
  const rowGap = (PAGE.z1 - PAGE.z0) / PAGE.rows;

  for (let page = 0; page < PAGE.pages.length; page += 1) {
    const bounds = PAGE.pages[page];
    const width = bounds.x1 - bounds.x0;
    for (let row = 0; row < PAGE.rows; row += 1) {
      const z = PAGE.z0 + (row + 0.5) * rowGap;
      const words = 3 + Math.floor(random.next() * 3);
      // 最后两行更短，像段落收尾。
      const fill = row >= PAGE.rows - 2 ? 0.55 + random.next() * 0.2 : 1;
      const usable = width * fill;
      let cursor = 0;
      for (let word = 0; word < words; word += 1) {
        const gap = 0.012 + random.next() * 0.018;
        const length = Math.max(0.016, usable / words - gap + random.next() * 0.018);
        const x0 = bounds.x0 + cursor + gap;
        const x1 = Math.min(bounds.x0 + usable, x0 + length);
        if (x1 > x0 + 0.006) {
          segments.push({ page, row, z, x0, x1, glow: 0.1 + (row / (PAGE.rows - 1)) * 0.8 });
        }
        cursor += gap + length;
        if (bounds.x0 + cursor >= bounds.x1) break;
      }
    }
  }

  return Object.freeze(segments);
})();

/**
 * 把一颗粒子放到某条文字细线上（写入 out 的 offset 处，零分配）。
 * 复用同一份 TEXT_SEGMENTS，保证粒子与可见文字同源。
 * @param {{ next: () => number }} random
 * @param {Float32Array} out
 * @param {number} offset
 */
export function samplePageParticle(random, out, offset) {
  const segments = TEXT_SEGMENTS;
  const index = Math.min(segments.length - 1, Math.floor(random.next() * segments.length));
  const segment = segments[index];
  const along = random.next();
  out[offset] = segment.x0 + (segment.x1 - segment.x0) * along;
  out[offset + 1] = PAGE.particleY + (random.next() - 0.5) * 0.006;
  out[offset + 2] = segment.z + (random.next() - 0.5) * 0.011;
}
