/**
 * 一套持久化 LineSegments：端点引用粒子索引，随粒子同步移动。
 *
 * pair 在初始化时基于 networkWide 布局预计算：空间网格近邻 + 少量跨簇桥接，
 * 因此连接体现聚类与局部关联，而不是完全随机。
 * linkOpacity / linkWidth 只改材质参数，不重建几何。
 */
import { createRandom } from './random.js';
import { SEEDS, SHADER_COLORS } from './constants.js';

const VERTEX_SHADER = `
  attribute float aKind;
  attribute float aStrength;
  attribute float aPhase;
  attribute float aTier;
  attribute float aDecaySeed;

  uniform float uDensity;
  uniform float uDecay;

  varying float vKind;
  varying float vStrength;
  varying float vPhase;
  varying float vTier;
  varying float vGray;
  varying float vGone;

  void main() {
    vKind = aKind;
    vStrength = aStrength;
    vPhase = aPhase;

    // 增密层：uDensity=0 时只保留基础近邻连线，=1 时额外连线全部显示。
    vTier = mix(1.0, uDensity, aTier);

    // 每条连接有独立的遗忘阈值：uDecay 增大时先变灰，再逐渐消失。
    float threshold = mix(0.08, 0.82, aDecaySeed);
    vGray = smoothstep(threshold, threshold + 0.12, uDecay);
    vGone = smoothstep(threshold + 0.1, threshold + 0.3, uDecay);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  uniform float uOpacity;
  uniform float uWidth;
  uniform float uCoolBlend;
  uniform float uTime;
  uniform float uMotion;
  uniform vec3 uConceptColor;
  uniform vec3 uEvidenceColor;
  uniform vec3 uGrayColor;

  varying float vKind;
  varying float vStrength;
  varying float vPhase;
  varying float vTier;
  varying float vGray;
  varying float vGone;

  void main() {
    vec3 color = mix(uEvidenceColor, uConceptColor, clamp(vKind, 0.0, 1.0));
    color = mix(color, uConceptColor, uCoolBlend * (1.0 - vKind) * 0.5);
    // 遗忘：相关连接先褪成灰色，再淡出消失。
    color = mix(color, uGrayColor, clamp(vGray, 0.0, 1.0));
    // linkWidth 只改材质参数：影响亮度/可见强度（WebGL 线宽上限通常为 1px）。
    float widthBoost = mix(0.72, 1.3, smoothstep(0.72, 1.55, uWidth));
    float pulse = 0.9 + 0.1 * sin(uTime * 1.4 + vPhase * 6.2831853) * uMotion;
    float alpha = uOpacity * vStrength * widthBoost * pulse * 0.8 * vTier * (1.0 - vGone);
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
  }
`;

const CELL = 0.3;

function cellKey(x, y, z) {
  const ix = Math.floor(x / CELL) + 64;
  const iy = Math.floor(y / CELL) + 64;
  const iz = Math.floor(z / CELL) + 64;
  return (ix << 20) | (iy << 10) | iz;
}

/**
 * @param {{ THREE: any, count: number, layouts: Record<string, any>, resources: any, mobile: boolean }} options
 */
export function createConnections({ THREE, count, layouts, resources, mobile }) {
  const networkPositions = layouts.networkWide.positions;
  const networkKinds = layouts.networkWide.kinds;
  const random = createRandom(SEEDS.connections);
  const maxLinks = Math.min(mobile ? 360 : 1500, Math.floor(count * 0.5));
  const radius = 0.3;

  // —— 空间哈希：只比较邻近网格，避免 O(n²) ——
  const buckets = new Map();
  for (let i = 0; i < count; i += 1) {
    const key = cellKey(networkPositions[i * 3], networkPositions[i * 3 + 1], networkPositions[i * 3 + 2]);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = [];
      buckets.set(key, bucket);
    }
    bucket.push(i);
  }

  const pairIndices = [];
  const pairStrengths = [];
  const pairTiers = [];
  const usedPairs = new Set();
  const candidateIndex = new Int32Array(8);
  const candidateDistance = new Float32Array(8);

  const tryAddPair = (a, b, strength, tier = 0) => {
    if (a === b) return false;
    const low = a < b ? a : b;
    const high = a < b ? b : a;
    const key = low * count + high;
    if (usedPairs.has(key)) return false;
    usedPairs.add(key);
    pairIndices.push(low, high);
    pairStrengths.push(strength);
    pairTiers.push(tier);
    return true;
  };

  /** 把 index 附近最近的候选写入 candidateIndex / candidateDistance，返回候选数。 */
  function collectCandidates(index, searchRadius) {
    const x = networkPositions[index * 3];
    const y = networkPositions[index * 3 + 1];
    const z = networkPositions[index * 3 + 2];
    const limitSquared = searchRadius * searchRadius;
    let found = 0;
    const baseX = Math.floor(x / CELL) + 64;
    const baseY = Math.floor(y / CELL) + 64;
    const baseZ = Math.floor(z / CELL) + 64;

    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          const bucket = buckets.get(((baseX + dx) << 20) | ((baseY + dy) << 10) | (baseZ + dz));
          if (!bucket) continue;
          for (let b = 0; b < bucket.length; b += 1) {
            const j = bucket[b];
            if (j === index) continue;
            const ddx = networkPositions[j * 3] - x;
            const ddy = networkPositions[j * 3 + 1] - y;
            const ddz = networkPositions[j * 3 + 2] - z;
            const distanceSquared = ddx * ddx + ddy * ddy + ddz * ddz;
            if (distanceSquared > limitSquared) continue;
            if (found === 8 && distanceSquared >= candidateDistance[7]) continue;
            // 插入到最近邻候选（最多 8 个）
            let slot = found < 8 ? found : 7;
            if (found < 8) found += 1;
            while (slot > 0 && candidateDistance[slot - 1] > distanceSquared) {
              candidateDistance[slot] = candidateDistance[slot - 1];
              candidateIndex[slot] = candidateIndex[slot - 1];
              slot -= 1;
            }
            candidateDistance[slot] = distanceSquared;
            candidateIndex[slot] = j;
          }
        }
      }
    }
    return found;
  }

  for (let i = 0; i < count && pairStrengths.length < maxLinks; i += 1) {
    const found = collectCandidates(i, radius);

    // 每个粒子优先连到最近的 1–2 个邻居，并保留少量随机性。
    let links = 0;
    for (let c = 0; c < found && links < 2; c += 1) {
      const j = candidateIndex[c];
      if (j < i) continue;
      if (random.next() < 0.18) continue;
      const distance = Math.sqrt(candidateDistance[c]);
      const strength = 0.35 + 0.65 * Math.max(0, 1 - distance / radius);
      if (tryAddPair(i, j, strength)) links += 1;
    }
    if (pairStrengths.length >= maxLinks) break;
  }

  // —— 跨簇桥接：hub 之间的少量长连接，让网络不是一堆互不相连的团 ——
  const bridgeTarget = Math.min(mobile ? 16 : 45, Math.floor(count * 0.012));
  let bridges = 0;
  let attempts = 0;
  while (bridges < bridgeTarget && attempts < bridgeTarget * 30) {
    attempts += 1;
    const a = Math.floor(random.next() * count);
    const b = Math.floor(random.next() * count);
    const dx = networkPositions[b * 3] - networkPositions[a * 3];
    const dy = networkPositions[b * 3 + 1] - networkPositions[a * 3 + 1];
    const dz = networkPositions[b * 3 + 2] - networkPositions[a * 3 + 2];
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (distance < 0.72 || distance > 2.4) continue;
    if (tryAddPair(a, b, 0.28 + random.next() * 0.22)) bridges += 1;
  }

  // —— 增密层（tier=1）：冲突/再巩固等章节需要更密集的连接时整体显示 ——
  // 与基础层共用同一个 LineSegments 与粒子索引，仅材质参数控制显隐，不重建几何。
  const baseLinkCount = pairStrengths.length;
  const extraTarget = Math.min(mobile ? 180 : 1200, Math.floor(baseLinkCount * 0.9));
  const extraRadius = radius * 1.25;
  let extraAttempts = 0;
  const maxExtraAttempts = extraTarget * 4;
  while (pairStrengths.length < baseLinkCount + extraTarget && extraAttempts < maxExtraAttempts) {
    extraAttempts += 1;
    const i = Math.floor(random.next() * count);
    const found = collectCandidates(i, extraRadius);
    let added = 0;
    for (let c = 0; c < found && added < 2; c += 1) {
      const j = candidateIndex[c];
      const distance = Math.sqrt(candidateDistance[c]);
      const strength = 0.22 + 0.5 * Math.max(0, 1 - distance / extraRadius);
      if (tryAddPair(i, j, strength, 1)) added += 1;
    }
  }

  const linkCount = pairStrengths.length;
  const pairBuffer = new Int32Array(pairIndices);
  const linePositions = new Float32Array(linkCount * 6);
  const lineKinds = new Float32Array(linkCount * 2);
  const lineStrengths = new Float32Array(linkCount * 2);
  const linePhases = new Float32Array(linkCount * 2);
  const lineTiers = new Float32Array(linkCount * 2);
  const lineDecaySeeds = new Float32Array(linkCount * 2);
  const baseStrengths = new Float32Array(linkCount);

  for (let l = 0; l < linkCount; l += 1) {
    const i = pairBuffer[l * 2];
    const j = pairBuffer[l * 2 + 1];
    const offset = l * 6;
    linePositions[offset] = networkPositions[i * 3];
    linePositions[offset + 1] = networkPositions[i * 3 + 1];
    linePositions[offset + 2] = networkPositions[i * 3 + 2];
    linePositions[offset + 3] = networkPositions[j * 3];
    linePositions[offset + 4] = networkPositions[j * 3 + 1];
    linePositions[offset + 5] = networkPositions[j * 3 + 2];
    const strength = pairStrengths[l];
    baseStrengths[l] = strength;
    const kind = (networkKinds[i] + networkKinds[j]) * 0.5;
    const phase = random.next();
    lineKinds[l * 2] = kind;
    lineKinds[l * 2 + 1] = kind;
    lineStrengths[l * 2] = strength;
    lineStrengths[l * 2 + 1] = strength;
    linePhases[l * 2] = phase;
    linePhases[l * 2 + 1] = phase;
    // aDecaySeed 决定该连接在遗忘阶段“先灰后消失”的先后顺序。
    const tier = pairTiers[l] ?? 0;
    const decaySeed = random.next();
    lineTiers[l * 2] = tier;
    lineTiers[l * 2 + 1] = tier;
    lineDecaySeeds[l * 2] = decaySeed;
    lineDecaySeeds[l * 2 + 1] = decaySeed;
  }

  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(linePositions, 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positionAttribute);
  geometry.setAttribute('aKind', new THREE.BufferAttribute(lineKinds, 1));
  const strengthAttribute = new THREE.BufferAttribute(lineStrengths, 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aStrength', strengthAttribute);
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(linePhases, 1));
  geometry.setAttribute('aTier', new THREE.BufferAttribute(lineTiers, 1));
  geometry.setAttribute('aDecaySeed', new THREE.BufferAttribute(lineDecaySeeds, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.4, 0.6), 4.2);

  const uniforms = {
    uOpacity: { value: 0 },
    uWidth: { value: 1 },
    uCoolBlend: { value: 0 },
    uTime: { value: 0 },
    uMotion: { value: 1 },
    uDensity: { value: 1 },
    uDecay: { value: 0 },
    uConceptColor: { value: new THREE.Vector3(SHADER_COLORS.concept[0], SHADER_COLORS.concept[1], SHADER_COLORS.concept[2]) },
    uEvidenceColor: { value: new THREE.Vector3(SHADER_COLORS.evidence[0], SHADER_COLORS.evidence[1], SHADER_COLORS.evidence[2]) },
    uGrayColor: { value: new THREE.Vector3(0.5, 0.53, 0.58) },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
  });
  // 只改材质参数：让 lineWidth 在支持的环境里也生效。
  material.linewidth = 1;

  const lines = new THREE.LineSegments(geometry, material);
  lines.frustumCulled = false;
  lines.renderOrder = 2;
  lines.name = 'knowledge-links';

  resources.add(geometry);
  resources.add(material);

  return {
    object: lines,
    linkCount,
    uniforms,
    setMotion(reduced) {
      uniforms.uMotion.value = reduced ? 0 : 1;
    },
    /**
     * 端点位置从活动粒子缓冲同步复制；只写已有数组。
     * @param {Float32Array} particlePositions
     * @param {number} opacity
     * @param {number} width
     * @param {number} coolBlend
     * @param {number} elapsed
     * @param {number} [density=1] 增密层显隐 0–1
     * @param {number} [decay=0] 连线遗忘程度 0–1（先变灰再消失）
     */
    update(particlePositions, opacity, width, coolBlend, elapsed, density = 1, decay = 0) {
      for (let l = 0; l < linkCount; l += 1) {
        const i = pairBuffer[l * 2];
        const j = pairBuffer[l * 2 + 1];
        const offset = l * 6;
        const a = i * 3;
        const b = j * 3;
        const ax = particlePositions[a];
        const ay = particlePositions[a + 1];
        const az = particlePositions[a + 2];
        const bx = particlePositions[b];
        const by = particlePositions[b + 1];
        const bz = particlePositions[b + 2];
        linePositions[offset] = ax;
        linePositions[offset + 1] = ay;
        linePositions[offset + 2] = az;
        linePositions[offset + 3] = bx;
        linePositions[offset + 4] = by;
        linePositions[offset + 5] = bz;
        // 随粒子移动时，被拉得很长的连接自然变淡：局部关系保持清晰，跨簇只留暗示。
        const dx = bx - ax;
        const dy = by - ay;
        const dz = bz - az;
        const fade = 1 / (1 + Math.sqrt(dx * dx + dy * dy + dz * dz) * 1.5);
        const value = baseStrengths[l] * fade;
        lineStrengths[l * 2] = value;
        lineStrengths[l * 2 + 1] = value;
      }
      positionAttribute.needsUpdate = true;
      strengthAttribute.needsUpdate = true;
      uniforms.uOpacity.value = opacity;
      uniforms.uWidth.value = width;
      uniforms.uCoolBlend.value = coolBlend;
      uniforms.uTime.value = elapsed;
      uniforms.uDensity.value = density;
      uniforms.uDecay.value = decay;
      material.linewidth = width >= 1.25 ? 1.5 : 1;
    },
  };
}
