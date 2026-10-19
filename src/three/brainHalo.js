/**
 * 数字大脑外侧的冷色体积光：面向摄像机的加法辉光平面（不是"泡泡"球壳），
 * 只由 brainGlow 驱动，作为气氛层存在，脑形本体始终由粒子构成。
 */
import { SHADER_COLORS, WORLD } from './constants.js';

const VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = `
  uniform float uGlow;
  uniform float uCoolBlend;
  uniform float uTime;
  uniform float uMotion;
  uniform vec3 uColdColor;
  uniform vec3 uIceColor;
  varying vec2 vUv;

  void main() {
    if (uGlow < 0.004) discard;
    float radius = length(vUv - 0.5) * 2.0;
    float core = smoothstep(1.0, 0.08, radius);
    float glow = pow(core, 2.6);
    float pulse = 0.92 + 0.08 * sin(uTime * 1.1) * uMotion;
    vec3 color = mix(uColdColor, uIceColor, uCoolBlend * 0.7 + glow * 0.25);
    float alpha = glow * uGlow * 0.16 * pulse;
    gl_FragColor = vec4(color, alpha);
  }
`;

/**
 * @param {{ THREE: any, resources: any }} options
 */
export function createBrainHalo({ THREE, resources }) {
  const geometry = resources.add(new THREE.PlaneGeometry(3.4, 3.0));
  const uniforms = {
    uGlow: { value: 0 },
    uCoolBlend: { value: 0 },
    uTime: { value: 0 },
    uMotion: { value: 1 },
    uColdColor: { value: new THREE.Vector3(SHADER_COLORS.concept[0], SHADER_COLORS.concept[1], SHADER_COLORS.concept[2]) },
    uIceColor: { value: new THREE.Vector3(SHADER_COLORS.ice[0], SHADER_COLORS.ice[1], SHADER_COLORS.ice[2]) },
  };
  const material = resources.add(
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    })
  );
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'brain-halo';
  mesh.position.set(WORLD.brain.center[0], WORLD.brain.center[1], WORLD.brain.center[2]);
  mesh.renderOrder = 0;
  mesh.frustumCulled = false;

  return {
    object: mesh,
    /**
     * @param {number} brainGlow
     * @param {number} coolBlend
     * @param {number} elapsed
     * @param {boolean} reducedMotion
     * @param {any} camera
     */
    update(brainGlow, coolBlend, elapsed, reducedMotion, camera) {
      uniforms.uGlow.value = brainGlow;
      uniforms.uCoolBlend.value = coolBlend;
      uniforms.uTime.value = elapsed;
      uniforms.uMotion.value = reducedMotion ? 0 : 1;
      // 面向摄像机；quaternion.copy 不分配对象。
      if (camera) mesh.quaternion.copy(camera.quaternion);
    },
  };
}
