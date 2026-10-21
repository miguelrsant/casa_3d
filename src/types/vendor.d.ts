// Declarações mínimas para pacotes sem tipos publicados no package.json.

declare module 'troika-three-text' {
  import { Color, Material, Mesh } from 'three';
  export class Text extends Mesh {
    text: string;
    font: string | null;
    fontSize: number;
    letterSpacing: number;
    lineHeight: number | 'normal';
    anchorX: number | string;
    anchorY: number | string;
    color: Color | number | string | null;
    colorRanges: Record<number, Color | number | string> | null;
    fillOpacity: number;
    maxWidth: number;
    textAlign: string;
    outlineWidth: number | string;
    outlineColor: Color | number | string;
    material: Material;
    depthOffset: number;
    sync(callback?: () => void): void;
    dispose(): void;
  }
  export class BatchedText extends Text {
    addText(t: Text): void;
    removeText(t: Text): void;
  }
  export function preloadFont(opts: { font?: string; characters?: string | string[] }, cb: () => void): void;
}

declare module 'n8ao' {
  import { Camera, Color, Scene } from 'three';
  import { Pass } from 'postprocessing';
  export class N8AOPostPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number);
    configuration: {
      aoRadius: number;
      distanceFalloff: number;
      intensity: number;
      color: Color;
      halfRes: boolean;
      depthAwareUpsampling: boolean;
      gammaCorrection: boolean;
      transparencyAware: boolean;
      screenSpaceRadius: boolean;
      aoSamples: number;
      denoiseSamples: number;
      denoiseRadius: number;
      accumulate: boolean;
      [k: string]: unknown;
    };
    setQualityMode(mode: string): void;
  }
}
