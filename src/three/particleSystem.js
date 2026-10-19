/**
 * 单套持久化粒子系统。
 *
 * 硬约束（docs/architecture.md 3.3）：
 * - Float32Array(count * 3) 只创建一次，运行时只改写、不重建；
 * - 每帧只把 lerp(fromLayout, toLayout, t) 写入活动缓冲，然后 needsUpdate；
 * - 粒子身份由索引固定，颜色语义只有两类（概念冷蓝 / 来源证据淡琥珀）；
 * - applyFrame 路径内不 new 任何 THREE 对象。
 */
import { createRandom } from './random.js';
import { LAYOUT_PARTICLE_SIZE, SEEDS, SHADER_COLORS } from './constants.js';

const VERTEX_SHADER = `
  attribute float aIntensity;
  attribute float aKind;
  attribute float aSeed;

  uniform float uTime;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uViewportScale;
  uniform float uMotion;
  uniform float uBrainGlow;

  varying float vAlpha;
  varying float vKind;
  varying float vSeed;

  void main() {
    vec3 transformed = position;
    // 极轻微的环境漂浮；reducedMotion 时 uMotion = 0。
    float phase = aSeed * 6.2831853;
    transformed.x += sin(uTime * 0.6 + phase) * 0.008 * uMotion;
    transformed.y += cos(uTime * 0.85 + phase * 1.7) * 0.01 * uMotion;
    transformed.z += sin(uTime * 0.45 + phase * 2.3) * 0.006 * uMotion;

    vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    float twinkle = 0.82 + 0.18 * sin(uTime * 2.1 + phase * 3.0) * uMotion;
    vAlpha = aIntensity * (0.35 + 0.65 * twinkle) * (1.0 + uBrainGlow * 0.1);
    vKind = aKind;
    vSeed = aSeed;

    // 终幕大脑：表层高亮粒子略微放大，形成更清晰的电子点轮廓（uBrainGlow 由章节状态驱动）。
    float brainSize = 1.0 + uBrainGlow * (0.04 + 0.3 * aIntensity);
    float worldSize = 0.0112 * uSize * (0.6 + aSeed * 0.8) * brainSize;
    gl_PointSize = clamp(worldSize * uViewportScale * uPixelRatio / max(0.35, -mvPosition.z), 1.0, 96.0);
  }
`;

const FRAGMENT_SHADER = `
  uniform float uCoolBlend;
  uniform float uIntensity;
  uniform float uBrainGlow;
  uniform vec3 uConceptColor;
  uniform vec3 uEvidenceColor;
  uniform vec3 uIceColor;

  varying float vAlpha;
  varying float vKind;
  varying float vSeed;

  void main() {
    vec2 centered = gl_PointCoord - 0.5;
    float dist = length(centered);
    if (dist > 0.5) discard;

    float edge = smoothstep(0.5, 0.0, dist);
    float core = smoothstep(0.34, 0.0, dist);

    // 两类语义颜色：概念 = 冷蓝，来源/证据 = 淡琥珀。
    vec3 color = mix(uEvidenceColor, uConceptColor, clamp(vKind, 0.0, 1.0));
    // coolBlend 让整体色温由暖转冷，但两类差异仍然保留。
    color = mix(color, uConceptColor * 1.12, uCoolBlend * (1.0 - vKind) * 0.55);
    color = mix(color, uConceptColor * 1.2, uCoolBlend * vKind * 0.22);
    // 终幕：高亮表层向冰蓝/冷白偏移，与暗部形成更强的轮廓对比。
    color = mix(color, uIceColor, clamp(vAlpha, 0.0, 1.0) * uCoolBlend * uBrainGlow * 0.55);
    color += core * 0.5;

    float alpha = vAlpha * uIntensity * edge;
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
  }
`;

/**
 * @param {{ THREE: any, count: number, layouts: Record<string, any>, resources: any, reducedMotion: boolean }} options
 */
export function createParticles({ THREE, count, layouts, resources, reducedMotion }) {
  const positions = new Float32Array(count * 3);
  const intensities = new Float32Array(count);
  const kinds = new Float32Array(count);

  // 初始即停在 bookPage，首帧不会闪成随机位置。
  positions.set(layouts.bookPage.positions);
  intensities.set(layouts.bookPage.intensities);
  kinds.set(layouts.bookPage.kinds);

  const seeds = new Float32Array(count);
  const random = createRandom(SEEDS.particles);
  for (let i = 0; i < count; i += 1) seeds[i] = random.next();

  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
  const intensityAttribute = new THREE.BufferAttribute(intensities, 1).setUsage(THREE.DynamicDrawUsage);
  const kindAttribute = new THREE.BufferAttribute(kinds, 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positionAttribute);
  geometry.setAttribute('aIntensity', intensityAttribute);
  geometry.setAttribute('aKind', kindAttribute);
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.4, 0.6), 4.2);

  const uniforms = {
    uTime: { value: 0 },
    uCoolBlend: { value: 0 },
    uSize: { value: 1 },
    uIntensity: { value: 0.4 },
    uPixelRatio: { value: 1 },
    uViewportScale: { value: 900 },
    uBrainGlow: { value: 0 },
    uMotion: { value: reducedMotion ? 0 : 1 },
    uConceptColor: { value: new THREE.Vector3(SHADER_COLORS.concept[0], SHADER_COLORS.concept[1], SHADER_COLORS.concept[2]) },
    uEvidenceColor: { value: new THREE.Vector3(SHADER_COLORS.evidence[0], SHADER_COLORS.evidence[1], SHADER_COLORS.evidence[2]) },
    uIceColor: { value: new THREE.Vector3(SHADER_COLORS.ice[0], SHADER_COLORS.ice[1], SHADER_COLORS.ice[2]) },
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

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 3;
  points.name = 'knowledge-particles';

  resources.add(geometry);
  resources.add(material);

  return {
    object: points,
    positions,
    count,
    uniforms,
    setMotion(reduced) {
      uniforms.uMotion.value = reduced ? 0 : 1;
    },
    /**
     * 每帧把 lerp 结果写入活动缓冲；不分配任何对象。
     * @param {string} fromName
     * @param {string} toName
     * @param {number} t
     * @param {{ coolBlend: number, particleSize: number, particleIntensity: number, brainGlow: number }} values
     * @param {number} elapsed
     */
    update(fromName, toName, t, values, elapsed) {
      const from = layouts[fromName] || layouts.bookPage;
      const to = layouts[toName] || layouts.bookPage;
      const fromPositions = from.positions;
      const toPositions = to.positions;
      const fromIntensities = from.intensities;
      const toIntensities = to.intensities;
      const fromKinds = from.kinds;
      const toKinds = to.kinds;
      const inverse = 1 - t;

      for (let i = 0; i < count; i += 1) {
        const offset = i * 3;
        positions[offset] = fromPositions[offset] * inverse + toPositions[offset] * t;
        positions[offset + 1] = fromPositions[offset + 1] * inverse + toPositions[offset + 1] * t;
        positions[offset + 2] = fromPositions[offset + 2] * inverse + toPositions[offset + 2] * t;
        intensities[i] = fromIntensities[i] * inverse + toIntensities[i] * t;
        kinds[i] = fromKinds[i] * inverse + toKinds[i] * t;
      }

      positionAttribute.needsUpdate = true;
      intensityAttribute.needsUpdate = true;
      kindAttribute.needsUpdate = true;

      uniforms.uTime.value = elapsed;
      uniforms.uCoolBlend.value = values.coolBlend;
      const fromScale = LAYOUT_PARTICLE_SIZE[fromName] || 1;
      const toScale = LAYOUT_PARTICLE_SIZE[toName] || 1;
      uniforms.uSize.value = values.particleSize * (fromScale + (toScale - fromScale) * t);
      uniforms.uIntensity.value = values.particleIntensity;
      uniforms.uBrainGlow.value = values.brainGlow;
    },
  };
}
