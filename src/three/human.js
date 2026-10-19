/**
 * 坐姿阅读的低多边形人物（程序化几何体，无贴图、无 PNG）。
 *
 * 世界坐标锚点：坐在桌前 z≈1.05、面向 -z、头部中心 (0, 1.36, 1.0)、头部微低；
 * 双手扶在打开的书页上。人物始终留在场景里，后续章节只通过 humanFade 与灯光
 * 自然弱化，不隐藏、不重置位置。
 */
import { PALETTE } from './constants.js';

const UP = { x: 0, y: 1, z: 0 };

/**
 * @param {{ THREE: any, resources: any }} options
 */
export function createHuman({ THREE, resources }) {
  const group = new THREE.Group();
  group.name = 'human';
  // 略偏书桌右侧落座（头部中心 x≈0.07，仍在 architecture.md 的"约 (0,1.36,1.0)"范围内），
  // 这样从摄像机侧看书页不会被躯干完全挡住。
  group.position.set(0.07, 0, 0);
  const background = new THREE.Color(PALETTE.background);
  const up = new THREE.Vector3(UP.x, UP.y, UP.z);

  /** @param {Record<string, any>} params */
  const material = (params) =>
    resources.add(
      new THREE.MeshStandardMaterial({
        roughness: 0.86,
        metalness: 0.02,
        flatShading: true,
        // 始终处于透明队列：humanFade 用 opacity + 颜色一起弱化，避免人物突然消失。
        transparent: true,
        ...params,
      })
    );

  const cloth = material({ color: PALETTE.cloth });
  const clothDark = material({ color: PALETTE.clothDark });
  const trouser = material({ color: PALETTE.trouser });
  const skin = material({ color: PALETTE.skin, roughness: 0.72 });
  const hair = material({ color: PALETTE.hair, roughness: 0.62, metalness: 0.08 });
  const shoe = material({ color: PALETTE.shoe, roughness: 0.7 });

  /** @param {any} geometry @param {any} targetMaterial @param {number[]} position @param {number[]} [rotation] @param {number[]} [scale] */
  const add = (geometry, targetMaterial, position, rotation, scale) => {
    resources.add(geometry);
    const mesh = new THREE.Mesh(geometry, targetMaterial);
    mesh.position.set(position[0], position[1], position[2]);
    if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
    if (scale) mesh.scale.set(scale[0], scale[1], scale[2]);
    group.add(mesh);
    return mesh;
  };

  /** 用圆柱体在两点之间生成一段肢体（低分段 = 低多边形）。 */
  const limb = (a, b, radiusTop, radiusBottom, targetMaterial, segments = 6) => {
    const start = new THREE.Vector3(a[0], a[1], a[2]);
    const end = new THREE.Vector3(b[0], b[1], b[2]);
    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();
    const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, length, segments, 1);
    resources.add(geometry);
    const mesh = new THREE.Mesh(geometry, targetMaterial);
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(up, direction.normalize());
    group.add(mesh);
    return mesh;
  };

  // —— 躯干与服装 ——
  const pelvis = add(new THREE.BoxGeometry(0.3, 0.18, 0.26), trouser, [0, 0.8, 1.06]);
  const chest = add(new THREE.CylinderGeometry(0.16, 0.195, 0.46, 7), cloth, [0, 1.01, 1.03], [-0.09, 0, 0]);
  add(new THREE.BoxGeometry(0.34, 0.08, 0.26), clothDark, [0, 0.8, 1.05]);
  add(new THREE.CylinderGeometry(0.09, 0.095, 0.05, 8), clothDark, [0, 1.235, 1.015]);
  add(new THREE.CylinderGeometry(0.044, 0.05, 0.1, 6), skin, [0, 1.275, 1.005], [-0.08, 0, 0]);

  // —— 头部与头发（无明显面部特征）——
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.36, 1.0);
  headGroup.rotation.set(-0.3, 0, 0.03);
  const head = new THREE.Mesh(resources.add(new THREE.IcosahedronGeometry(0.115, 1)), skin);
  head.scale.set(1, 1.06, 1.02);
  headGroup.add(head);
  const hairCap = new THREE.Mesh(
    resources.add(new THREE.SphereGeometry(0.127, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.62)),
    hair
  );
  hairCap.position.set(0, 0.006, 0.002);
  hairCap.rotation.x = -0.08;
  headGroup.add(hairCap);
  // 后脑的头发体积整体包住头部，避免从背后露出肤色（低多边形发型）。
  const hairBack = new THREE.Mesh(resources.add(new THREE.IcosahedronGeometry(0.119, 1)), hair);
  hairBack.position.set(0, -0.003, 0.03);
  hairBack.rotation.x = -0.1;
  headGroup.add(hairBack);
  const fringe = new THREE.Mesh(resources.add(new THREE.BoxGeometry(0.21, 0.04, 0.06)), hair);
  fringe.position.set(0, 0.088, -0.058);
  fringe.rotation.x = 0.2;
  headGroup.add(fringe);
  group.add(headGroup);

  // —— 手臂与手：双手落在书页上 ——
  const shoulderLeft = [-0.19, 1.2, 1.01];
  const shoulderRight = [0.19, 1.2, 1.01];
  const elbowLeft = [-0.27, 1.02, 0.8];
  const elbowRight = [0.12, 1.02, 0.8];
  const wristLeft = [-0.43, 0.85, 0.41];
  const wristRight = [-0.17, 0.85, 0.42];

  add(new THREE.IcosahedronGeometry(0.072, 1), cloth, shoulderLeft);
  add(new THREE.IcosahedronGeometry(0.072, 1), cloth, shoulderRight);
  limb(shoulderLeft, elbowLeft, 0.052, 0.046, cloth);
  limb(shoulderRight, elbowRight, 0.052, 0.046, cloth);
  add(new THREE.IcosahedronGeometry(0.05, 1), skin, elbowLeft);
  add(new THREE.IcosahedronGeometry(0.05, 1), skin, elbowRight);
  limb(elbowLeft, wristLeft, 0.045, 0.035, skin);
  limb(elbowRight, wristRight, 0.045, 0.035, skin);

  const handLeft = add(new THREE.BoxGeometry(0.07, 0.028, 0.1), skin, [-0.45, 0.8, 0.4], [-0.12, 0.12, 0.25]);
  const handRight = add(new THREE.BoxGeometry(0.07, 0.028, 0.1), skin, [-0.155, 0.802, 0.42], [-0.12, -0.12, -0.25]);
  add(new THREE.BoxGeometry(0.042, 0.014, 0.02), skin, [-0.405, 0.795, 0.372], [0, 0.1, -0.18]);
  add(new THREE.BoxGeometry(0.042, 0.014, 0.02), skin, [-0.405, 0.795, 0.428], [0, 0.1, -0.18]);
  add(new THREE.BoxGeometry(0.042, 0.014, 0.02), skin, [-0.2, 0.796, 0.392], [0, -0.1, 0.18]);
  add(new THREE.BoxGeometry(0.042, 0.014, 0.02), skin, [-0.2, 0.796, 0.448], [0, -0.1, 0.18]);

  // —— 腿与鞋（坐姿）——
  add(new THREE.IcosahedronGeometry(0.075, 1), trouser, [-0.1, 0.79, 1.04]);
  add(new THREE.IcosahedronGeometry(0.075, 1), trouser, [0.1, 0.79, 1.04]);
  limb([-0.1, 0.79, 1.04], [-0.11, 0.74, 0.76], 0.08, 0.068, trouser);
  limb([0.1, 0.79, 1.04], [0.11, 0.74, 0.76], 0.08, 0.068, trouser);
  add(new THREE.IcosahedronGeometry(0.066, 1), trouser, [-0.11, 0.74, 0.76]);
  add(new THREE.IcosahedronGeometry(0.066, 1), trouser, [0.11, 0.74, 0.76]);
  limb([-0.11, 0.74, 0.76], [-0.115, 0.1, 0.72], 0.062, 0.046, trouser);
  limb([0.11, 0.74, 0.76], [0.115, 0.1, 0.72], 0.062, 0.046, trouser);
  add(new THREE.BoxGeometry(0.105, 0.06, 0.22), shoe, [-0.115, 0.033, 0.66], [0, 0.08, 0]);
  add(new THREE.BoxGeometry(0.105, 0.06, 0.22), shoe, [0.115, 0.033, 0.66], [0, -0.08, 0]);

  // 阴影只由桌面端主光使用；移动端 shadowMap 关闭，这些标记不会产生开销。
  group.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = true;
      object.receiveShadow = false;
    }
  });

  // 弱化用：记录每种材质的基础颜色（linear），逐帧向背景色过渡。
  const fadeEntries = [cloth, clothDark, trouser, skin, hair, shoe].map((targetMaterial) => ({
    material: targetMaterial,
    r: targetMaterial.color.r,
    g: targetMaterial.color.g,
    b: targetMaterial.color.b,
  }));
  const backgroundR = background.r;
  const backgroundG = background.g;
  const backgroundB = background.b;

  const headBaseTilt = -0.3;
  const headBaseY = 1.36;

  return {
    group,
    /**
     * @param {number} elapsed
     * @param {number} fade 1 = 完全可见，0 = 完全融入背景（叙事层面的弱化）
     * @param {boolean} reducedMotion
     * @param {number} [worldFade=1] 终幕整体淡出系数：0 = 连同背景一起消失
     */
    update(elapsed, fade, reducedMotion, worldFade = 1) {
      const motion = reducedMotion ? 0 : 1;
      const breath = Math.sin(elapsed * 1.55) * motion;
      const sway = Math.sin(elapsed * 0.31) * motion;

      // 轻微呼吸与头部姿态，只影响环境观感，不参与章节状态。
      chest.scale.set(1 + breath * 0.006, 1 + breath * 0.012, 1 + breath * 0.006);
      headGroup.rotation.x = headBaseTilt + breath * 0.012;
      headGroup.rotation.y = sway * 0.022;
      headGroup.position.y = headBaseY + breath * 0.0022;
      handLeft.rotation.z = 0.25 + breath * 0.008;
      handRight.rotation.z = -0.25 - breath * 0.008;

      // humanFade：颜色向深色背景过渡，人物留在原位，不会突然消失。
      const clampedFade = fade < 0 ? 0 : fade > 1 ? 1 : fade;
      const clampedWorld = worldFade < 0 ? 0 : worldFade > 1 ? 1 : worldFade;
      const dim = 1 - clampedFade;
      for (let i = 0; i < fadeEntries.length; i += 1) {
        const entry = fadeEntries[i];
        entry.material.color.setRGB(
          entry.r + (backgroundR - entry.r) * dim,
          entry.g + (backgroundG - entry.g) * dim,
          entry.b + (backgroundB - entry.b) * dim
        );
        // 终幕 worldFade → 0 时人物完全退场，只留数字大脑。
        entry.material.opacity = (0.05 + clampedFade * 0.95) * clampedWorld;
      }
    },
  };
}
