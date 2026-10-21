import { SMAAPreset } from 'postprocessing';

export type Tier = 'high' | 'medium' | 'low';

/** O que cada nível liga. Tudo aqui é decidido uma vez no carregamento (mudar recompila shaders ou refaz geometria). */
export interface Quality {
  /** Escala das texturas procedurais (1 = 1024/512 px). */
  tex: number;
  shadow: number;
  /** Densidade das folhas (1 = completa; menos folhas, maiores, cobrem a mesma copa). */
  veg: number;
  /** Mata distante (instâncias) e passo da malha do terreno. */
  forest: number;
  /** Fração das árvores da mata em volta do lote (as que restam continuam espalhadas por igual). */
  forestTrees: number;
  terrainCell: number;
  /** Teto de DPR e orçamento de pixels renderizados por quadro. */
  dpr: number;
  pixels: number;
  ao: boolean;
  smaa: SMAAPreset;
  /** Lado da face do cubo dos mapas de ambiente (PMREM); o céu é liso, 128 basta fora do alto. */
  env: number;
  /** Resolução do reflexo do espelho do banho (fração da tela). */
  mirror: number;
  /** Luzes pontuais por ambiente e da piscina (fixas na sessão). */
  roomLights: number;
  poolLights: number;
  /** Quanto o centro da sombra anda (m²) / o sol gira antes de refazer o shadow map. */
  shadowMove: number;
  shadowTurn: number;
}

export const QUALITY: Record<Tier, Quality> = {
  high: { tex: 1, shadow: 4096, veg: 1, forest: 2600, forestTrees: 1, terrainCell: 1, dpr: 2, pixels: 4.2e6, ao: true, smaa: SMAAPreset.HIGH, env: 256, mirror: 0.5, roomLights: 3, poolLights: 2, shadowMove: 0.25, shadowTurn: 1e-7 },
  medium: { tex: 0.5, shadow: 2048, veg: 0.75, forest: 2000, forestTrees: 0.8, terrainCell: 1.3, dpr: 1.5, pixels: 2.6e6, ao: true, smaa: SMAAPreset.MEDIUM, env: 128, mirror: 0.4, roomLights: 3, poolLights: 2, shadowMove: 1, shadowTurn: 1e-5 },
  low: { tex: 0.35, shadow: 1024, veg: 0.5, forest: 1400, forestTrees: 0.55, terrainCell: 1.7, dpr: 1.25, pixels: 1.4e6, ao: false, smaa: SMAAPreset.LOW, env: 128, mirror: 0.3, roomLights: 1, poolLights: 1, shadowMove: 2.25, shadowTurn: 4e-5 },
};

/** Nome da GPU (ex.: "ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 ...)"); vazio se o navegador esconder. */
function gpuName(): string {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    const name = gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl?.getParameter(gl.RENDERER) ?? '');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return name;
  } catch {
    return ''; // sem WebGL2: o app mostra o fallback
  }
}

/**
 * Drivers que derrubam o contexto WebGL sob pressão de memória/banda (nouveau): no nouveau + GTX 550 Ti,
 * a 1280×760 o 3D caía ~70% das vezes no primeiro quadro; com ~0,6 Mpx renderizados, 0 em 12 tentativas.
 */
export function isFragileGpu(name: string): boolean {
  return /nouveau|\bNV[0-9A-F]{2}\b/i.test(name);
}

/** Orçamento de pixels para GPUs frágeis (a imagem é ampliada na tela). */
export const FRAGILE_PIXELS = 0.6e6;

/** Classifica a GPU pelo nome. null = desconhecida (decide pelo processador). */
export function gpuTier(name: string): Tier | null {
  // drivers problemáticos (nouveau) e renderização por software
  if (/nouveau|\bNV[0-9A-F]{2}\b|swiftshader|llvmpipe|software|microsoft basic/i.test(name)) return 'low';
  // GPUs de celular/tablet
  if (/mali|adreno|powervr|apple gpu|videocore|tegra/i.test(name)) return 'low';
  // Intel integrada: HD/UHD antigas no baixo; Iris Xe no médio; Arc é dedicada
  if (/intel/i.test(name) && !/\barc\b/i.test(name)) return /iris|\bxe\b/i.test(name) ? 'medium' : 'low';
  // AMD integrada (Vega/"Radeon Graphics") e Radeon antigas
  if (/radeon\(tm\) graphics|radeon graphics|vega \d+ graphics/i.test(name)) return 'medium';
  if (/radeon (hd|r[5-7] )|radeon\(tm\) (hd|r[5-7] )/i.test(name)) return 'low';
  // NVIDIA de entrada / gerações antigas
  if (/geforce (gt |gts |gtx [4-6]\d\d\b|[1-9]\d{2}m?\b|\d{4}m\b)/i.test(name)) return 'low';
  if (/geforce (gtx [7-9]\d\d|mx ?\d+|gtx 1050)/i.test(name)) return 'medium';
  return null;
}

export function detectTier(): Tier {
  const q = new URLSearchParams(location.search).get('q');
  if (q === 'high' || q === 'medium' || q === 'low') return q;
  const mobile = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 700;
  if (mobile) return 'low';
  const byGpu = gpuTier(gpuName());
  if (byGpu) return byGpu;
  const cores = navigator.hardwareConcurrency ?? 4;
  return cores >= 8 ? 'high' : cores >= 4 ? 'medium' : 'low';
}
