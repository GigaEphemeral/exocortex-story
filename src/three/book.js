/**
 * 打开的书：封面、书脊、左右书页、纸张层次、文字细线、可发光书页。
 *
 * 文字细线与 bookPage 粒子共用 pageText.js 的同一份线段表，
 * 因此「文字浮起为粒子」在空间上严格对应；书籍始终留在桌面原位。
 */
import { PALETTE, WORLD } from './constants.js';
import { PAGE, TEXT_SEGMENTS } from './pageText.js';

const TEXT_VERTEX = `
  attribute float aGlow;
  varying float vGlow;
  varying float vSeed;

  void main() {
    vGlow = aGlow;
    vSeed = position.x * 17.3 + position.z * 9.1;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const TEXT_FRAGMENT = `
  uniform float uGlow;
  uniform float uTime;
  uniform float uMotion;

  varying float vGlow;
  varying float vSeed;

  void main() {
    float pulse = 0.85 + 0.15 * sin(uTime * 2.2 + vSeed) * uMotion;
    // 行越靠后越晚发光：文字像被逐行读入。
    float lit = smoothstep(vGlow, vGlow + 0.28, uGlow);
    vec3 ink = vec3(0.16, 0.11, 0.07);
    vec3 glowing = vec3(1.0, 0.78, 0.42);
    vec3 color = mix(ink, glowing, lit * (0.45 + 0.55 * pulse));
    float alpha = mix(0.58, 0.96, lit) * pulse;
    gl_FragColor = vec4(color, alpha);
  }
`;

/**
 * @param {{ THREE: any, resources: any }} options
 */
export function createBook({ THREE, resources }) {
  const group = new THREE.Group();
  group.name = 'book';

  const coverMaterial = resources.add(
    new THREE.MeshStandardMaterial({
      color: PALETTE.cover,
      roughness: 0.72,
      metalness: 0.04,
      emissive: PALETTE.bookWarm,
      emissiveIntensity: 0,
    })
  );
  const edgeMaterial = resources.add(
    new THREE.MeshStandardMaterial({ color: PALETTE.coverEdge, roughness: 0.82, metalness: 0.03 })
  );
  const pageMaterial = resources.add(
    new THREE.MeshStandardMaterial({
      color: PALETTE.paper,
      roughness: 0.95,
      metalness: 0,
      emissive: PALETTE.pageWarm,
      emissiveIntensity: 0.02,
    })
  );

  /** @param {any} geometry @param {any} material @param {number[]} position */
  const add = (geometry, material, position) => {
    resources.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position[0], position[1], position[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    group.add(mesh);
    return mesh;
  };

  // 封面（左右两片，略微大于书页）
  add(new THREE.BoxGeometry(0.25, 0.012, 0.44), coverMaterial, [-0.4, 0.744, 0.33]);
  add(new THREE.BoxGeometry(0.25, 0.012, 0.44), coverMaterial, [-0.16, 0.744, 0.33]);
  // 书脊
  add(new THREE.BoxGeometry(0.032, 0.05, 0.43), edgeMaterial, [-0.28, 0.752, 0.33]);

  // 纸张层次：每侧 4 层薄片，边缘可见纸张厚度
  const layerHeights = [0.7545, 0.7635, 0.7725, 0.7815];
  for (let layer = 0; layer < layerHeights.length; layer += 1) {
    add(new THREE.BoxGeometry(0.235, 0.007, 0.415), pageMaterial, [-0.4, layerHeights[layer], 0.33]);
    add(new THREE.BoxGeometry(0.235, 0.007, 0.415), pageMaterial, [-0.16, layerHeights[layer], 0.33]);
  }

  // 文字细线（确定性线段表）
  const segmentCount = TEXT_SEGMENTS.length;
  const textPositions = new Float32Array(segmentCount * 6);
  const textGlow = new Float32Array(segmentCount * 2);
  for (let i = 0; i < segmentCount; i += 1) {
    const segment = TEXT_SEGMENTS[i];
    const offset = i * 6;
    textPositions[offset] = segment.x0;
    textPositions[offset + 1] = PAGE.topY + 0.0006;
    textPositions[offset + 2] = segment.z;
    textPositions[offset + 3] = segment.x1;
    textPositions[offset + 4] = PAGE.topY + 0.0006;
    textPositions[offset + 5] = segment.z;
    textGlow[i * 2] = segment.glow;
    textGlow[i * 2 + 1] = segment.glow;
  }
  const textGeometry = new THREE.BufferGeometry();
  textGeometry.setAttribute('position', new THREE.BufferAttribute(textPositions, 3));
  textGeometry.setAttribute('aGlow', new THREE.BufferAttribute(textGlow, 1));

  const textUniforms = {
    uGlow: { value: 0.12 },
    uTime: { value: 0 },
    uMotion: { value: 1 },
  };
  const textMaterial = new THREE.ShaderMaterial({
    uniforms: textUniforms,
    vertexShader: TEXT_VERTEX,
    fragmentShader: TEXT_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: true,
  });
  const text = new THREE.LineSegments(textGeometry, textMaterial);
  text.renderOrder = 1;
  text.frustumCulled = false;
  text.name = 'book-text';
  group.add(text);
  resources.add(textGeometry);
  resources.add(textMaterial);

  return {
    group,
    /**
     * @param {number} bookGlow
     * @param {number} pageGlow
     * @param {number} elapsed
     * @param {boolean} reducedMotion
     */
    update(bookGlow, pageGlow, elapsed, reducedMotion) {
      coverMaterial.emissiveIntensity = bookGlow * 1.2;
      pageMaterial.emissiveIntensity = pageGlow * 0.3 + bookGlow * 0.1 + 0.015;
      textUniforms.uGlow.value = pageGlow;
      textUniforms.uTime.value = elapsed;
      textUniforms.uMotion.value = reducedMotion ? 0 : 1;
    },
  };
}
