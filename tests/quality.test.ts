import { describe, expect, it } from 'vitest';
import { gpuTier, isFragileGpu } from '../src/render/quality';

describe('gpuTier', () => {
  it.each([
    ['ANGLE (NVIDIA, NVIDIA GeForce GTX 550 Ti (0x00001244) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'low'],
    ['NVCF', 'low'],
    ['ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)', 'low'],
    ['ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00003EA0) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'low'],
    ['ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'medium'],
    ['Mesa Intel(R) Xe Graphics (TGL GT2)', 'medium'],
    ['ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001638) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'medium'],
    ['ANGLE (NVIDIA, NVIDIA GeForce GT 1030 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'low'],
    ['ANGLE (NVIDIA, NVIDIA GeForce GTX 960 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'medium'],
    ['ANGLE (NVIDIA, NVIDIA GeForce MX250 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'medium'],
    ['Adreno (TM) 640', 'low'],
  ])('%s → %s', (name, tier) => expect(gpuTier(name)).toBe(tier));

  it.each([
    'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)',
  ])('%s → decide pelo processador', (name) => expect(gpuTier(name)).toBeNull());
});

describe('isFragileGpu', () => {
  it('reconhece o nouveau', () => {
    expect(isFragileGpu('NVCF')).toBe(true);
    expect(isFragileGpu('nouveau')).toBe(true);
    expect(isFragileGpu('ANGLE (NVIDIA, NVIDIA GeForce GTX 550 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe(false);
  });
});
