import { effect, sampler, texture, type Gpu, type Target } from 'vgpu';
import { createFieldrLogoMask, LOGO_MASK_SIZE } from './logoMask';
import fragment from './shader.wgsl';

/** Shared scene setup uploading the runtime Fieldr logo alpha mask as r8unorm. */
export function createScene(gpu: Gpu, output: Target) {
  const artwork = texture(gpu, {
    kind: '2d',
    size: LOGO_MASK_SIZE,
    format: 'r8unorm',
    usage: ['texture_binding', 'copy_dst'],
    label: 'fieldr-logo-mask',
  });
  const maskPixels = createFieldrLogoMask();
  gpu.gpu.queue.writeTexture(
    { texture: artwork.gpu },
    maskPixels.buffer,
    { bytesPerRow: LOGO_MASK_SIZE[0] },
    [LOGO_MASK_SIZE[0], LOGO_MASK_SIZE[1], 1],
  );
  const shader = effect(gpu, fragment, {
    label: 'fieldr-holographic-card',
    set: {
      params: { resolution: output.size, tilt: [0, 0], pointer: [0.2, -0.25], hover: 0 },
      artwork,
      linear: sampler(gpu, { minFilter: 'linear', magFilter: 'linear' }),
    },
  });
  return shader;
}
