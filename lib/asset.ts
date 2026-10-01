import type { LocalAssetBundle } from "@/types/studio";

function normalizePath(value: string): string {
  return decodeURIComponent(value)
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\//, "")
    .split("?")[0]
    .split("#")[0];
}

function basename(value: string): string {
  const normalized = normalizePath(value);
  return normalized.slice(normalized.lastIndexOf("/") + 1);
}

export function createLocalAssetBundle(input: File[]): LocalAssetBundle {
  const files = input.filter((file) => file.size > 0);
  const entry = files.find((file) => /\.(glb|gltf)$/i.test(file.name));

  if (!entry) {
    throw new Error("Drop or select a .glb or .gltf file.");
  }

  const format = entry.name.toLowerCase().endsWith(".glb") ? "glb" : "gltf";
  const urls = new Map<File, string>();
  const exact = new Map<string, string>();
  const byBasename = new Map<string, string | null>();

  for (const file of files) {
    if (file === entry) continue;

    const objectUrl = URL.createObjectURL(file);
    urls.set(file, objectUrl);

    const relativePath = normalizePath(file.webkitRelativePath || file.name);
    const name = normalizePath(file.name);

    exact.set(relativePath, objectUrl);
    exact.set(name, objectUrl);

    const base = basename(relativePath);
    if (!byBasename.has(base)) {
      byBasename.set(base, objectUrl);
    } else if (byBasename.get(base) !== objectUrl) {
      byBasename.set(base, null);
    }
  }

  let released = false;

  return {
    id: `${entry.name}:${entry.size}:${entry.lastModified}:${crypto.randomUUID()}`,
    entry,
    files,
    format,
    resolveUrl(url) {
      if (/^(blob:|data:|https?:)/i.test(url)) return url;

      const normalized = normalizePath(url);
      const exactMatch = exact.get(normalized);
      if (exactMatch) return exactMatch;

      const suffixMatch = [...exact.entries()].find(([path]) =>
        path.endsWith(`/${normalized}`),
      )?.[1];
      if (suffixMatch) return suffixMatch;

      const baseMatch = byBasename.get(basename(normalized));
      return baseMatch || url;
    },
    release() {
      if (released) return;
      released = true;
      for (const objectUrl of urls.values()) URL.revokeObjectURL(objectUrl);
      urls.clear();
    },
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = units[0];

  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index];
  }

  return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${unit}`;
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}
