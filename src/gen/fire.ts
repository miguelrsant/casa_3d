import { AdditiveBlending, Mesh, PlaneGeometry, ShaderMaterial } from 'three';
import { hashGlsl } from '../render/shaders/common.glsl';

/** Chamas do fire pit: billboard com ruído animado (aditivo, vai para o bloom). */
export function createFire(x: number, y: number, z: number) {
  const mat = new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uIntensity: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        mv.xy += position.xy;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uIntensity;
      varying vec2 vUv;
      ${hashGlsl}
      float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * rvValueNoise(p); p *= 2.03; a *= 0.5; } return s; }
      void main() {
        vec2 uv = vUv;
        float n = fbm(vec2(uv.x * 4.0, uv.y * 3.0 - uTime * 2.2));
        float n2 = fbm(vec2(uv.x * 7.0 + 3.0, uv.y * 5.0 - uTime * 3.1));
        float width = 0.42 * (1.0 - uv.y * 0.85) + 0.03;
        float body = 1.0 - smoothstep(0.0, width, abs(uv.x - 0.5 + (n - 0.5) * 0.18 * uv.y));
        float f = body * (1.0 - uv.y) * (0.55 + n * 0.9) * (0.7 + n2 * 0.6);
        f = smoothstep(0.18, 0.95, f);
        vec3 col = mix(vec3(1.0, 0.28, 0.04), vec3(1.0, 0.82, 0.45), smoothstep(0.35, 0.95, f));
        gl_FragColor = vec4(col * f * 3.2 * uIntensity, f * uIntensity);
      }`,
  });
  const mesh = new Mesh(new PlaneGeometry(0.95, 1.25).translate(0, 0.62, 0), mat);
  mesh.position.set(x, y, z);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  return { mesh, mat };
}
