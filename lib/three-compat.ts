"use client";

import * as THREE from "three";

/**
 * R3F v9 constructs `new THREE.Clock()` internally, but three r183+
 * deprecates `THREE.Clock` in favour of `THREE.Timer`, so every Canvas
 * mount logs:
 *
 *   "THREE.Clock: This module has been deprecated. Please use THREE.Timer instead."
 *
 * R3F has not migrated to `Timer` yet, so this uses three's own
 * `setConsoleFunction` hook to drop exactly that upstream warning while
 * forwarding every other THREE log/warn/error untouched. Our own frame
 * code avoids `state.clock` entirely (it throttles via accumulated
 * `delta`), so nothing in `components/studio` depends on the deprecated
 * Clock API.
 */
let installed = false;

const IGNORED_WARNING = "Clock: This module has been deprecated";

export function installThreeClockCompat(): void {
  if (installed) return;
  installed = true;
  if (typeof window === "undefined") return;

  try {
    const native = {
      log: console.log.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
    } as const;

    type ConsoleMethod = keyof typeof native;

    THREE.setConsoleFunction((method: string, message: string, ...params: unknown[]) => {
      if (typeof message === "string" && message.includes(IGNORED_WARNING)) return;
      const fn = (native as Record<string, (...args: unknown[]) => void>)[method as ConsoleMethod];
      if (typeof fn === "function") fn(message, ...params);
      else native.warn(message, ...params);
    });
  } catch {
    // Never break rendering because of a cosmetic console-warning shim.
  }
}
