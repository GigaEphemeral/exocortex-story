/**
 * 摄像机状态表：唯一一份扁平摄像机参数，供 chapterConfig 的 cameraFrom / cameraTo 引用。
 *
 * 字段：
 * - position: 摄像机世界坐标 [x, y, z]
 * - target:   视线观察点 [x, y, z]
 * - fov:      垂直视角（度）
 *
 * 章节切换时 position / target / fov 都按同一 chapterProgress 线性插值，
 * 反向滚动沿同一条路径返回，不存在「瞬移」。
 */

export const cameraStateKeys = Object.freeze(['position', 'target', 'fov']);

/** @typedef {{ position: readonly number[], target: readonly number[], fov: number }} CameraState */

/**
 * @param {number} px @param {number} py @param {number} pz
 * @param {number} tx @param {number} ty @param {number} tz
 * @param {number} fov
 * @returns {CameraState}
 */
const camera = (px, py, pz, tx, ty, tz, fov) =>
  Object.freeze({
    position: Object.freeze([px, py, pz]),
    target: Object.freeze([tx, ty, tz]),
    fov,
  });

export const cameraStates = Object.freeze({
  humanWide: camera(0, 2.05, 5.4, 0, 1.0, 0.55, 40),
  humanMedium: camera(0.45, 1.75, 3.7, 0, 1.05, 0.6, 38),
  bookCloseup: camera(-0.1, 1.3, 1.45, -0.28, 0.86, 0.38, 34),
  bookMid: camera(0.05, 1.5, 2.3, -0.15, 0.95, 0.45, 35),
  conceptView: camera(1.15, 1.75, 2.5, -0.05, 1.2, 0.7, 38),
  conceptMid: camera(1.5, 1.9, 2.4, 0.15, 1.2, 0.7, 39),
  computerCloseup: camera(0.8, 1.3, 1.6, 0.6, 0.98, 0.2, 34),
  computerMid: camera(1.15, 1.65, 2.6, 0.4, 1.05, 0.35, 38),
  networkMid: camera(1.9, 1.95, 3.1, 0.25, 1.15, 0.6, 41),
  conflictView: camera(1.5, 1.85, 2.7, 0.15, 1.15, 0.6, 39),
  networkWide: camera(2.6, 2.5, 5.0, 0.1, 1.2, 0.7, 45),
  brainView: camera(2.2, 2.3, 5.2, 0, 1.5, 0.8, 42),
  brainFinal: camera(0.6, 1.9, 4.6, 0, 1.55, 0.85, 40),
});
