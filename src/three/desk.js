/**
 * 书桌、椅子、地板：程序化几何体，深色木质 + 冷金属。
 * 桌面顶面 y = 0.74、约 1.8 × 0.06 × 0.9（docs/architecture.md 世界坐标锚点）。
 */
import { PALETTE, WORLD } from './constants.js';

/**
 * @param {{ THREE: any, resources: any }} options
 */
export function createDesk({ THREE, resources }) {
  const group = new THREE.Group();
  group.name = 'desk';

  const wood = resources.add(
    new THREE.MeshStandardMaterial({ color: PALETTE.wood, roughness: 0.78, metalness: 0.04 })
  );
  const woodDark = resources.add(
    new THREE.MeshStandardMaterial({ color: PALETTE.woodDark, roughness: 0.85, metalness: 0.05 })
  );
  const metal = resources.add(
    new THREE.MeshStandardMaterial({ color: PALETTE.metal, roughness: 0.55, metalness: 0.55 })
  );
  // 程序化径向衰减纹理（DataTexture，无外部图片）：地板边缘淡出到背景。
  const fadeSize = 128;
  const fadeData = new Uint8Array(fadeSize * fadeSize * 4);
  for (let y = 0; y < fadeSize; y += 1) {
    for (let x = 0; x < fadeSize; x += 1) {
      const u = (x + 0.5) / fadeSize - 0.5;
      const v = (y + 0.5) / fadeSize - 0.5;
      const radius = Math.sqrt(u * u + v * v) * 2;
      const t = Math.min(1, Math.max(0, (radius - 0.58) / (0.94 - 0.58)));
      const falloff = 1 - t * t * (3 - 2 * t);
      const value = Math.round(falloff * 255);
      const offset = (y * fadeSize + x) * 4;
      fadeData[offset] = value;
      fadeData[offset + 1] = value;
      fadeData[offset + 2] = value;
      fadeData[offset + 3] = 255;
    }
  }
  const fadeTexture = resources.add(new THREE.DataTexture(fadeData, fadeSize, fadeSize, THREE.RGBAFormat));
  fadeTexture.magFilter = THREE.LinearFilter;
  fadeTexture.minFilter = THREE.LinearFilter;
  fadeTexture.needsUpdate = true;

  const floorMaterial = resources.add(
    new THREE.MeshStandardMaterial({
      color: PALETTE.floor,
      roughness: 1,
      metalness: 0,
      alphaMap: fadeTexture,
      transparent: true,
      depthWrite: false,
    })
  );

  /** @param {any} geometry @param {any} material @param {[number, number, number]} position */
  const add = (geometry, material, position, rotation) => {
    resources.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position[0], position[1], position[2]);
    if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
    group.add(mesh);
    return mesh;
  };

  // 桌面
  const top = add(new THREE.BoxGeometry(WORLD.desk.size[0], WORLD.desk.size[1], WORLD.desk.size[2]), wood, [0, 0.71, 0]);
  top.castShadow = true;
  top.receiveShadow = true;

  // 桌沿 / 围板
  add(new THREE.BoxGeometry(1.7, 0.11, 0.05), woodDark, [0, 0.645, 0.4]);
  add(new THREE.BoxGeometry(1.7, 0.11, 0.05), woodDark, [0, 0.645, -0.4]);
  add(new THREE.BoxGeometry(0.05, 0.11, 0.78), woodDark, [0.84, 0.645, 0]);
  add(new THREE.BoxGeometry(0.05, 0.11, 0.78), woodDark, [-0.84, 0.645, 0]);

  // 四条桌腿
  for (const x of [-0.82, 0.82]) {
    for (const z of [-0.38, 0.38]) {
      const leg = add(new THREE.BoxGeometry(0.075, 0.68, 0.075), woodDark, [x, 0.34, z]);
      leg.castShadow = true;
    }
  }

  // 椅子（座面比桌面低，人物坐姿锚点 y≈0.78）
  const seat = add(new THREE.BoxGeometry(0.46, 0.05, 0.42), woodDark, [0, 0.685, 1.12]);
  seat.castShadow = true;
  for (const x of [-0.19, 0.19]) {
    for (const z of [0.94, 1.3]) {
      add(new THREE.BoxGeometry(0.035, 0.66, 0.035), metal, [x, 0.33, z]);
    }
  }

  // 地板
  // 地板边缘用程序化径向 alphaMap 渐渐淡出到背景，避免出现"房间边缘"的地平线。
  const floor = add(new THREE.PlaneGeometry(14, 14), floorMaterial, [0, 0, 0], [-Math.PI / 2, 0, 0]);
  floor.receiveShadow = true;

  return { group };
}
