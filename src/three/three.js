/**
 * Three.js 加载器：本地 vendor 优先，CDN 回退。
 *
 * 本模块使用**顶层 await**：createScene.js 静态 import 本模块，因此
 * `await import('./three/createScene.js')` 会自然等待 Three.js 就绪。
 * 两条路径都失败时异常向上冒泡，由 main.js 捕获并进入 2D 降级。
 */

const VENDOR_URL = new URL('../../vendor/three.module.js', import.meta.url).href;
const CDN_URL = 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';

/**
 * 只用 HEAD 探测本地 vendor 是否存在：不下载、不解析，失败即回退 CDN。
 * @returns {Promise<boolean>}
 */
async function hasLocalVendor() {
  try {
    const response = await fetch(VENDOR_URL, { method: 'HEAD', cache: 'no-store' });
    return response.ok;
  } catch {
    return false;
  }
}

let source = 'vendor';
let module = null;

if (await hasLocalVendor()) {
  try {
    module = await import(VENDOR_URL);
  } catch (error) {
    // 本地文件损坏、版本不匹配或被静态服务器改写时回退，而不是整页失败。
    console.warn('[scene] 本地 Three.js 不可用，回退到 CDN：', error?.message ?? error);
    module = null;
  }
}

if (!module) {
  source = 'cdn';
  // CDN 失败不捕获：异常必须冒泡给 main.js，由它切换到 2D 降级。
  module = await import(CDN_URL);
}

export const THREE = module;
export const threeSource = source;
