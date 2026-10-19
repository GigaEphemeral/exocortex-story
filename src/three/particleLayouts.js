/**
 * 12 种持久粒子布局（固定种子、纯数学、零 three 依赖）。
 *
 * 每颗粒子的**身份由索引固定**：同一索引在 12 个布局中代表同一颗粒子，
 * 章节切换时粒子系统只做 lerp(fromLayout, toLayout, t)，因此：
 * - 不会随机重生粒子；
 * - 正向/反向滚动看到同一条路径；
 * - 布局只改目标缓冲，活动缓冲与 Points/BufferGeometry 始终复用。
 *
 * 布局语义与空间锚点（docs/architecture.md 3.3 / memory_animation.md 5.1）：
 * bookPage → lifted → clusters → concepts → screen → retrieval → replay
 * → conflict → archive → networkWide → brainSeed → brain
 */
import { createRandom } from './random.js';
import { LAYOUT_NAMES, WORLD, layoutSeed } from './constants.js';
import { samplePageParticle } from './pageText.js';
import { writeBrainLayout } from './brain.js';

const NETWORK_MIN = WORLD.network.min;
const NETWORK_MAX = WORLD.network.max;

/** 局部记忆簇：固定中心，避免每个章节重新随机。 */
const MEMORY_CLUSTERS = Object.freeze([
  Object.freeze([-0.86, 1.12, 0.42, 1]),
  Object.freeze([-0.18, 1.52, 0.72, 0]),
  Object.freeze([0.52, 1.1, 0.38, 1]),
  Object.freeze([0.98, 1.66, 0.86, 0]),
  Object.freeze([-0.52, 1.82, 0.98, 0]),
  Object.freeze([0.18, 0.98, 0.28, 1]),
]);

const CONCEPT_ANCHORS = Object.freeze([
  Object.freeze([-1.05, 1.66, 0.9]),
  Object.freeze([-0.28, 1.78, 0.98]),
  Object.freeze([0.62, 1.62, 0.88]),
  Object.freeze([-1.12, 1.34, 0.72]),
  Object.freeze([-0.1, 1.4, 0.8]),
  Object.freeze([0.86, 1.28, 0.66]),
  Object.freeze([-0.72, 1.06, 0.52]),
  Object.freeze([0.16, 1.1, 0.6]),
  Object.freeze([0.94, 0.98, 0.45]),
]);

const CLUSTER_RADII = Object.freeze([0.14, 0.11, 0.16, 0.12, 0.13, 0.1]);

/** 检索激活：沿一条穿过网络的确定性查询路径。 */
const RETRIEVAL_NODES = Object.freeze([
  Object.freeze([-1.05, 1.55, 0.75]),
  Object.freeze([-0.35, 1.85, 0.6]),
  Object.freeze([0.4, 1.6, 0.55]),
  Object.freeze([1.0, 1.35, 0.8]),
  Object.freeze([0.85, 1.9, 0.35]),
  Object.freeze([-0.75, 1.1, 0.4]),
  Object.freeze([0.1, 1.15, 0.95]),
]);

/** 离线重放：围绕屏幕方向的数层轨道环。 */
const REPLAY_CENTER = Object.freeze([0.62, 1.24, 0.52]);
const REPLAY_RINGS = Object.freeze([
  Object.freeze([Object.freeze([1, 0, 0]), Object.freeze([0, 0.62, 0])]),
  Object.freeze([Object.freeze([0.8, 0.15, 0.3]), Object.freeze([0, 0.55, -0.2])]),
  Object.freeze([Object.freeze([0.62, -0.3, 0.42]), Object.freeze([0.12, 0.5, 0.28])]),
]);

/** 冲突：两个同时亮起的矛盾节点组。 */
const CONFLICT_A = Object.freeze([-0.72, 1.58, 0.58]);
const CONFLICT_B = Object.freeze([0.5, 1.3, 0.46]);

/** 归档：被弱化的信息移入左后方的归档区。 */
const ARCHIVE_CENTERS = Object.freeze([
  Object.freeze([1.15, 1.75, 0.75]),
  Object.freeze([0.45, 1.55, 0.55]),
  Object.freeze([0.95, 1.25, 0.4]),
  Object.freeze([0.15, 1.85, 0.85]),
  Object.freeze([-0.15, 1.25, 0.55]),
]);

/** 网络类布局的构图边界：超出会跑出网络广角镜头，统一收紧。 */
const NETWORK_LIMITS = Object.freeze({
  minX: -1.78,
  maxX: 1.78,
  minY: 0.55,
  maxY: 2.38,
  minZ: -0.42,
  maxZ: 1.45,
});

/** 只收紧位置，不动粒子身份与强度。 */
function clampToNetwork(layout, count) {
  const positions = layout.positions;
  for (let i = 0; i < count; i += 1) {
    const offset = i * 3;
    let value = positions[offset];
    if (value < NETWORK_LIMITS.minX) positions[offset] = NETWORK_LIMITS.minX;
    else if (value > NETWORK_LIMITS.maxX) positions[offset] = NETWORK_LIMITS.maxX;
    value = positions[offset + 1];
    if (value < NETWORK_LIMITS.minY) positions[offset + 1] = NETWORK_LIMITS.minY;
    else if (value > NETWORK_LIMITS.maxY) positions[offset + 1] = NETWORK_LIMITS.maxY;
    value = positions[offset + 2];
    if (value < NETWORK_LIMITS.minZ) positions[offset + 2] = NETWORK_LIMITS.minZ;
    else if (value > NETWORK_LIMITS.maxZ) positions[offset + 2] = NETWORK_LIMITS.maxZ;
  }
}

const SCREEN_COS = Math.cos(WORLD.screen.tilt);
const SCREEN_SIN = Math.sin(WORLD.screen.tilt);
const SCREEN_X = WORLD.screen.center[0];
const SCREEN_Y = WORLD.screen.center[1];
const SCREEN_Z = WORLD.screen.center[2];

/** @param {number} count */
function makeLayout(count) {
  return {
    positions: new Float32Array(count * 3),
    intensities: new Float32Array(count),
    kinds: new Float32Array(count),
  };
}

/** @param {{positions: Float32Array, intensities: Float32Array, kinds: Float32Array}} layout */
function write(layout, index, x, y, z, intensity, kind) {
  const offset = index * 3;
  layout.positions[offset] = x;
  layout.positions[offset + 1] = y;
  layout.positions[offset + 2] = z;
  layout.intensities[index] = intensity;
  layout.kinds[index] = kind;
}

/** 屏幕局部坐标 → 世界坐标（屏幕带 −0.12 rad 后仰）。 */
function writeScreenPoint(layout, index, lx, ly, lz, intensity, kind) {
  const offset = index * 3;
  layout.positions[offset] = SCREEN_X + lx;
  layout.positions[offset + 1] = SCREEN_Y + ly * SCREEN_COS - lz * SCREEN_SIN;
  layout.positions[offset + 2] = SCREEN_Z + ly * SCREEN_SIN + lz * SCREEN_COS;
  layout.intensities[index] = intensity;
  layout.kinds[index] = kind;
}

/** 书页：文字细线所在的纸面（与 book.js 可见文字同源）。 */
function writeBookPage(layout, count) {
  const random = createRandom(layoutSeed('bookPage'));
  for (let i = 0; i < count; i += 1) {
    const offset = i * 3;
    samplePageParticle(random, layout.positions, offset);
    layout.intensities[i] = 0.22 + random.next() * 0.28;
    layout.kinds[i] = random.next() < 0.16 ? 1 : 0;
  }
}

/** 浮起：书页文字离开纸面，向上、向读者方向上升。 */
function writeLifted(layout, count) {
  const random = createRandom(layoutSeed('lifted'));
  const bookX = WORLD.book.center[0];
  for (let i = 0; i < count; i += 1) {
    const offset = i * 3;
    samplePageParticle(random, layout.positions, offset);
    const baseX = layout.positions[offset];
    const baseY = layout.positions[offset + 1];
    const baseZ = layout.positions[offset + 2];
    const lift = 0.03 + Math.pow(random.next(), 1.35) * 0.62;
    const spread = 0.22 + lift * 0.55;
    const x = baseX + (random.next() - 0.5) * 0.18 * spread + (bookX - baseX) * 0.2;
    const y = baseY + lift;
    const z = baseZ + (random.next() - 0.5) * 0.2 * spread - lift * 0.22;
    write(layout, i, x, y, z, 0.45 + random.next() * 0.6, random.next() < 0.42 ? 1 : 0);
  }
}

/** 局部簇：相似的记忆被分开，簇与簇之间在空间上可辨识。 */
function writeClusters(layout, count) {
  const random = createRandom(layoutSeed('clusters'));
  for (let i = 0; i < count; i += 1) {
    const clusterIndex = i % MEMORY_CLUSTERS.length;
    const cluster = MEMORY_CLUSTERS[clusterIndex];
    const radius = CLUSTER_RADII[clusterIndex];
    const offset = i * 3;
    layout.positions[offset] = cluster[0] + random.gaussian() * radius;
    layout.positions[offset + 1] = cluster[1] + random.gaussian() * radius * 0.85;
    layout.positions[offset + 2] = cluster[2] + random.gaussian() * radius * 0.9;
    const kind = random.next() < 0.18 ? 1 - cluster[3] : cluster[3];
    layout.intensities[i] = i % 17 === 0 ? 1.15 : 0.55 + random.next() * 0.5;
    layout.kinds[i] = kind;
  }
}

/** 分层概念网络：概念节点 + 围绕它们的细节粒子，层级清晰。 */
function writeConcepts(layout, count) {
  const random = createRandom(layoutSeed('concepts'));
  for (let i = 0; i < count; i += 1) {
    const anchorIndex = i % CONCEPT_ANCHORS.length;
    const anchor = CONCEPT_ANCHORS[anchorIndex];
    const isConcept = i % 5 === 0;
    const offset = i * 3;
    let intensity;
    let kind = 1;
    if (isConcept) {
      layout.positions[offset] = anchor[0] + random.gaussian() * 0.025;
      layout.positions[offset + 1] = anchor[1] + random.gaussian() * 0.02;
      layout.positions[offset + 2] = anchor[2] + random.gaussian() * 0.025;
      intensity = 1.2 + random.next() * 0.3;
      if (anchorIndex % 4 === 3) kind = 0;
    } else {
      const spread = 0.1 + random.next() * 0.13;
      layout.positions[offset] = anchor[0] + random.gaussian() * spread;
      layout.positions[offset + 1] = anchor[1] + random.gaussian() * spread * 0.8;
      layout.positions[offset + 2] = anchor[2] + random.gaussian() * spread;
      intensity = 0.35 + random.next() * 0.4;
      if (random.next() < 0.18) kind = 0;
    }
    layout.intensities[i] = intensity;
    layout.kinds[i] = kind;
  }
}

/** 汇入屏幕：粒子落在发光的屏幕平面内，少量在屏幕前方形成接收光晕。 */
function writeScreen(layout, count) {
  const random = createRandom(layoutSeed('screen'));
  for (let i = 0; i < count; i += 1) {
    const halo = random.next() < 0.15;
    let lx;
    let ly;
    let lz;
    let intensity;
    if (halo) {
      lx = (random.next() - 0.5) * 0.76;
      ly = (random.next() - 0.5) * 0.54;
      lz = 0.05 + random.next() * 0.14;
      intensity = 0.55 + random.next() * 0.4;
    } else {
      const column = Math.floor(random.next() * 15);
      const row = Math.floor(random.next() * 11);
      lx = (column / 14 - 0.5) * 0.52 + (random.next() - 0.5) * 0.008;
      ly = (row / 10 - 0.5) * 0.34 + (random.next() - 0.5) * 0.008;
      lz = 0.016 + random.next() * 0.02;
      intensity = 0.85 + random.next() * 0.5;
    }
    writeScreenPoint(layout, i, lx, ly, lz, intensity, random.next() < 0.87 ? 1 : 0);
  }
}

/** 检索：查询脉冲沿既有连接传播，只有相关节点亮起。 */
function writeRetrieval(layout, count) {
  const random = createRandom(layoutSeed('retrieval'));
  for (let i = 0; i < count; i += 1) {
    const onQueryPath = random.next() < 0.22;
    const offset = i * 3;
    let intensity;
    let kind = 1;
    if (onQueryPath) {
      const t = random.next();
      const px = 0.72 - t * 1.5;
      const py = 1.05 + t * 0.85 + Math.sin(t * Math.PI * 2) * 0.18;
      const pz = 0.78 - t * 0.36 + Math.cos(t * Math.PI * 2) * 0.22;
      layout.positions[offset] = px + random.gaussian() * 0.02;
      layout.positions[offset + 1] = py + random.gaussian() * 0.02;
      layout.positions[offset + 2] = pz + random.gaussian() * 0.02;
      intensity = 1.3 + random.next() * 0.35;
    } else {
      const node = RETRIEVAL_NODES[i % RETRIEVAL_NODES.length];
      const spread = 0.14 + random.next() * 0.16;
      layout.positions[offset] = node[0] + random.gaussian() * spread;
      layout.positions[offset + 1] = node[1] + random.gaussian() * spread * 0.8;
      layout.positions[offset + 2] = node[2] + random.gaussian() * spread;
      intensity = random.next() < 0.06 ? 0.9 : 0.18 + random.next() * 0.28;
      if (random.next() < 0.12) kind = 0;
    }
    layout.intensities[i] = intensity;
    layout.kinds[i] = kind;
  }
}

/** 离线重放：局部网络沿轨道环重复激活，整体压暗。 */
function writeReplay(layout, count) {
  const random = createRandom(layoutSeed('replay'));
  for (let i = 0; i < count; i += 1) {
    const offset = i * 3;
    let x;
    let y;
    let z;
    if (random.next() < 0.62) {
      const ringIndex = i % REPLAY_RINGS.length;
      const ring = REPLAY_RINGS[ringIndex];
      const angle = random.next() * Math.PI * 2;
      const radius = 0.25 + ringIndex * 0.19;
      const cos = Math.cos(angle) * radius;
      const sin = Math.sin(angle) * radius;
      x = REPLAY_CENTER[0] + ring[0][0] * cos + ring[1][0] * sin;
      y = REPLAY_CENTER[1] + ring[0][1] * cos + ring[1][1] * sin;
      z = REPLAY_CENTER[2] + ring[0][2] * cos + ring[1][2] * sin;
    } else {
      x = REPLAY_CENTER[0] + random.gaussian() * 0.17;
      y = REPLAY_CENTER[1] + random.gaussian() * 0.15;
      z = REPLAY_CENTER[2] + random.gaussian() * 0.15;
    }
    const burst = i % 13 < 3;
    write(layout, i, x, y, z, burst ? 0.95 : 0.22 + random.next() * 0.18, random.next() < 0.85 ? 1 : 0);
  }
}

/** 冲突：两组矛盾节点同时亮起，中间以桥接线相连。 */
function writeConflict(layout, count) {
  const random = createRandom(layoutSeed('conflict'));
  for (let i = 0; i < count; i += 1) {
    const offset = i * 3;
    const roll = random.next();
    let x;
    let y;
    let z;
    let intensity;
    let kind;
    if (roll < 0.3) {
      const spread = 0.13;
      x = CONFLICT_A[0] + random.gaussian() * spread;
      y = CONFLICT_A[1] + random.gaussian() * spread;
      z = CONFLICT_A[2] + random.gaussian() * spread;
      intensity = 1.05 + random.next() * 0.3;
      kind = 1;
    } else if (roll < 0.6) {
      const spread = 0.13;
      x = CONFLICT_B[0] + random.gaussian() * spread;
      y = CONFLICT_B[1] + random.gaussian() * spread;
      z = CONFLICT_B[2] + random.gaussian() * spread;
      intensity = 1.05 + random.next() * 0.3;
      kind = 0;
    } else if (roll < 0.78) {
      x = CONFLICT_A[0] + random.gaussian() * 0.26;
      y = CONFLICT_A[1] + random.gaussian() * 0.2;
      z = CONFLICT_A[2] + random.gaussian() * 0.2;
      intensity = 0.5 + random.next() * 0.3;
      kind = 1;
    } else if (roll < 0.96) {
      x = CONFLICT_B[0] + random.gaussian() * 0.26;
      y = CONFLICT_B[1] + random.gaussian() * 0.2;
      z = CONFLICT_B[2] + random.gaussian() * 0.2;
      intensity = 0.5 + random.next() * 0.3;
      kind = 0;
    } else {
      const t = random.next();
      x = CONFLICT_A[0] + (CONFLICT_B[0] - CONFLICT_A[0]) * t + random.gaussian() * 0.05;
      y = CONFLICT_A[1] + (CONFLICT_B[1] - CONFLICT_A[1]) * t + random.gaussian() * 0.05;
      z = CONFLICT_A[2] + (CONFLICT_B[2] - CONFLICT_A[2]) * t + random.gaussian() * 0.05;
      intensity = i % 2 === 0 ? 1.25 : 0.45;
      kind = t < 0.5 ? 1 : 0;
    }
    write(layout, i, x, y, z, intensity, kind);
  }
}

/** 归档：一部分信息被移到左后方归档区并弱化，关键节点保留。 */
function writeArchive(layout, count) {
  const random = createRandom(layoutSeed('archive'));
  const min = WORLD.archive.min;
  const max = WORLD.archive.max;
  for (let i = 0; i < count; i += 1) {
    const offset = i * 3;
    if (random.next() < 0.38) {
      layout.positions[offset] = min[0] + random.next() * (max[0] - min[0]);
      layout.positions[offset + 1] = min[1] + random.next() * (max[1] - min[1]);
      layout.positions[offset + 2] = min[2] + random.next() * (max[2] - min[2]);
      layout.intensities[i] = 0.18 + random.next() * 0.22;
      layout.kinds[i] = 0;
    } else {
      const center = ARCHIVE_CENTERS[i % ARCHIVE_CENTERS.length];
      const spread = 0.1 + random.next() * 0.14;
      layout.positions[offset] = center[0] + random.gaussian() * spread;
      layout.positions[offset + 1] = center[1] + random.gaussian() * spread * 0.8;
      layout.positions[offset + 2] = center[2] + random.gaussian() * spread;
      const keyNode = i % 11 === 0;
      layout.intensities[i] = keyNode ? 1.15 + random.next() * 0.2 : 0.45 + random.next() * 0.35;
      layout.kinds[i] = keyNode ? 1 : random.next() < 0.15 ? 0 : 1;
    }
  }
}

/** 完整知识网络：聚类 + 少量外围散点 + 稀疏 hub，连接线在这一布局上预计算。 */
function writeNetworkWide(layout, count) {
  const random = createRandom(layoutSeed('networkWide'));
  const clusterCount = 18;
  const centers = [];
  for (let c = 0; c < clusterCount; c += 1) {
    centers.push({
      x: -1.55 + random.next() * 3.1,
      y: 0.65 + random.next() * 1.5,
      z: -0.25 + random.next() * 1.55,
      radius: 0.1 + random.next() * 0.22,
    });
  }
  for (let i = 0; i < count; i += 1) {
    const center = centers[i % clusterCount];
    const hub = i % 47 === 0;
    const offset = i * 3;
    let x;
    let y;
    let z;
    if (hub) {
      x = center.x + random.gaussian() * 0.03;
      y = center.y + random.gaussian() * 0.03;
      z = center.z + random.gaussian() * 0.03;
    } else if (random.next() < 0.74) {
      x = center.x + random.gaussian() * center.radius;
      y = center.y + random.gaussian() * center.radius * 0.8;
      z = center.z + random.gaussian() * center.radius;
    } else {
      x = NETWORK_MIN[0] + random.next() * (NETWORK_MAX[0] - NETWORK_MIN[0]);
      y = NETWORK_MIN[1] + random.next() * (NETWORK_MAX[1] - NETWORK_MIN[1]);
      z = NETWORK_MIN[2] + random.next() * (NETWORK_MAX[2] - NETWORK_MIN[2]);
    }
    if (x < NETWORK_MIN[0]) x = NETWORK_MIN[0];
    if (x > NETWORK_MAX[0]) x = NETWORK_MAX[0];
    if (y < NETWORK_MIN[1]) y = NETWORK_MIN[1];
    if (y > NETWORK_MAX[1]) y = NETWORK_MAX[1];
    if (z < NETWORK_MIN[2]) z = NETWORK_MIN[2];
    if (z > NETWORK_MAX[2]) z = NETWORK_MAX[2];
    layout.intensities[i] = hub ? 1.25 : 0.45 + random.next() * 0.55;
    layout.kinds[i] = hub ? 1 : random.next() < 0.72 ? 1 : 0;
    layout.positions[offset] = x;
    layout.positions[offset + 1] = y;
    layout.positions[offset + 2] = z;
  }
}

/** 大脑种子：网络整体向脑形收拢，建立“即将形成大脑”的预期。 */
function writeBrainSeed(layout, count, network, brain) {
  for (let i = 0; i < count; i += 1) {
    const offset = i * 3;
    const nx = network.positions[offset];
    const ny = network.positions[offset + 1];
    const nz = network.positions[offset + 2];
    const bx = brain.positions[offset];
    const by = brain.positions[offset + 1];
    const bz = brain.positions[offset + 2];
    layout.positions[offset] = nx + (bx - nx) * 0.58;
    layout.positions[offset + 1] = ny + (by - ny) * 0.58;
    layout.positions[offset + 2] = nz + (bz - nz) * 0.58;
    const networkIntensity = network.intensities[i];
    const brainIntensity = brain.intensities[i] * 0.82;
    layout.intensities[i] = networkIntensity > brainIntensity ? networkIntensity : brainIntensity;
    layout.kinds[i] = network.kinds[i] * 0.3 + brain.kinds[i] * 0.7;
  }
}

/**
 * 一次性生成 12 套布局目标缓冲。
 * @param {number} count 粒子数（来自 profile.particleCount，初始化时确定）
 */
export function createParticleLayouts(count) {
  if (!Number.isFinite(count) || count <= 0) {
    throw new Error(`createParticleLayouts: 无效粒子数 ${count}`);
  }
  const size = Math.floor(count);
  /** @type {Record<string, { positions: Float32Array, intensities: Float32Array, kinds: Float32Array }>} */
  const layouts = Object.create(null);
  for (let i = 0; i < LAYOUT_NAMES.length; i += 1) {
    layouts[LAYOUT_NAMES[i]] = makeLayout(size);
  }

  writeBookPage(layouts.bookPage, size);
  writeLifted(layouts.lifted, size);
  writeClusters(layouts.clusters, size);
  writeConcepts(layouts.concepts, size);
  writeScreen(layouts.screen, size);
  writeRetrieval(layouts.retrieval, size);
  writeReplay(layouts.replay, size);
  writeConflict(layouts.conflict, size);
  writeArchive(layouts.archive, size);
  writeNetworkWide(layouts.networkWide, size);
  clampToNetwork(layouts.clusters, size);
  clampToNetwork(layouts.concepts, size);
  clampToNetwork(layouts.retrieval, size);
  clampToNetwork(layouts.replay, size);
  clampToNetwork(layouts.conflict, size);
  clampToNetwork(layouts.archive, size);
  writeBrainLayout(layouts.brain, size);
  writeBrainSeed(layouts.brainSeed, size, layouts.networkWide, layouts.brain);

  for (let i = 0; i < LAYOUT_NAMES.length; i += 1) {
    if (!layouts[LAYOUT_NAMES[i]]) {
      throw new Error(`粒子布局缺失：${LAYOUT_NAMES[i]}`);
    }
  }

  return layouts;
}
