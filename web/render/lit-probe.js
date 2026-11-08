// Fraction of a tiny offscreen render that is lit (boot probe: "is the canvas actually drawing?").
import * as THREE from "three";

export function createLitProbe(renderer, scene, camera) {
  const target = new THREE.WebGLRenderTarget(64, 40);
  return {
    litFraction() {
      try {
        const buf = new Uint8Array(64 * 40 * 4);
        renderer.setRenderTarget(target);
        renderer.render(scene, camera);
        renderer.readRenderTargetPixels(target, 0, 0, 64, 40, buf);
        renderer.setRenderTarget(null);
        let lit = 0;
        for (let i = 0; i < buf.length; i += 4) if (buf[i] + buf[i + 1] + buf[i + 2] > 6) lit++;
        return lit / (64 * 40);
      } catch (err) {
        renderer.setRenderTarget(null);
        console.warn("[renderer] litFraction failed", err);
        return 0;
      }
    },
    dispose() { target.dispose(); },
  };
}
