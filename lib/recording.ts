const MIME_TYPES = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
  "video/mp4;codecs=avc1.42E01E",
  "video/mp4",
];

function supportedMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

export function canRecordCanvas(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    typeof HTMLCanvasElement !== "undefined" &&
    "captureStream" in HTMLCanvasElement.prototype &&
    Boolean(supportedMimeType())
  );
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export async function recordCanvasSequence(
  canvas: HTMLCanvasElement,
  runSequence: () => Promise<void>,
): Promise<{ blob: Blob; extension: "webm" | "mp4" }> {
  const mimeType = supportedMimeType();
  if (!mimeType) throw new Error("This browser cannot record the 3D canvas.");

  const stream = canvas.captureStream(60);
  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 14_000_000,
  });

  const stopped = new Promise<void>((resolve, reject) => {
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    });
    recorder.addEventListener("stop", () => resolve(), { once: true });
    recorder.addEventListener("error", () => reject(new Error("MediaRecorder failed while recording the canvas.")), { once: true });
  });

  try {
    recorder.start(250);
    await nextFrame();
    await nextFrame();
    await runSequence();
    await nextFrame();
    recorder.stop();
    await stopped;
  } catch (error) {
    if (recorder.state !== "inactive") recorder.stop();
    throw error;
  } finally {
    for (const track of stream.getTracks()) track.stop();
  }

  const extension = mimeType.startsWith("video/mp4") ? "mp4" : "webm";
  return {
    blob: new Blob(chunks, { type: mimeType }),
    extension,
  };
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
