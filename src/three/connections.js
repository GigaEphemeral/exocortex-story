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

  varying float vKind;
  varying float vStrength;
  varying float vPhase;

  void main() {
    vKind = aKind;
    vStrength = aStrength;
    vPhase = aPhase;
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

  varying float vKind;
  varying float vStrength;
  varying float vPhase;

  void main() {
    vec3 color = mix(uEvidenceColor, uConceptColor, clamp(vKind, 0.0, 1.0));
    color = mix(color, uConceptColor, uCoolBlend * (1.0 - vKind) * 0.5);
    // linkWidth 只改材质参数：影响亮度/可见强度（WebGL 线宽上限通常为 1px）。
    float widthBoost = mix(0.72, 1.3, smoothstep(0.72, 1.55, uWidth));
    float pulse = 0.9 + 0.1 * sin(uTime * 1.4 + vPhase * 6.2831853) * uMotion;
    float alpha = uOpacity * vStrength * widthBoost * pulse * 0.8;
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
  const usedPairs = new Set();
  const candidateIndex = new Int32Array(8);
  const candidateDistance = new Float32Array(8);

  const tryAddPair = (a, b, strength) => {
    if (a === b) return false;
    const low = a < b ? a : b;
    const high = a < b ? b : a;
    const key = low * count + high;
    if (usedPairs.has(key)) return false;
    usedPairs.add(key);
    pairIndices.push(low, high);
    pairStrengths.push(strength);
    return true;
  };

  for (let i = 0; i < count && pairStrengths.length < maxLinks; i += 1) {
    const x = networkPositions[i * 3];
    const y = networkPositions[i * 3 + 1];
    const z = networkPositions[i * 3 + 2];
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
            if (j === i) continue;
            const ddx = networkPositions[j * 3] - x;
            const ddy = networkPositions[j * 3 + 1] - y;
            const ddz = networkPositions[j * 3 + 2] - z;
            const distanceSquared = ddx * ddx + ddy * ddy + ddz * ddz;
            if (distanceSquared > radius * radius) continue;
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

  const linkCount = pairStrengths.length;
  const pairBuffer = new Int32Array(pairIndices);
  const linePositions = new Float32Array(linkCount * 6);
  const lineKinds = new Float32Array(linkCount * 2);
  const lineStrengths = new Float32Array(linkCount * 2);
  const linePhases = new Float32Array(linkCount * 2);
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
  }

  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(linePositions, 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positionAttribute);
  geometry.setAttribute('aKind', new THREE.BufferAttribute(lineKinds, 1));
  const strengthAttribute = new THREE.BufferAttribute(lineStrengths, 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aStrength', strengthAttribute);
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(linePhases, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.4, 0.6), 4.2);

  const uniforms = {
    uOpacity: { value: 0 },
    uWidth: { value: 1 },
    uCoolBlend: { value: 0 },
    uTime: { value: 0 },
    uMotion: { value: 1 },
    uConceptColor: { value: new THREE.Vector3(SHADER_COLORS.concept[0], SHADER_COLORS.concept[1], SHADER_COLORS.concept[2]) },
    uEvidenceColor: { value: new THREE.Vector3(SHADER_COLORS.evidence[0], SHADER_COLORS.evidence[1], SHADER_COLORS.evidence[2]) },
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
     */
    update(particlePositions, opacity, width, coolBlend, elapsed) {
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
      material.linewidth = width >= 1.25 ? 1.5 : 1;
    },
  };
}
