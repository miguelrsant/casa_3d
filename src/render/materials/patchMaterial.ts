import type { MeshStandardMaterial } from 'three';
import { Vector4 } from 'three';
import { RV } from '../zones';
import { rvFragmentEarly, rvFragmentEmissive, rvFragmentPars, rvVertexMain, rvVertexPars } from '../shaders/reveal.glsl';

export interface DrawOptions {
  /** Topo em poché escuro (paredes). */
  poche?: boolean;
  /** Hachura de piso: [tipo, escala x, escala z, intensidade]. 1 grade · 2 réguas · 3 pontilhado · 4 ondas · 5 réguas em z. */
  hatch?: [number, number, number, number];
  /** Vidro: no desenho vira transparente com linhas diagonais. */
  glass?: boolean;
}

/**
 * Um material, dois mundos: injeta a revelação por zona num material PBR do three.
 * Não revelado → cor de desenho sem iluminação (saída antecipada); revelado → PBR + borda laranja.
 */
export function patchMaterial<T extends MeshStandardMaterial>(mat: T, opts: DrawOptions = {}): T {
  const local = {
    rvHatch: { value: new Vector4(...(opts.hatch ?? [0, 1, 1, 0])) },
    rvPocheOn: { value: opts.poche ? 1 : 0 },
    rvGlassOn: { value: opts.glass ? 1 : 0 },
  };
  mat.userData.rv = local;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, RV, local);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${rvVertexPars}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${rvVertexMain}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${rvFragmentPars}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${rvFragmentEarly}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${rvFragmentEmissive}`);
  };
  mat.customProgramCacheKey = () => 'rv1';
  return mat;
}
