/**
 * 灯光组：暖色主光（人脑/书桌侧）+ 冷色轮廓光（数字侧）+ 屏幕/书页/大脑局部光。
 *
 * 硬约束：桌面最多 2 个投射阴影光源，这里只让暖色主光投影；
 * 移动端 / 低端设备（profile.shadows === false）完全不启用阴影。
 * 所有强度都是标量更新，不在帧路径里创建对象。
 */
import { PALETTE, WORLD } from './constants.js';

/**
 * @param {{ THREE: any, scene: any, profile: { shadows: boolean }, resources: any }} options
 */
export function createLighting({ THREE, scene, profile, resources }) {
  const group = new THREE.Group();
  group.name = 'lighting';
  scene.add(group);

  const hemisphere = new THREE.HemisphereLight(PALETTE.coolKey, 0x2a1a10, 0.5);
  group.add(hemisphere);

  const key = new THREE.DirectionalLight(PALETTE.warmKey, 2.2);
  key.position.set(2.6, 3.8, 2.7);
  key.target.position.set(-0.1, 1.0, 0.5);
  group.add(key);
  group.add(key.target);

  if (profile.shadows) {
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 10;
    key.shadow.camera.left = -3;
    key.shadow.camera.right = 3;
    key.shadow.camera.top = 3;
    key.shadow.camera.bottom = -3;
    key.shadow.bias = -0.0012;
    key.shadow.normalBias = 0.025;
    key.shadow.radius = 2;
  }

  // 摄像机侧的弱暖色补光：让阅读者背部与桌面有可读层次，不投影。
  const fill = new THREE.DirectionalLight(0xffe0bd, 0.45);
  fill.position.set(1.4, 2.6, 4.6);
  fill.target.position.set(-0.1, 1.1, 0.7);
  group.add(fill);
  group.add(fill.target);

  const rim = new THREE.DirectionalLight(PALETTE.coolKey, 0.8);
  rim.position.set(-2.9, 2.6, -2.4);
  rim.target.position.set(0, 1.1, 0.7);
  group.add(rim);
  group.add(rim.target);

  const screenLight = new THREE.PointLight(PALETTE.screenGlow, 0, 3.1, 2);
  screenLight.position.set(WORLD.screen.center[0], WORLD.screen.center[1] + 0.02, WORLD.screen.center[2] + 0.42);
  group.add(screenLight);

  const bookLight = new THREE.PointLight(PALETTE.bookWarm, 0, 2.1, 2);
  bookLight.position.set(WORLD.book.center[0], 1.02, WORLD.book.center[2] + 0.3);
  group.add(bookLight);

  const brainLight = new THREE.PointLight(PALETTE.brainIce, 0, 5.2, 2);
  brainLight.position.set(WORLD.brain.center[0], WORLD.brain.center[1], WORLD.brain.center[2]);
  group.add(brainLight);

  // 预分配颜色对象，帧路径只做 copy/lerp。
  const warmSky = new THREE.Color(0xffc79a);
  const coolSky = new THREE.Color(PALETTE.coolKey);
  const warmKeyColor = new THREE.Color(PALETTE.warmKey);
  const coolKeyColor = new THREE.Color(PALETTE.coolKey);

  let shadowDisposed = false;

  return {
    group,
    /**
     * @param {{ warmLight: number, coolLight: number, ambient: number, coolBlend: number,
     *   particleIntensity: number, bookGlow: number, pageGlow: number, screenPower: number,
     *   brainGlow: number }} values
     * @param {number} elapsed
     * @param {boolean} reducedMotion
     */
    update(values, elapsed, reducedMotion) {
      const motion = reducedMotion ? 0 : 1;
      const breathe = 1 + Math.sin(elapsed * 1.25) * 0.012 * motion;
      const shimmer = 1 + Math.sin(elapsed * 0.9 + 1.7) * 0.025 * motion;

      hemisphere.intensity = 0.2 + values.ambient * 1.1;
      hemisphere.color.copy(warmSky).lerp(coolSky, values.coolBlend * 0.9);
      key.intensity = values.warmLight * 1.3 * breathe;
      fill.intensity = 0.35 + values.ambient * 0.3;
      key.color.copy(warmKeyColor).lerp(coolKeyColor, values.coolBlend * 0.4);
      rim.intensity = values.coolLight * 0.5 * shimmer;
      screenLight.intensity = values.screenPower * values.coolLight * 1.9;
      bookLight.intensity = values.bookGlow * 0.9 + values.pageGlow * 0.7 + values.warmLight * 0.12;
      brainLight.intensity = values.brainGlow * 2.2 * shimmer;
    },
    /** 一次性降级：关闭阴影并释放 shadow map，可重复调用。 */
    degrade() {
      key.castShadow = false;
      if (!shadowDisposed) {
        shadowDisposed = true;
        if (key.shadow.map) {
          key.shadow.map.dispose();
          key.shadow.map = null;
        }
      }
    },
    dispose() {
      if (key.shadow.map) {
        key.shadow.map.dispose();
        key.shadow.map = null;
      }
      shadowDisposed = true;
    },
  };
}
