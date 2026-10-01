import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(root, "node_modules", "three", "examples", "jsm", "libs");
const targetRoot = join(root, "public", "decoders");

await mkdir(targetRoot, { recursive: true });

for (const name of ["draco", "basis"]) {
  const source = join(sourceRoot, name);
  const target = join(targetRoot, name);
  await rm(target, { recursive: true, force: true });
  await cp(source, target, { recursive: true });
}

console.log("Copied Three.js Draco and Basis/KTX2 decoder assets.");
