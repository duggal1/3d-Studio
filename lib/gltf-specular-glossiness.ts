import {
  Color,
  MeshPhysicalMaterial,
  SRGBColorSpace,
  type MeshPhysicalMaterialParameters,
} from "three";
import type { GLTFLoaderPlugin, GLTFParser } from "three/examples/jsm/loaders/GLTFLoader.js";

const EXTENSION = "KHR_materials_pbrSpecularGlossiness";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function object(value: unknown): Record<string, unknown> | null {
  return isObject(value) ? value : null;
}

function textureInfo(value: unknown): { index: number; texCoord?: number; extensions?: Record<string, unknown> } | null {
  const info = object(value);
  if (!info || typeof info.index !== "number" || !Number.isInteger(info.index) || info.index < 0) return null;
  return {
    index: info.index,
    ...(typeof info.texCoord === "number" ? { texCoord: info.texCoord } : {}),
    ...(object(info.extensions) ? { extensions: object(info.extensions) ?? {} } : {}),
  };
}

function factor(value: unknown, length: number): number[] | null {
  if (!Array.isArray(value) || value.length !== length) return null;
  const values: unknown[] = value;
  return values.every((entry): entry is number => typeof entry === "number" && Number.isFinite(entry))
    ? values : null;
}

class SpecularGlossinessMaterial extends MeshPhysicalMaterial {
  constructor(parameters?: MeshPhysicalMaterialParameters) {
    super(parameters);
    this.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <roughnessmap_fragment>",
        `float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
  roughnessFactor = 1.0 - (1.0 - roughness) * texture2D(roughnessMap, vRoughnessMapUv).a;
#endif`,
      ).replace(
        "#include <lights_physical_fragment>",
        `#include <lights_physical_fragment>
material.diffuseContribution = diffuseColor.rgb * (1.0 - max(max(material.specularColor.r, material.specularColor.g), material.specularColor.b));`,
      );
    };
  }

  customProgramCacheKey(): string {
    return EXTENSION;
  }
}

export function specularGlossinessPlugin(parser: GLTFParser): GLTFLoaderPlugin {
  const definition = (index: number) => {
    const json: unknown = parser.json;
    const materials: unknown = object(json)?.materials;
    if (!Array.isArray(materials)) return null;
    const material: unknown = materials[index];
    return object(object(object(material)?.extensions)?.[EXTENSION]);
  };

  return {
    name: EXTENSION,
    getMaterialType: (index) => definition(index) ? SpecularGlossinessMaterial : null,
    extendMaterialParams(index, params: MeshPhysicalMaterialParameters) {
      const extension = definition(index);
      if (!extension) return null;
      const diffuse = factor(extension.diffuseFactor, 4) ?? [1, 1, 1, 1];
      const specular = factor(extension.specularFactor, 3) ?? [1, 1, 1];
      params.color = new Color().setRGB(diffuse[0], diffuse[1], diffuse[2]);
      params.opacity = diffuse[3];
      params.metalness = 0;
      params.roughness = 1 - (typeof extension.glossinessFactor === "number" ? extension.glossinessFactor : 1);
      params.ior = 1.5;
      params.specularIntensity = 1;
      // PhysicalMaterial multiplies this by the dielectric F0 (0.04).
      params.specularColor = new Color().setRGB(specular[0] * 25, specular[1] * 25, specular[2] * 25);
      const diffuseTexture = textureInfo(extension.diffuseTexture);
      const specularTexture = textureInfo(extension.specularGlossinessTexture);
      const pending: Promise<unknown>[] = [];
      if (diffuseTexture) pending.push(parser.assignTexture(params, "map", diffuseTexture, SRGBColorSpace));
      if (specularTexture) {
        pending.push(parser.assignTexture(params, "specularColorMap", specularTexture, SRGBColorSpace));
        pending.push(parser.assignTexture(params, "roughnessMap", specularTexture, SRGBColorSpace));
      }
      return Promise.all(pending);
    },
  };
}
