import * as THREE from "three";
import type { StillFormat } from "@/types/studio";

const MIME_TYPES: Record<StillFormat, string> = {
  webp: "image/webp",
  jpeg: "image/jpeg",
};

export function availableStillFormats(): StillFormat[] {
  if (typeof document === "undefined") return ["webp", "jpeg"];

  const probe = document.createElement("canvas");
  probe.width = 2;
  probe.height = 2;
  return (["webp", "jpeg"] as StillFormat[]).filter((format) =>
    probe.toDataURL(MIME_TYPES[format], 0.8).startsWith(`data:${MIME_TYPES[format]}`),
  );
}

function encode(
  pixels: Uint8Array,
  width: number,
  height: number,
  format: StillFormat,
  quality: number,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot encode a still image.");

  const image = context.createImageData(width, height);
  const rowBytes = width * 4;
  const flipped = new Uint8ClampedArray(pixels.length);

  // readPixels returns bottom-up rows; ImageData is top-down.
  for (let row = 0; row < height; row += 1) {
    const source = (height - 1 - row) * rowBytes;
    flipped.set(pixels.subarray(source, source + rowBytes), row * rowBytes);
  }

  image.data.set(flipped);
  context.putImageData(image, 0, 0);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error(`Could not encode this still as ${format.toUpperCase()}.`));
      },
      MIME_TYPES[format],
      quality,
    );
  });
}

export interface StillRequest {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
  width: number;
  height: number;
  format: StillFormat;
  quality?: number;
}

// Stills are read from the default framebuffer rather than an offscreen target.
// Three.js only applies tone mapping and the sRGB transfer function when
// `currentRenderTarget === null`, so a render-target grab would come back linear
// and blown out. The drawing buffer is still intact within the same task, so
// readPixels right after render() returns the graded frame even with
// `preserveDrawingBuffer: false`.
export async function captureStill(request: StillRequest): Promise<Blob> {
  const { renderer, scene, camera, width, height } = request;
  const gl = renderer.getContext();

  const previousSize = renderer.getSize(new THREE.Vector2());
  const previousRatio = renderer.getPixelRatio();
  const previousAspect = camera.aspect;

  const shotCamera = camera.clone();
  shotCamera.fov = request.fov;
  shotCamera.aspect = width / height;
  shotCamera.position.copy(request.position);
  shotCamera.up.copy(camera.up);
  shotCamera.lookAt(request.target);
  shotCamera.updateProjectionMatrix();
  shotCamera.updateMatrixWorld(true);

  const restore = () => {
    renderer.setPixelRatio(previousRatio);
    renderer.setSize(previousSize.x, previousSize.y, false);
    shotCamera.fov = camera.fov;
    shotCamera.aspect = previousAspect;
    shotCamera.updateProjectionMatrix();
  };

  let pixels: Uint8Array;

  try {
    // updateStyle=false keeps the CSS size, so the visible canvas just softens
    // for the few milliseconds the shot takes instead of reflowing the layout.
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    renderer.render(scene, shotCamera);

    pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  } finally {
    // Restored before the await so no other frame can render at still size.
    restore();
  }

  return encode(pixels, width, height, request.format, request.quality ?? 0.9);
}

export function downloadStill(blob: Blob, fileName: string, format: StillFormat): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${fileName}.${format === "jpeg" ? "jpg" : "webp"}`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}