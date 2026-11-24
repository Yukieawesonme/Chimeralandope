/**
 * Advanced Shaders - Triplanar Terrain, Foliage Wind, Water, Volumetric Fog
 * High-quality GLSL shaders for ChimeraLand visual fidelity
 */

import * as THREE from 'three';

// ============================================================================
// TERRAIN TRIPLANAR SHADER
// ============================================================================

export const terrainTriplanarVertexShader = `
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying vec2 vUv;
  varying float vElevation;
  varying vec3 vBiomeWeights;

  uniform float uGlobalScale;
  uniform float uHeightScale;

  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vElevation = worldPos.y;

    // Biome weights would be passed from biome manager
    vBiomeWeights = vec3(1.0, 0.0, 0.0); // Placeholder

    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const terrainTriplanarFragmentShader = `
  #define LAYER_COUNT 8

  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying vec2 vUv;
  varying float vElevation;
  varying vec3 vBiomeWeights;

  uniform float uGlobalScale;
  uniform float uTime;

  // Layer uniforms (would be arrays in production)
  uniform sampler2D uLayer0Albedo;
  uniform sampler2D uLayer0Normal;
  uniform sampler2D uLayer0Roughness;
  uniform float uLayer0Scale;
  uniform float uLayer0BlendSharpness;
  uniform vec3 uLayer0Tint;

  uniform sampler2D uLayer1Albedo;
  uniform sampler2D uLayer1Normal;
  uniform sampler2D uLayer1Roughness;
  uniform float uLayer1Scale;
  uniform float uLayer1BlendSharpness;
  uniform vec3 uLayer1Tint;

  uniform sampler2D uLayer2Albedo;
  uniform sampler2D uLayer2Normal;
  uniform sampler2D uLayer2Roughness;
  uniform float uLayer2Scale;
  uniform float uLayer2BlendSharpness;
  uniform vec3 uLayer2Tint;

  uniform sampler2D uLayer3Albedo;
  uniform sampler2D uLayer3Normal;
  uniform sampler2D uLayer3Roughness;
  uniform float uLayer3Scale;
  uniform float uLayer3BlendSharpness;
  uniform vec3 uLayer3Tint;

  uniform sampler2D uLayer4Albedo;
  uniform sampler2D uLayer4Normal;
  uniform sampler2D uLayer4Roughness;
  uniform float uLayer4Scale;
  uniform float uLayer4BlendSharpness;
  uniform vec3 uLayer4Tint;

  uniform sampler2D uLayer5Albedo;
  uniform sampler2D uLayer5Normal;
  uniform sampler2D uLayer5Roughness;
  uniform float uLayer5Scale;
  uniform float uLayer5BlendSharpness;
  uniform vec3 uLayer5Tint;

  uniform sampler2D uLayer6Albedo;
  uniform sampler2D uLayer6Normal;
  uniform sampler2D uLayer6Roughness;
  uniform float uLayer6Scale;
  uniform float uLayer6BlendSharpness;
  uniform vec3 uLayer6Tint;

  uniform sampler2D uLayer7Albedo;
  uniform sampler2D uLayer7Normal;
  uniform sampler2D uLayer7Roughness;
  uniform float uLayer7Scale;
  uniform float uLayer7BlendSharpness;
  uniform vec3 uLayer7Tint;

  // Biome blending
  uniform vec3 uBiomeColor[5];
  uniform float uBiomeWeights[5];
  uniform float uBiomeTransition;

  // Triplanar sampling
  vec3 triplanarSample(sampler2D tex, vec3 pos, vec3 normal, float scale) {
    vec3 blend = abs(normal);
    blend = pow(blend, vec3(10.0));
    blend /= dot(blend, vec3(1.0));

    vec2 uvX = pos.zy * scale;
    vec2 uvY = pos.xz * scale;
    vec2 uvZ = pos.xy * scale;

    vec3 colX = texture2D(tex, uvX).rgb;
    vec3 colY = texture2D(tex, uvY).rgb;
    vec3 colZ = texture2D(tex, uvZ).rgb;

    return colX * blend.x + colY * blend.y + colZ * blend.z;
  }

  vec3 triplanarNormal(sampler2D tex, vec3 pos, vec3 normal, float scale, float strength) {
    vec3 blend = abs(normal);
    blend = pow(blend, vec3(10.0));
    blend /= dot(blend, vec3(1.0));

    vec2 uvX = pos.zy * scale;
    vec2 uvY = pos.xz * scale;
    vec2 uvZ = pos.xy * scale;

    vec3 nX = texture2D(tex, uvX).rgb * 2.0 - 1.0;
    vec3 nY = texture2D(tex, uvY).rgb * 2.0 - 1.0;
    vec3 nZ = texture2D(tex, uvZ).rgb * 2.0 - 1.0;

    // Rotate normals to world space
    nX = vec3(nX.x, nX.z, -nX.y); // YZ plane
    nY = vec3(-nY.y, nY.x, nY.z); // XZ plane
    nZ = nZ; // XY plane

    return normalize(nX * blend.x + nY * blend.y + nZ * blend.z) * strength;
  }

  // Smooth biome blending
  float biomeBlend(float a, float b, float transition) {
    float t = smoothstep(0.5 - transition, 0.5 + transition, a);
    return mix(b, a, t);
  }

  void main() {
    vec3 worldPos = vWorldPosition;
    vec3 normal = vWorldNormal;

    // Calculate biome blend weights based on position
    float biomeWeights[5];
    biomeWeights[0] = uBiomeWeights[0];
    biomeWeights[1] = uBiomeWeights[1];
    biomeWeights[2] = uBiomeWeights[2];
    biomeWeights[3] = uBiomeWeights[3];
    biomeWeights[4] = uBiomeWeights[4];

    // Normalize
    float totalWeight = 0.0;
    for (int i = 0; i < 5; i++) totalWeight += biomeWeights[i];
    for (int i = 0; i < 5; i++) biomeWeights[i] /= max(totalWeight, 0.001);

    // Sample each layer
    vec3 albedo = vec3(0.0);
    vec3 normalMap = vec3(0.0, 1.0, 0.0);
    float roughness = 0.0;
    float metalness = 0.0;
    float ao = 1.0;

    // Layer 0 - Grass
    if (biomeWeights[0] > 0.01) {
      float w = biomeWeights[0];
      albedo += triplanarSample(uLayer0Albedo, worldPos, normal, uLayer0Scale) * uLayer0Tint * w;
      normalMap += triplanarNormal(uLayer0Normal, worldPos, normal, uLayer0Scale, 1.0) * w;
      roughness += texture2D(uLayer0Roughness, worldPos.xz * uLayer0Scale).r * w;
    }

    // Layer 1 - Dirt/Path
    if (biomeWeights[1] > 0.01) {
      float w = biomeWeights[1];
      albedo += triplanarSample(uLayer1Albedo, worldPos, normal, uLayer1Scale) * uLayer1Tint * w;
      normalMap += triplanarNormal(uLayer1Normal, worldPos, normal, uLayer1Scale, 1.0) * w;
      roughness += texture2D(uLayer1Roughness, worldPos.xz * uLayer1Scale).r * w;
    }

    // Layer 2 - Rock
    if (biomeWeights[2] > 0.01) {
      float w = biomeWeights[2];
      albedo += triplanarSample(uLayer2Albedo, worldPos, normal, uLayer2Scale) * uLayer2Tint * w;
      normalMap += triplanarNormal(uLayer2Normal, worldPos, normal, uLayer2Scale, 1.0) * w;
      roughness += texture2D(uLayer2Roughness, worldPos.xz * uLayer2Scale).r * w;
    }

    // Layer 3 - Sand
    if (biomeWeights[3] > 0.01) {
      float w = biomeWeights[3];
      albedo += triplanarSample(uLayer3Albedo, worldPos, normal, uLayer3Scale) * uLayer3Tint * w;
      normalMap += triplanarNormal(uLayer3Normal, worldPos, normal, uLayer3Scale, 1.0) * w;
      roughness += texture2D(uLayer3Roughness, worldPos.xz * uLayer3Scale).r * w;
    }

    // Layer 4 - Snow/Ice
    if (biomeWeights[4] > 0.01) {
      float w = biomeWeights[4];
      albedo += triplanarSample(uLayer4Albedo, worldPos, normal, uLayer4Scale) * uLayer4Tint * w;
      normalMap += triplanarNormal(uLayer4Normal, worldPos, normal, uLayer4Scale, 1.0) * w;
      roughness += texture2D(uLayer4Roughness, worldPos.xz * uLayer4Scale).r * w;
    }

    // Height-based blending (elevation)
    float heightFactor = smoothstep(40.0, 80.0, vElevation);
    albedo = mix(albedo, triplanarSample(uLayer2Albedo, worldPos, normal, uLayer2Scale) * uLayer2Tint, heightFactor * 0.3);

    // Slope-based blending (steep = rock)
    float slope = 1.0 - abs(normal.y);
    float rockBlend = smoothstep(0.5, 0.8, slope);
    albedo = mix(albedo, triplanarSample(uLayer2Albedo, worldPos, normal, uLayer2Scale) * uLayer2Tint, rockBlend * 0.5);

    // Final color with biome tint
    vec3 biomeTint = vec3(1.0);
    for (int i = 0; i < 5; i++) {
      biomeTint += uBiomeColor[i] * biomeWeights[i];
    }
    albedo *= biomeTint;

    // Micro-detail noise
    float detail = texture2D(uLayer0Albedo, worldPos.xz * 50.0).r;
    albedo += (detail - 0.5) * 0.02;

    // Output
    gl_FragColor = vec4(albedo, 1.0);

    // For deferred rendering, would output to G-buffer:
    // gl_FragData[0] = vec4(albedo, 1.0);
    // gl_FragData[1] = vec4(normalMap * 0.5 + 0.5, roughness);
    // gl_FragData[2] = vec4(metalness, ao, 0.0, 0.0);
  }
`;

// ============================================================================
// FOLIAGE WIND SHADER
// ============================================================================

export const foliageVertexShader = `
  attribute vec3 aPosition;
  attribute vec3 aNormal;
  attribute vec2 aUv;
  attribute float aWindId; // 0=grass, 1=bush, 2=tree, 3=flower

  uniform mat4 modelMatrix;
  uniform mat4 viewMatrix;
  uniform mat4 projectionMatrix;
  uniform float uTime;
  uniform vec3 uWindDirection;
  uniform float uWindStrength;
  uniform float uWindSpeed;
  uniform float uGlobalWindGust;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying float vWindId;

  // Pseudo-random hash
  float hash(float x) {
    return fract(sin(x * 12.9898) * 43758.5453);
  }

  float hash2(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    vUv = aUv;
    vNormal = normalize(normalMatrix * aNormal);
    vWindId = aWindId;

    vec3 pos = aPosition;
    vec3 worldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
    vWorldPos = worldPos;

    // Wind calculation
    float windPhase = uTime * uWindSpeed;

    // Base wind
    float windAmount = uWindStrength * uGlobalWindGust;

    // Per-vertex variation
    float vertexHash = hash2(aPosition.xz * 10.0);
    float phaseOffset = vertexHash * 6.28;
    float strengthMul = mix(0.5, 1.5, vertexHash);

    // Wind direction influence
    vec3 windDir = normalize(uWindDirection);
    float windAlignment = dot(normalize(aNormal), windDir);
    windAlignment = max(0.0, windAlignment); // Only bend away from wind

    // Grass/flowers bend more
    float typeMul = mix(1.0, 0.3, aWindId * 0.33);

    // Calculate displacement
    vec3 displacement = windDir * windAmount * strengthMul * typeMul * windAlignment;

    // Add turbulence
    float turb = sin(windPhase * 2.0 + phaseOffset + worldPos.x * 0.1) * 0.5;
    displacement += windDir * turb * windAmount * 0.3 * typeMul;

    // Vertical sway (plants don't bend into ground)
    displacement.y *= 0.1;

    // Apply displacement (more at top)
    float heightFactor = smoothstep(0.0, 1.0, aUv.y);
    pos += displacement * heightFactor * heightFactor;

    // Add subtle rotation for grass blades
    if (aWindId < 0.5) {
      float angle = windAmount * strengthMul * 0.3 * sin(windPhase + phaseOffset);
      mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
      pos.xz = rot * pos.xz;
    }

    gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
  }
`;

export const foliageFragmentShader = `
  uniform sampler2D uAlbedoMap;
  uniform sampler2D uNormalMap;
  uniform sampler2D uAlphaMap;
  uniform vec3 uAlbedoTint;
  uniform float uAlphaCutoff;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying float vWindId;

  void main() {
    vec4 albedoTex = texture2D(uAlbedoMap, vUv);
    float alpha = albedoTex.a;

    // Alpha test
    if (alpha < uAlphaCutoff) discard;

    vec3 albedo = albedoTex.rgb * uAlbedoTint;

    // Normal mapping
    vec3 normalMap = texture2D(uNormalMap, vUv).rgb * 2.0 - 1.0;
    vec3 normal = normalize(vNormal + normalMap * 0.5);

    // Subsurface scattering for leaves/grass
    float ss = max(0.0, dot(normal, vec3(0.0, 1.0, 0.0)));
    albedo += vec3(0.1, 0.2, 0.05) * ss * 0.3;

    // Fresnel for grass edges
    float viewDot = dot(normal, normalize(vWorldPos - cameraPosition));
    float fresnel = pow(1.0 - abs(viewDot), 3.0);
    albedo += vec3(0.2, 0.4, 0.1) * fresnel * 0.2;

    gl_FragColor = vec4(albedo, alpha);
  }
`;

// ============================================================================
// WATER SHADER
// ============================================================================

export const waterVertexShader = `
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vViewDir;

  uniform float uTime;
  uniform float uWaveScale;
  uniform float uWaveSpeed;
  uniform float uShoreDistance;

  // Gerstner waves
  vec3 gerstnerWave(vec2 pos, float amplitude, float wavelength, float speed, float direction, float steepness) {
    float k = 2.0 * 3.14159 / wavelength;
    float c = sqrt(9.81 / k); // phase velocity
    float f = k * (dot(pos, vec2(cos(direction), sin(direction))) - speed * uTime);

    float cosF = cos(f);
    float sinF = sin(f);

    return vec3(
      steepness * amplitude * cosF * cos(direction),
      amplitude * sinF,
      steepness * amplitude * cosF * sin(direction)
    );
  }

  void main() {
    vUv = uv;
    vec3 pos = position;

    // Multiple wave layers
    vec3 waveOffset = vec3(0.0);

    // Large swells
    waveOffset += gerstnerWave(pos.xz * 0.5, 0.8, 50.0, 1.0, 0.5, 0.05);
    waveOffset += gerstnerWave(pos.xz * 0.3, 0.5, 30.0, 0.8, 2.1, 0.04);

    // Medium waves
    waveOffset += gerstnerWave(pos.xz, 0.3, 15.0, 1.2, 1.2, 0.08);
    waveOffset += gerstnerWave(pos.xz * 1.5, 0.2, 10.0, 1.5, 3.8, 0.06);

    // Small ripples
    waveOffset += gerstnerWave(pos.xz * 2.0, 0.1, 5.0, 2.0, 0.8, 0.1);
    waveOffset += gerstnerWave(pos.xz * 3.0, 0.05, 2.0, 3.0, 4.5, 0.15);

    // Shore damping
    float shoreFade = smoothstep(0.0, uShoreDistance, vWorldPosition.y);
    waveOffset *= shoreFade;

    pos += waveOffset;

    vWorldPosition = (modelMatrix * vec4(pos, 1.0)).xyz;
    vViewDir = normalize(cameraPosition - vWorldPosition);

    gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
  }
`;

export const waterFragmentShader = `
  uniform sampler2D uNormalMap;
  uniform sampler2D uFoamMap;
  uniform vec3 uDeepColor;
  uniform vec3 uShallowColor;
  uniform vec3 uFoamColor;
  uniform float uTransparency;
  uniform float uFresnelPower;
  uniform float uRefractionStrength;

  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vViewDir;

  void main() {
    // Animated normal map
    vec2 normalUv1 = vUv * 4.0 + vec2(0.01, 0.02) * 0.05;
    vec2 normalUv2 = vUv * 8.0 + vec2(-0.015, 0.01) * 0.08;

    vec3 n1 = texture2D(uNormalMap, normalUv1).rgb * 2.0 - 1.0;
    vec3 n2 = texture2D(uNormalMap, normalUv2).rgb * 2.0 - 1.0;
    vec3 normal = normalize(n1 + n2);

    // Depth-based color
    float depth = max(0.0, -vWorldPosition.y);
    float depthFactor = smoothstep(0.0, 10.0, depth);
    vec3 baseColor = mix(uShallowColor, uDeepColor, depthFactor);

    // Fresnel
    float viewDot = dot(normalize(vViewDir), normal);
    float fresnel = pow(1.0 - abs(viewDot), uFresnelPower);
    vec3 fresnelColor = vec3(0.8, 0.9, 1.0) * fresnel * 0.4;

    // Refraction (approximate)
    float refraction = (1.0 - viewDot) * uRefractionStrength;
    baseColor += fresnelColor;

    // Foam
    float foam = texture2D(uFoamMap, vUv * 2.0 + vec2(0.0, 0.05)).r;
    foam = smoothstep(0.3, 0.7, foam + fresnel * 0.5);
    vec3 foamColor = mix(baseColor, uFoamColor, foam);

    // Shore foam
    float shoreFoam = smoothstep(0.0, 2.0, vWorldPosition.y);
    foam = max(foam, shoreFoam * 0.5);

    vec3 finalColor = foamColor;

    // Underwater fog
    float fogFactor = 1.0 - exp(-depth * 0.15);
    finalColor = mix(finalColor, uDeepColor, fogFactor * 0.5);

    // Transparency
    float alpha = uTransparency * (1.0 - foam * 0.5) * (1.0 - fresnel * 0.3);

    gl_FragColor = vec4(finalColor, alpha);
  }
`;

// ============================================================================
// VOLUMETRIC FOG SHADER
// ============================================================================

export const volumetricFogVertexShader = `
  varying vec3 vWorldPosition;
  varying vec3 vViewDir;
  varying float vDepth;

  void main() {
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    vec4 clipPos = projectionMatrix * viewMatrix * vec4(vWorldPosition, 1.0);
    vDepth = clipPos.z / clipPos.w;
    vViewDir = normalize(cameraPosition - vWorldPosition);
    gl_Position = clipPos;
  }
`;

export const volumetricFogFragmentShader = `
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform float uFogHeightFalloff;
  uniform float uFogGroundLevel;
  uniform vec3 uSunDirection;
  uniform vec3 uSunColor;
  uniform float uSunIntensity;
  uniform float uTime;
  uniform sampler3D uNoiseTexture;

  varying vec3 vWorldPosition;
  varying vec3 vViewDir;
  varying float vDepth;

  // Ray marching
  float raymarch(vec3 ro, vec3 rd, float maxDist) {
    float totalDensity = 0.0;
    float dist = 0.0;
    float stepSize = maxDist / 64.0;

    for (int i = 0; i < 64; i++) {
      vec3 pos = ro + rd * dist;

      // Height-based density
      float height = pos.y;
      float heightFactor = exp(-max(0.0, height - 0.0) * 0.1);

      // Noise-based variation
      vec3 noisePos = pos * 0.01 + vec3(0.0, 0.0, 0.0);
      float noise = texture(uNoiseTexture, noisePos * 0.5).r;
      noise = mix(0.5, noise, 0.5);

      float density = 0.02 * heightFactor * (0.5 + noise * 0.5);

      totalDensity += density * stepSize;
      dist += stepSize;

      if (dist > maxDist) break;
      if (totalDensity > 1.0) break;
    }

    return 1.0 - exp(-totalDensity * 5.0);
  }

  void main() {
    vec3 ro = cameraPosition;
    vec3 rd = vViewDir;

    // Calculate far plane distance
    float far = 500.0;

    // Ray march
    float fogAmount = raymarch(ro, rd, far);

    // Sun scattering
    float sunDot = max(0.0, dot(normalize(vViewDir), uSunDirection));
    float sunScatter = pow(sunDot, 32.0) * uSunIntensity;

    // Mie scattering (haze around sun)
    float mieScatter = pow(max(0.0, sunDot), 256.0) * uSunIntensity * 0.5;

    // Fog color with sun influence
    vec3 fogColor = uFogColor;
    fogColor += uSunColor * (sunScatter + mieScatter);

    // Height-based fog variation
    float heightFog = smoothstep(0.0, 100.0, cameraPosition.y);
    fogAmount *= mix(1.0, 0.3, heightFog);

    // Final color
    vec3 color = mix(vec3(0.0), uFogColor, fogAmount);
    color += vec3(sunScatter, sunScatter * 0.8, sunScatter * 0.6) * uSunColor;

    gl_FragColor = vec4(color, fogAmount);
  }
`;

// ============================================================================
// SKY/ATMOSPHERE SHADER
// ============================================================================

export const skyVertexShader = `
  varying vec3 vWorldPosition;
  varying vec3 vViewDir;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    vViewDir = normalize(cameraPosition - vWorldPosition);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const skyFragmentShader = `
  uniform vec3 uSunDirection;
  uniform vec3 uSunColor;
  uniform float uSunIntensity;
  uniform vec3 uSkyTint;
  uniform vec3 uHorizonColor;
  uniform vec3 uZenithColor;
  uniform float uSunSize;
  uniform float uAtmosphereThickness;
  uniform float uTime;

  varying vec3 vWorldPosition;
  varying vec3 vViewDir;

  // Atmosphere scattering (simplified)
  vec3 atmosphereScatter(vec3 viewDir, vec3 sunDir) {
    float sunDot = max(0.0, dot(viewDir, sunDir));
    float theta = acos(max(-1.0, min(1.0, sunDot)));

    // Rayleigh scattering (blue sky)
    float rayleigh = 1.0 / (1.0 + theta * 2.0);

    // Mie scattering (sun glow)
    float mie = pow(max(0.0, sunDot), 32.0);

    vec3 color = vec3(0.0);
    color += vec3(0.4, 0.6, 1.0) * rayleigh * 0.8; // Rayleigh - blue
    color += vec3(1.0, 0.9, 0.7) * mie * 0.5; // Mie - warm sun

    return color;
  }

  void main() {
    vec3 viewDir = vViewDir;

    // Base sky gradient
    float horizon = viewDir.y;
    vec3 skyColor = mix(uHorizonColor, uZenithColor, smoothstep(-0.1, 0.5, horizon));
    skyColor *= uSkyTint;

    // Sun
    float sunDot = max(0.0, dot(viewDir, normalize(uSunDirection)));
    float sun = pow(sunDot, 1024.0) * 1000.0;

    // Atmosphere
    vec3 atm = atmosphereScatter(viewDir, normalize(uSunDirection));

    // Combine
    vec3 color = skyColor + atm;
    color += uSunColor * sun;

    // Stars (at night)
    float nightFactor = smoothstep(-0.1, 0.1, -viewDir.y);
    if (nightFactor > 0.5) {
      vec2 starUv = vWorldPosition.xz * 100.0;
      float stars = 0.0;
      for (int i = 0; i < 5; i++) {
        vec2 offset = vec2(float(i) * 123.45, float(i) * 67.89);
        float star = pow(max(0.0, fract(sin(dot(starUv + offset, vec2(12.9898, 78.233))) * 43758.5453) - 0.999), 10.0);
        stars += star;
      }
      color += vec3(1.0, 1.0, 0.9) * stars * nightFactor;
    }

    // Moon
    vec3 moonDir = normalize(-uSunDirection);
    float moonDot = max(0.0, dot(viewDir, moonDir));
    float moon = pow(moonDot, 512.0) * 50.0;
    color += vec3(0.9, 0.9, 1.0) * moon;

    // Exposure/tonemap
    color = color / (color + vec3(1.0));
    color = pow(color, vec3(1.0 / 2.2));

    gl_FragColor = vec4(color, 1.0);
  }
`;

// ============================================================================
// SHADER MATERIAL FACTORY
// ============================================================================

export class ShaderMaterialFactory {
  static createTerrainMaterial(uniforms: any): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      vertexShader: terrainTriplanarVertexShader,
      fragmentShader: terrainTriplanarFragmentShader,
      uniforms: {
        uGlobalScale: { value: 1.0 },
        uTime: { value: 0 },
        uHeightScale: { value: 64.0 },
        uLayer0Scale: { value: 0.02 },
        uLayer0BlendSharpness: { value: 1.0 },
        uLayer0Tint: { value: new THREE.Color(0x5a8a5a) },
        uLayer1Scale: { value: 0.03 },
        uLayer1BlendSharpness: { value: 1.0 },
        uLayer1Tint: { value: new THREE.Color(0x6a5a4a) },
        uLayer2Scale: { value: 0.015 },
        uLayer2BlendSharpness: { value: 1.0 },
        uLayer2Tint: { value: new THREE.Color(0x6a6a6a) },
        uLayer3Scale: { value: 0.025 },
        uLayer3BlendSharpness: { value: 1.0 },
        uLayer3Tint: { value: new THREE.Color(0xd4c4a0) },
        uLayer4Scale: { value: 0.02 },
        uLayer4BlendSharpness: { value: 1.0 },
        uLayer4Tint: { value: new THREE.Color(0xf0f0f0) },
        uBiomeColor: { value: [
          new THREE.Color(0x5a8a5a), // Spirit Plains
          new THREE.Color(0x7a8a9a), // Floating Mountains
          new THREE.Color(0x9a6a5a), // Ash Desert
          new THREE.Color(0x5a7a5a), // Toxic Swamp
          new THREE.Color(0x7a9ab0), // Coastal
        ]},
        uBiomeWeights: { value: [1, 0, 0, 0, 0] },
        uBiomeTransition: { value: 0.1 },
        ...uniforms,
      },
      defines: {
        LAYER_COUNT: 8,
      },
    });
  }

  static createFoliageMaterial(uniforms: any): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      vertexShader: foliageVertexShader,
      fragmentShader: foliageFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uWindDirection: { value: new THREE.Vector3(1, 0, 0) },
        uWindStrength: { value: 0.3 },
        uWindSpeed: { value: 1.0 },
        uGlobalWindGust: { value: 1.0 },
        uAlbedoTint: { value: new THREE.Color(0xffffff) },
        uAlphaCutoff: { value: 0.1 },
        ...uniforms,
      },
      transparent: true,
      alphaTest: 0.1,
      side: THREE.DoubleSide,
    });
  }

  static createWaterMaterial(uniforms: any): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      vertexShader: waterVertexShader,
      fragmentShader: waterFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uWaveScale: { value: 1.0 },
        uWaveSpeed: { value: 1.0 },
        uShoreDistance: { value: 50.0 },
        uDeepColor: { value: new THREE.Color(0x0a2a4a) },
        uShallowColor: { value: new THREE.Color(0x2a6a8a) },
        uFoamColor: { value: new THREE.Color(0xf0f0f0) },
        uTransparency: { value: 0.7 },
        uFresnelPower: { value: 5.0 },
        uRefractionStrength: { value: 0.3 },
        ...uniforms,
      },
      transparent: true,
      side: THREE.DoubleSide,
    });
  }

  static createVolumetricFogMaterial(uniforms: any): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      vertexShader: volumetricFogVertexShader,
      fragmentShader: volumetricFogFragmentShader,
      uniforms: {
        uFogColor: { value: new THREE.Color(0x081426) },
        uFogDensity: { value: 0.01 },
        uFogHeightFalloff: { value: 0.1 },
        uFogGroundLevel: { value: 0.0 },
        uSunDirection: { value: new THREE.Vector3(0.5, 1, 0.3) },
        uSunColor: { value: new THREE.Color(0xfff0e0) },
        uSunIntensity: { value: 1.0 },
        uTime: { value: 0 },
        ...uniforms,
      },
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
    });
  }

  static createSkyMaterial(uniforms: any): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      vertexShader: skyVertexShader,
      fragmentShader: skyFragmentShader,
      uniforms: {
        uSunDirection: { value: new THREE.Vector3(0.5, 1, 0.3) },
        uSunColor: { value: new THREE.Color(0xfff0e0) },
        uSunIntensity: { value: 1.0 },
        uSkyTint: { value: new THREE.Color(0xffffff) },
        uHorizonColor: { value: new THREE.Color(0x4a7a9a) },
        uZenithColor: { value: new THREE.Color(0x1a3a5a) },
        uSunSize: { value: 0.01 },
        uAtmosphereThickness: { value: 1.0 },
        uTime: { value: 0 },
        ...uniforms,
      },
      side: THREE.BackSide,
      depthWrite: false,
    });
  }
}