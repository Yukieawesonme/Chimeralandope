/**
 * Noise Generator - Perlin/Simplex noise for terrain generation
 */

export interface NoiseOptions {
  scale: number;
  octaves: number;
  persistence: number;
  lacunarity: number;
  seed: number;
}

// Type-safe Float32Array wrapper that guarantees non-undefined access
class SafeFloat32Array {
  private arr: Float32Array;
  constructor(length: number) {
    this.arr = new Float32Array(length);
  }
  get length(): number { return this.arr.length; }
  get(index: number): number {
    const val = this.arr[index];
    return val !== undefined ? val : 0;
  }
  set(index: number, value: number): void { this.arr[index] = value; }
  // Index signature for bracket notation (read/write)
  [index: number]: number;
  subarray(begin: number, end?: number): Float32Array { return this.arr.subarray(begin, end); }
}

export class Noise {
  private perm: SafeFloat32Array;
  private permGrad3: SafeFloat32Array;
  private options: NoiseOptions;

  constructor(options: NoiseOptions) {
    this.options = options;
    this.perm = new SafeFloat32Array(512);
    this.permGrad3 = new SafeFloat32Array(512 * 3);
    this.initPermutation(options.seed);
  }

  private initPermutation(seed: number): void {
    let random = seed;
    const randomFn = (): number => {
      random = (random * 16807) % 2147483647;
      return (random - 1) / 2147483646;
    };

    const perm = this.perm;
    for (let i = 0; i < 256; i++) {
      perm.set(i, i);
    }

    // Fisher-Yates shuffle
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(randomFn() * (i + 1));
      const temp = perm.get(i);
      perm.set(i, perm.get(j));
      perm.set(j, temp);
    }

    // Duplicate for wrapping
    for (let i = 0; i < 256; i++) {
      perm.set(i + 256, perm.get(i));
    }

    // 3D gradients
    const gradients = new SafeFloat32Array(36);
    gradients.set(0, 1); gradients.set(1, 1); gradients.set(2, 0);
    gradients.set(3, -1); gradients.set(4, 1); gradients.set(5, 0);
    gradients.set(6, 1); gradients.set(7, -1); gradients.set(8, 0);
    gradients.set(9, -1); gradients.set(10, -1); gradients.set(11, 0);
    gradients.set(12, 1); gradients.set(13, 0); gradients.set(14, 1);
    gradients.set(15, -1); gradients.set(16, 0); gradients.set(17, 1);
    gradients.set(18, 1); gradients.set(19, 0); gradients.set(20, -1);
    gradients.set(21, -1); gradients.set(22, 0); gradients.set(23, -1);
    gradients.set(24, 0); gradients.set(25, 1); gradients.set(26, 1);
    gradients.set(27, 0); gradients.set(28, -1); gradients.set(29, 1);
    gradients.set(30, 0); gradients.set(31, 1); gradients.set(32, -1);
    gradients.set(33, 0); gradients.set(34, -1); gradients.set(35, -1);

    const permGrad3 = this.permGrad3;
    for (let i = 0; i < 512; i++) {
      const g = perm.get(i) % 12;
      permGrad3.set(i * 3, gradients.get(g * 3));
      permGrad3.set(i * 3 + 1, gradients.get(g * 3 + 1));
      permGrad3.set(i * 3 + 2, gradients.get(g * 3 + 2));
    }
  }

  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
  }

  private grad3(hash: number, x: number, y: number, z: number): number {
    const i = hash * 3;
    // @ts-ignore - SafeFloat32Array index signature guarantees number
    return this.permGrad3[i] * x + this.permGrad3[i + 1] * y + this.permGrad3[i + 2] * z;
  }

  noise3D(x: number, y: number, z: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;

    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);

    const u = this.fade(x);
    const v = this.fade(y);
    const w = this.fade(z);

    // @ts-ignore - SafeFloat32Array index signature guarantees number
    const A = this.perm[X] + Y;
    // @ts-ignore - SafeFloat32Array index signature guarantees number
    const AA = this.perm[A] + Z;
    // @ts-ignore - SafeFloat32Array index signature guarantees number
    const AB = this.perm[A + 1] + Z;
    // @ts-ignore - SafeFloat32Array index signature guarantees number
    const B = this.perm[X + 1] + Y;
    // @ts-ignore - SafeFloat32Array index signature guarantees number
    const BA = this.perm[B] + Z;
    // @ts-ignore - SafeFloat32Array index signature guarantees number
    const BB = this.perm[B + 1] + Z;

    return this.lerp(
      this.lerp(
        // @ts-ignore - SafeFloat32Array index signature guarantees number
        this.lerp(this.grad3(this.perm[AA], x, y, z), this.grad3(this.perm[BA], x - 1, y, z), u),
        // @ts-ignore - SafeFloat32Array index signature guarantees number
        this.lerp(this.grad3(this.perm[AB], x, y - 1, z), this.grad3(this.perm[BB], x - 1, y - 1, z), u),
        v
      ),
      this.lerp(
        // @ts-ignore - SafeFloat32Array index signature guarantees number
        this.lerp(this.grad3(this.perm[AA + 1], x, y, z - 1), this.grad3(this.perm[BA + 1], x - 1, y, z - 1), u),
        // @ts-ignore - SafeFloat32Array index signature guarantees number
        this.lerp(this.grad3(this.perm[AB + 1], x, y - 1, z - 1), this.grad3(this.perm[BB + 1], x - 1, y - 1, z - 1), u),
        v
      ),
      w
    );
  }

  getFBM(x: number, z: number): number {
    let value = 0;
    let amplitude = 1;
    let frequency = this.options.scale;
    let maxValue = 0;

    for (let i = 0; i < this.options.octaves; i++) {
      value += this.noise3D(x * frequency, 0, z * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= this.options.persistence;
      frequency *= this.options.lacunarity;
    }

    return value / maxValue;
  }
}