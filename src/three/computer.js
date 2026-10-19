/**
 * 电脑（屏幕 / 边框 / 底座 / 键盘）：
 * - 屏幕、边框、底座、转轴、键盘、触控板全部为程序化几何体；
 * - 屏幕内部是程序化数据块 + 文本线条 + 节点图（非贴图），
 *   screenPower 控制整体点亮程度，screenDetail 控制出现多少数据结构；
 * - 位置固定在世界坐标锚点，不随章节跳变。
 */
import { createRandom } from './random.js';
import { PALETTE, SEEDS, WORLD } from './constants.js';

const SURFACE_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SURFACE_FRAGMENT = `
  uniform float uPower;
  uniform float uDetail;
  uniform float uTime;
  uniform float uMotion;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    vec2 grid = vec2(20.0, 14.0);
    vec2 cell = floor(vUv * grid);
    float rnd = hash(cell);
    float visible = step(rnd, uDetail * 0.85 + 0.04);
    float block = visible * (0.10 + 0.18 * hash(cell + 7.3));
    float sideBias = smoothstep(0.35, 0.9, vUv.x);
    vec3 blockColor = mix(vec3(0.05, 0.22, 0.42), vec3(0.12, 0.42, 0.62), sideBias);

    float scan = 0.5 + 0.5 * sin(vUv.y * 260.0 - uTime * 5.0 * uMotion);
    float scanStrength = (0.018 + 0.045 * uDetail) * scan;

    float vignette = smoothstep(1.0, 0.28, length((vUv - 0.5) * vec2(1.0, 1.1)));
    vec3 color = vec3(0.004, 0.010, 0.020);
    color += blockColor * block * (0.35 + uPower * 1.0);
    color += vec3(0.10, 0.30, 0.50) * scanStrength * (0.4 + uPower * 0.8);
    color *= vignette;
    color *= 0.3 + uPower * 1.15;
    gl_FragColor = vec4(color, 1.0);
  }
`;

const CONTENT_VERTEX = `
  attribute float aDetail;
  attribute float aPhase;
  uniform float uDetail;
  varying float vOn;
  varying float vPhase;

  void main() {
    vOn = smoothstep(aDetail - 0.07, aDetail + 0.07, uDetail);
    vPhase = aPhase;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const CONTENT_FRAGMENT = `
  uniform float uPower;
  uniform float uTime;
  uniform float uMotion;
  varying float vOn;
  varying float vPhase;

  void main() {
    if (vOn < 0.02) discard;
    float pulse = 0.85 + 0.15 * sin(uTime * 2.6 + vPhase * 6.2831853) * uMotion;
    vec3 color = mix(vec3(0.35, 0.75, 1.0), vec3(0.65, 0.95, 1.0), vPhase);
    float alpha = vOn * (0.18 + uPower * 0.82) * pulse;
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
  }
`;

const NODE_VERTEX = `
  attribute float aDetail;
  attribute float aPhase;
  uniform float uDetail;
  uniform float uPixelRatio;
  varying float vOn;
  varying float vPhase;

  void main() {
    vOn = smoothstep(aDetail - 0.07, aDetail + 0.07, uDetail);
    vPhase = aPhase;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = (3.0 + aPhase * 4.0) * uPixelRatio;
  }
`;

const NODE_FRAGMENT = `
  uniform float uPower;
  uniform float uTime;
  uniform float uMotion;
  varying float vOn;
  varying float vPhase;

  void main() {
    vec2 centered = gl_PointCoord - 0.5;
    float dist = length(centered);
    if (dist > 0.5) discard;
    float soft = smoothstep(0.5, 0.0, dist);
    float pulse = 0.8 + 0.2 * sin(uTime * 2.4 + vPhase * 6.2831853) * uMotion;
    float alpha = vOn * soft * (0.2 + uPower * 0.8) * pulse;
    vec3 color = mix(vec3(0.4, 0.8, 1.0), vec3(0.75, 0.95, 1.0), vPhase);
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
  }
`;

const SCREEN_NODES = Object.freeze([
  Object.freeze([0.07, 0.08]),
  Object.freeze([0.16, 0.13]),
  Object.freeze([0.23, 0.03]),
  Object.freeze([0.1, -0.03]),
  Object.freeze([0.21, -0.07]),
  Object.freeze([0.26, -0.15]),
  Object.freeze([0.06, -0.14]),
]);

const SCREEN_EDGES = Object.freeze([
  Object.freeze([0, 1]),
  Object.freeze([1, 2]),
  Object.freeze([0, 3]),
  Object.freeze([3, 4]),
  Object.freeze([2, 4]),
  Object.freeze([4, 5]),
  Object.freeze([3, 6]),
  Object.freeze([6, 5]),
]);

/**
 * @param {{ THREE: any, resources: any }} options
 */
export function createComputer({ THREE, resources }) {
  const group = new THREE.Group();
  group.name = 'computer';

  const casingMaterial = resources.add(
    new THREE.MeshStandardMaterial({
      color: PALETTE.casing,
      roughness: 0.42,
      metalness: 0.5,
      emissive: PALETTE.coolKey,
      emissiveIntensity: 0,
    })
  );
  const bezelMaterial = resources.add(
    new THREE.MeshStandardMaterial({ color: PALETTE.bezel, roughness: 0.55, metalness: 0.25 })
  );
  const keyMaterial = resources.add(
    new THREE.MeshStandardMaterial({ color: PALETTE.keys, roughness: 0.5, metalness: 0.3 })
  );
  const hingeMaterial = resources.add(
    new THREE.MeshStandardMaterial({ color: PALETTE.metal, roughness: 0.35, metalness: 0.7 })
  );

  /** @param {any} geometry @param {any} material @param {number[]} position @param {number[]} [rotation] */
  const add = (geometry, material, position, rotation) => {
    resources.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position[0], position[1], position[2]);
    if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    group.add(mesh);
    return mesh;
  };

  // 底座 + 键盘 + 触控板
  const base = add(new THREE.BoxGeometry(0.62, 0.036, 0.3), casingMaterial, [0.62, 0.758, 0.24]);
  base.receiveShadow = true;
  add(new THREE.BoxGeometry(0.16, 0.004, 0.09), bezelMaterial, [0.62, 0.7775, 0.325]);

  const keyGeometry = new THREE.BoxGeometry(0.026, 0.008, 0.024);
  const keyboard = new THREE.InstancedMesh(keyGeometry, keyMaterial, 60);
  const dummy = new THREE.Object3D();
  let keyIndex = 0;
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 15; column += 1) {
      dummy.position.set(0.62 - 0.21 + column * 0.03, 0.779, 0.135 + row * 0.033);
      dummy.updateMatrix();
      keyboard.setMatrixAt(keyIndex, dummy.matrix);
      keyIndex += 1;
    }
  }
  keyboard.instanceMatrix.needsUpdate = true;
  keyboard.castShadow = false;
  group.add(keyboard);
  resources.add(keyGeometry);
  resources.add(keyMaterial);

  // 转轴
  add(new THREE.CylinderGeometry(0.022, 0.022, 0.58, 10), hingeMaterial, [0.62, 0.8, 0.095], [0, 0, Math.PI / 2]);

  // 屏幕组（世界锚点：中心 (0.62, 1.02, 0.08)，朝向人物 +z）
  const screenGroup = new THREE.Group();
  screenGroup.position.set(WORLD.screen.center[0], WORLD.screen.center[1], WORLD.screen.center[2]);
  screenGroup.rotation.x = WORLD.screen.tilt;
  group.add(screenGroup);

  const shell = new THREE.Mesh(resources.add(new THREE.BoxGeometry(0.66, 0.46, 0.02)), casingMaterial);
  shell.position.set(0, 0, -0.012);
  shell.castShadow = true;
  screenGroup.add(shell);

  const bezel = new THREE.Mesh(resources.add(new THREE.BoxGeometry(0.64, 0.44, 0.01)), bezelMaterial);
  bezel.position.set(0, 0, 0);
  screenGroup.add(bezel);

  // 共享 uniform：屏幕亮度 / 数据细节 / 时间 / 像素比
  const uniforms = {
    uPower: { value: 0 },
    uDetail: { value: 0 },
    uTime: { value: 0 },
    uMotion: { value: 1 },
    uPixelRatio: { value: 1 },
  };

  const surfaceGeometry = resources.add(new THREE.PlaneGeometry(0.6, 0.4));
  const surfaceMaterial = resources.add(
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: SURFACE_VERTEX,
      fragmentShader: SURFACE_FRAGMENT,
    })
  );
  const surface = new THREE.Mesh(surfaceGeometry, surfaceMaterial);
  surface.position.set(0, 0, 0.007);
  surface.frustumCulled = false;
  screenGroup.add(surface);

  // 屏幕内容：数据线条 + 节点图（确定性生成）
  const random = createRandom(SEEDS.screenContent);
  const linePositions = [];
  const lineDetails = [];
  const linePhases = [];
  const pushLine = (x0, y0, x1, y1, detail) => {
    linePositions.push(x0, y0, 0.009, x1, y1, 0.009);
    const phase = random.next();
    lineDetails.push(detail, detail);
    linePhases.push(phase, phase);
  };

  // 顶部标题栏
  pushLine(-0.27, 0.16, 0.27, 0.16, 0.02);
  pushLine(-0.27, 0.145, -0.12, 0.145, 0.06);
  pushLine(0.16, 0.145, 0.27, 0.145, 0.09);
  // 左侧文本列：屏幕细节越高，出现越多行
  for (let row = 0; row < 12; row += 1) {
    const y = 0.105 - row * 0.0195;
    pushLine(-0.27, y, -0.27 + 0.1 + random.next() * 0.1, y, 0.14 + row * 0.045);
    if (row % 2 === 0) pushLine(-0.055, y, -0.02, y, 0.2 + row * 0.04);
  }
  // 右侧节点图的边
  for (let edge = 0; edge < SCREEN_EDGES.length; edge += 1) {
    const pair = SCREEN_EDGES[edge];
    const a = SCREEN_NODES[pair[0]];
    const b = SCREEN_NODES[pair[1]];
    pushLine(a[0], a[1], b[0], b[1], 0.3 + (edge / SCREEN_EDGES.length) * 0.35);
  }
  // 底部元数据行
  pushLine(-0.27, -0.165, -0.05, -0.165, 0.78);
  pushLine(0.02, -0.165, 0.26, -0.165, 0.86);

  const contentGeometry = new THREE.BufferGeometry();
  contentGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(linePositions), 3));
  contentGeometry.setAttribute('aDetail', new THREE.BufferAttribute(new Float32Array(lineDetails), 1));
  contentGeometry.setAttribute('aPhase', new THREE.BufferAttribute(new Float32Array(linePhases), 1));
  const contentMaterial = resources.add(
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: CONTENT_VERTEX,
      fragmentShader: CONTENT_FRAGMENT,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
    })
  );
  const contentLines = new THREE.LineSegments(contentGeometry, contentMaterial);
  contentLines.frustumCulled = false;
  contentLines.renderOrder = 1;
  screenGroup.add(contentLines);
  resources.add(contentGeometry);

  // 节点图
  const nodePositions = new Float32Array(SCREEN_NODES.length * 3);
  const nodeDetails = new Float32Array(SCREEN_NODES.length);
  const nodePhases = new Float32Array(SCREEN_NODES.length);
  for (let i = 0; i < SCREEN_NODES.length; i += 1) {
    nodePositions[i * 3] = SCREEN_NODES[i][0];
    nodePositions[i * 3 + 1] = SCREEN_NODES[i][1];
    nodePositions[i * 3 + 2] = 0.0095;
    nodeDetails[i] = 0.34 + i * 0.075;
    nodePhases[i] = random.next();
  }
  const nodeGeometry = new THREE.BufferGeometry();
  nodeGeometry.setAttribute('position', new THREE.BufferAttribute(nodePositions, 3));
  nodeGeometry.setAttribute('aDetail', new THREE.BufferAttribute(nodeDetails, 1));
  nodeGeometry.setAttribute('aPhase', new THREE.BufferAttribute(nodePhases, 1));
  const nodeMaterial = resources.add(
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: NODE_VERTEX,
      fragmentShader: NODE_FRAGMENT,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
    })
  );
  const nodes = new THREE.Points(nodeGeometry, nodeMaterial);
  nodes.frustumCulled = false;
  nodes.renderOrder = 1;
  screenGroup.add(nodes);
  resources.add(nodeGeometry);

  return {
    group,
    setPixelRatio(ratio) {
      uniforms.uPixelRatio.value = ratio;
    },
    /**
     * @param {number} screenPower
     * @param {number} screenDetail
     * @param {number} elapsed
     * @param {boolean} reducedMotion
     */
    update(screenPower, screenDetail, elapsed, reducedMotion) {
      uniforms.uPower.value = screenPower;
      uniforms.uDetail.value = screenDetail;
      uniforms.uTime.value = elapsed;
      uniforms.uMotion.value = reducedMotion ? 0 : 1;
      casingMaterial.emissiveIntensity = screenPower * 0.14;
    },
  };
}
