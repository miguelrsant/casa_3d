import { AdditiveBlending, BufferGeometry, DoubleSide, Float32BufferAttribute, Mesh, PlaneGeometry, ShaderMaterial } from 'three';
import { hashGlsl } from '../render/shaders/common.glsl';

/** Lâmina d'água da cascata: sai do bico no muro de pedra e cai em arco na piscina. */
export function createWaterfall(x0: number, x1: number, zWall: number, ySpout: number, yWater: number) {
  const nx = 24;
  const nv = 16;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= nv; j++) {
    const v = j / nv;
    const y = ySpout + (yWater - ySpout) * v;
    const z = zWall + 0.06 + 0.48 * v * v; // arco: a água ganha distância do muro ao cair
    for (let i = 0; i <= nx; i++) {
      const u = i / nx;
      pos.push(x0 + (x1 - x0) * u, y, z);
      uv.push(u, v);
    }
  }
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      idx.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2);
    }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  const uniforms = { uTime: { value: 0 }, uNight: { value: 0 }, uAlpha: { value: 0 } };
  const sheetMat = new ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uNight;
      uniform float uAlpha;
      varying vec2 vUv;
      ${hashGlsl}
      void main() {
        float streak = rvValueNoise(vec2(vUv.x * 60.0, vUv.y * 3.0 - uTime * 3.2));
        float fine = rvValueNoise(vec2(vUv.x * 160.0, vUv.y * 9.0 - uTime * 5.0));
        float edge = smoothstep(0.0, 0.04, vUv.x) * smoothstep(1.0, 0.96, vUv.x);
        float a = (0.18 + 0.55 * smoothstep(0.35, 0.9, streak) + 0.25 * fine) * edge;
        a *= smoothstep(0.0, 0.06, vUv.y);
        vec3 day = vec3(0.86, 0.94, 0.96);
        vec3 night = vec3(0.35, 0.95, 0.9);
        gl_FragColor = vec4(mix(day, night, uNight) * (1.2 + uNight * 0.8), a * 0.85 * uAlpha);
      }`,
  });
  const sheet = new Mesh(geo, sheetMat);
  sheet.renderOrder = 4;

  // espuma onde a água bate
  const foamGeo = new PlaneGeometry(x1 - x0 + 0.8, 1.1, 1, 1);
  foamGeo.rotateX(-Math.PI / 2);
  foamGeo.translate((x0 + x1) / 2, yWater + 0.012, zWall + 0.6);
  const foamMat = new ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uAlpha;
      varying vec2 vUv;
      ${hashGlsl}
      void main() {
        vec2 c = vUv - vec2(0.5, 0.62);
        float r = length(c * vec2(0.55, 1.6));
        float n = rvValueNoise(vUv * vec2(40.0, 14.0) + vec2(0.0, uTime * 1.7)) * rvValueNoise(vUv * vec2(90.0, 30.0) - uTime * 2.3);
        float a = smoothstep(0.55, 0.0, r) * (0.25 + n * 1.2);
        gl_FragColor = vec4(vec3(0.9), a * 0.5 * uAlpha);
      }`,
  });
  const foam = new Mesh(foamGeo, foamMat);
  foam.renderOrder = 4;

  return {
    meshes: [sheet, foam],
    update(dt: number, alpha: number, night: number) {
      uniforms.uTime.value += dt;
      uniforms.uAlpha.value = alpha;
      uniforms.uNight.value = night;
      sheet.visible = foam.visible = alpha > 0.01;
    },
  };
}
