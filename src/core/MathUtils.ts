// ChimeraLand - Core Math Utilities
// Vector3, Quaternion, Matrix4, Ray, Bounds, Lerp/Slerp utilities
// Zero-allocation math for 60 FPS game loop

export const EPSILON = 0.0001;
export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;
export const GRAVITY = -9.81;
export const FIXED_DT = 1 / 60;

export class Vec3 {
    x: number = 0;
    y: number = 0;
    z: number = 0;

    constructor(x: number = 0, y: number = 0, z: number = 0) {
        this.x = x; this.y = y; this.z = z;
    }

    static zero(): Vec3 { return new Vec3(0, 0, 0); }
    static up(): Vec3 { return new Vec3(0, 1, 0); }
    static down(): Vec3 { return new Vec3(0, -1, 0); }
    static left(): Vec3 { return new Vec3(-1, 0, 0); }
    static right(): Vec3 { return new Vec3(1, 0, 0); }
    static forward(): Vec3 { return new Vec3(0, 0, -1); }
    static back(): Vec3 { return new Vec3(0, 0, 1); }
    static one(): Vec3 { return new Vec3(1, 1, 1); }

    copy(): Vec3 { return new Vec3(this.x, this.y, this.z); }
    set(x: number, y: number, z: number): this { this.x = x; this.y = y; this.z = z; return this; }
    copyFrom(v: Vec3): this { this.x = v.x; this.y = v.y; this.z = v.z; return this; }

    // Arithmetic (mutable for performance)
    add(v: Vec3): this { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
    sub(v: Vec3): this { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
    mul(s: number): this { this.x *= s; this.y *= s; this.z *= s; return this; }
    div(s: number): this { const inv = 1 / s; this.x *= inv; this.y *= inv; this.z *= inv; return this; }
    addScaled(v: Vec3, s: number): this { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }

    // Immutable versions
    added(v: Vec3): Vec3 { return new Vec3(this.x + v.x, this.y + v.y, this.z + v.z); }
    subbed(v: Vec3): Vec3 { return new Vec3(this.x - v.x, this.y - v.y, this.z - v.z); }
    mulled(s: number): Vec3 { return new Vec3(this.x * s, this.y * s, this.z * s); }
    divved(s: number): Vec3 { return new Vec3(this.x / s, this.y / s, this.z / s); }

    length(): number { return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z); }
    lengthSq(): number { return this.x * this.x + this.y * this.y + this.z * this.z; }
    normalize(): this { const l = this.length(); if (l > EPSILON) this.div(l); return this; }
    normalized(): Vec3 { const v = this.copy(); v.normalize(); return v; }

    dot(v: Vec3): number { return this.x * v.x + this.y * v.y + this.z * v.z; }
    cross(v: Vec3): Vec3 { return new Vec3(
        this.y * v.z - this.z * v.y,
        this.z * v.x - this.x * v.z,
        this.x * v.y - this.y * v.x
    ); }
    crossTo(out: Vec3, v: Vec3): void {
        out.x = this.y * v.z - this.z * v.y;
        out.y = this.z * v.x - this.x * v.z;
        out.z = this.x * v.y - this.y * v.x;
    }

    distanceTo(v: Vec3): number { return this.subbed(v).length(); }
    distanceSq(v: Vec3): number { return this.subbed(v).lengthSq(); }

    lerp(v: Vec3, t: number): this {
        this.x += (v.x - this.x) * t;
        this.y += (v.y - this.y) * t;
        this.z += (v.z - this.z) * t;
        return this;
    }
    lerped(v: Vec3, t: number): Vec3 {
        return new Vec3(
            this.x + (v.x - this.x) * t,
            this.y + (v.y - this.y) * t,
            this.z + (v.z - this.z) * t
        );
    }

    clampLength(max: number): this {
        const lenSq = this.lengthSq();
        if (lenSq > max * max) this.mul(max / Math.sqrt(lenSq));
        return this;
    }

    projectOnPlane(planeNormal: Vec3): this {
        const dot = this.dot(planeNormal);
        this.x -= planeNormal.x * dot;
        this.y -= planeNormal.y * dot;
        this.z -= planeNormal.z * dot;
        return this;
    }

    reflect(normal: Vec3): Vec3 {
        const dot = this.dot(normal) * 2;
        return new Vec3(
            this.x - normal.x * dot,
            this.y - normal.y * dot,
            this.z - normal.z * dot
        );
    }

    rotateY(angle: number): this {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const x = this.x * cos + this.z * sin;
        const z = this.x * -sin + this.z * cos;
        this.x = x; this.z = z;
        return this;
    }

    equals(v: Vec3, eps: number = EPSILON): boolean {
        return Math.abs(this.x - v.x) < eps &&
               Math.abs(this.y - v.y) < eps &&
               Math.abs(this.z - v.z) < eps;
    }

    toString(): string { return `Vec3(${this.x.toFixed(3)}, ${this.y.toFixed(3)}, ${this.z.toFixed(3)})`; }
}

// Pool for temporary Vec3 to avoid GC pressure
export class Vec3Pool {
    private static pool: Vec3[] = [];
    private static maxSize = 64;

    static get(): Vec3 {
        return this.pool.pop() || new Vec3();
    }

    static release(v: Vec3): void {
        v.set(0, 0, 0);
        if (this.pool.length < this.maxSize) this.pool.push(v);
    }

    static with(x: number, y: number, z: number): Vec3 {
        const v = this.get();
        v.set(x, y, z);
        return v;
    }
}

export class Quat {
    x: number = 0;
    y: number = 0;
    z: number = 0;
    w: number = 1;

    constructor(x: number = 0, y: number = 0, z: number = 0, w: number = 1) {
        this.x = x; this.y = y; this.z = z; this.w = w;
    }

    static identity(): Quat { return new Quat(0, 0, 0, 1); }
    static fromEuler(yaw: number, pitch: number, roll: number): Quat {
        const cy = Math.cos(yaw * 0.5);
        const sy = Math.sin(yaw * 0.5);
        const cp = Math.cos(pitch * 0.5);
        const sp = Math.sin(pitch * 0.5);
        const cr = Math.cos(roll * 0.5);
        const sr = Math.sin(roll * 0.5);

        return new Quat(
            sr * cp * cy - cr * sp * sy,
            cr * sp * cy + sr * cp * sy,
            cr * cp * sy - sr * sp * cy,
            cr * cp * cy + sr * sp * sy
        );
    }
    static fromAxisAngle(axis: Vec3, angle: number): Quat {
        const half = angle * 0.5;
        const s = Math.sin(half);
        return new Quat(axis.x * s, axis.y * s, axis.z * s, Math.cos(half)).normalize();
    }
    static lookRotation(forward: Vec3, up: Vec3 = Vec3.up()): Quat {
        const f = forward.normalized();
        const r = up.cross(f).normalize();
        const u = f.cross(r);
        const m00 = r.x, m01 = r.y, m02 = r.z;
        const m10 = u.x, m11 = u.y, m12 = u.z;
        const m20 = f.x, m21 = f.y, m22 = f.z;
        const trace = m00 + m11 + m22;
        if (trace > 0) {
            const s = Math.sqrt(trace + 1) * 2;
            return new Quat(
                (m21 - m12) / s,
                (m02 - m20) / s,
                (m10 - m01) / s,
                0.25 * s
            );
        } else if (m00 > m11 && m00 > m22) {
            const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
            return new Quat(
                0.25 * s,
                (m01 + m10) / s,
                (m02 + m20) / s,
                (m21 - m12) / s
            );
        } else if (m11 > m22) {
            const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
            return new Quat(
                (m01 + m10) / s,
                0.25 * s,
                (m12 + m21) / s,
                (m02 - m20) / s
            );
        } else {
            const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
            return new Quat(
                (m02 + m20) / s,
                (m12 + m21) / s,
                0.25 * s,
                (m10 - m01) / s
            );
        }
    }

    copy(): Quat { return new Quat(this.x, this.y, this.z, this.w); }
    set(x: number, y: number, z: number, w: number): this { this.x=x;this.y=y;this.z=z;this.w=w;return this; }
    copyFrom(q: Quat): this { this.x=q.x;this.y=q.y;this.z=q.z;this.w=q.w;return this; }

    normalize(): this { const l = Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w); if(l>EPSILON){const inv=1/l;this.x*=inv;this.y*=inv;this.z*=inv;this.w*=inv;}return this; }
    normalized(): Quat { return this.copy().normalize(); }

    mul(q: Quat): this {
        const x = this.w * q.x + this.x * q.w + this.y * q.z - this.z * q.y;
        const y = this.w * q.y - this.x * q.z + this.y * q.w + this.z * q.x;
        const z = this.w * q.z + this.x * q.y - this.y * q.x + this.z * q.w;
        const w = this.w * q.w - this.x * q.x - this.y * q.y - this.z * q.z;
        this.x = x; this.y = y; this.z = z; this.w = w;
        return this;
    }

    slerp(q: Quat, t: number): this {
        let dot = this.x * q.x + this.y * q.y + this.z * q.z + this.w * q.w;
        let qx = q.x, qy = q.y, qz = q.z, qw = q.w;
        if (dot < 0) { dot = -dot; qx = -qx; qy = -qy; qz = -qz; qw = -qw; }
        if (dot > 0.9995) {
            this.x += (qx - this.x) * t;
            this.y += (qy - this.y) * t;
            this.z += (qz - this.z) * t;
            this.w += (qw - this.w) * t;
            return this.normalize();
        }
        const theta = Math.acos(Math.min(1, Math.max(-1, dot)));
        const sinTheta = Math.sin(theta);
        const s0 = Math.sin((1 - t) * theta) / sinTheta;
        const s1 = Math.sin(t * theta) / sinTheta;
        this.x = this.x * s0 + qx * s1;
        this.y = this.y * s0 + qy * s1;
        this.z = this.z * s0 + qz * s1;
        this.w = this.w * s0 + qw * s1;
        return this;
    }

    rotateVec3(v: Vec3): Vec3 {
        const qx = this.x, qy = this.y, qz = this.z, qw = this.w;
        const ix = qw * v.x + qy * v.z - qz * v.y;
        const iy = qw * v.y + qz * v.x - qx * v.z;
        const iz = qw * v.z + qx * v.y - qy * v.x;
        const iw = -qx * v.x - qy * v.y - qz * v.z;
        return new Vec3(
            ix * qw + iw * -qx + iy * -qz - iz * -qy,
            iy * qw + iw * -qy + iz * -qx - ix * -qz,
            iz * qw + iw * -qz + ix * -qy - iy * -qx
        );
    }

    toEuler(): Vec3 {
        const sinr = 2 * (this.w * this.x + this.y * this.z);
        const cosr = 1 - 2 * (this.x * this.x + this.y * this.y);
        const roll = Math.atan2(sinr, cosr);

        const sinp = 2 * (this.w * this.y - this.z * this.x);
        const pitch = Math.abs(sinp) >= 1 ? Math.sign(sinp) * Math.PI / 2 : Math.asin(sinp);

        const siny = 2 * (this.w * this.z + this.x * this.y);
        const cosy = 1 - 2 * (this.y * this.y + this.z * this.z);
        const yaw = Math.atan2(siny, cosy);

        return new Vec3(pitch, yaw, roll);
    }

    equals(q: Quat, eps: number = EPSILON): boolean {
        return Math.abs(this.x - q.x) < eps &&
               Math.abs(this.y - q.y) < eps &&
               Math.abs(this.z - q.z) < eps &&
               Math.abs(this.w - q.w) < eps;
    }
}

export class Mat4 {
    m: Float32Array = new Float32Array(16);

    constructor() { this.identity(); }

    identity(): this {
        this.m[0]=1;this.m[1]=0;this.m[2]=0;this.m[3]=0;
        this.m[4]=0;this.m[5]=1;this.m[6]=0;this.m[7]=0;
        this.m[8]=0;this.m[9]=0;this.m[10]=1;this.m[11]=0;
        this.m[12]=0;this.m[13]=0;this.m[14]=0;this.m[15]=1;
        return this;
    }

    static translation(v: Vec3): Mat4 {
        const mat = new Mat4();
        mat.m[12] = v.x; mat.m[13] = v.y; mat.m[14] = v.z;
        return mat;
    }

    static rotation(q: Quat): Mat4 {
        const mat = new Mat4();
        const x = q.x, y = q.y, z = q.z, w = q.w;
        const x2 = x + x, y2 = y + y, z2 = z + z;
        const xx = x * x2, yy = y * y2, zz = z * z2;
        const xy = x * y2, xz = x * z2, yz = y * z2;
        const wx = w * x2, wy = w * y2, wz = w * z2;
        mat.m[0] = 1 - (yy + zz);
        mat.m[1] = xy - wz;
        mat.m[2] = xz + wy;
        mat.m[4] = xy + wz;
        mat.m[5] = 1 - (xx + zz);
        mat.m[6] = yz - wx;
        mat.m[8] = xz - wy;
        mat.m[9] = yz + wx;
        mat.m[10] = 1 - (xx + yy);
        return mat;
    }

    static scale(v: Vec3): Mat4 {
        const mat = new Mat4();
        mat.m[0] = v.x; mat.m[5] = v.y; mat.m[10] = v.z;
        return mat;
    }

    static trs(pos: Vec3, rot: Quat, scale: Vec3): Mat4 {
        const mat = Mat4.rotation(rot);
        mat.m[0] *= scale.x; mat.m[1] *= scale.x; mat.m[2] *= scale.x;
        mat.m[4] *= scale.y; mat.m[5] *= scale.y; mat.m[6] *= scale.y;
        mat.m[8] *= scale.z; mat.m[9] *= scale.z; mat.m[10] *= scale.z;
        mat.m[12] = pos.x; mat.m[13] = pos.y; mat.m[14] = pos.z;
        return mat;
    }

    multiply(other: Mat4): this {
        const a = this.m, b = other.m;
        const r = new Float32Array(16);
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                r[i * 4 + j] = a[i * 4] * b[j] + a[i * 4 + 1] * b[j + 4] + a[i * 4 + 2] * b[j + 8] + a[i * 4 + 3] * b[j + 12];
            }
        }
        this.m = r;
        return this;
    }

    transformPoint(v: Vec3): Vec3 {
        const m = this.m;
        const x = v.x, y = v.y, z = v.z;
        const w = m[3] * x + m[7] * y + m[11] * z + m[15];
        const invW = w !== 0 ? 1 / w : 1;
        return new Vec3(
            (m[0] * x + m[4] * y + m[8] * z + m[12]) * invW,
            (m[1] * x + m[5] * y + m[9] * z + m[13]) * invW,
            (m[2] * x + m[6] * y + m[10] * z + m[14]) * invW
        );
    }

    transformVector(v: Vec3): Vec3 {
        const m = this.m;
        return new Vec3(
            m[0] * v.x + m[4] * v.y + m[8] * v.z,
            m[1] * v.x + m[5] * v.y + m[9] * v.z,
            m[2] * v.x + m[6] * v.y + m[10] * v.z
        );
    }
}

export class Ray {
    origin: Vec3;
    direction: Vec3;

    constructor(origin: Vec3 = new Vec3(), direction: Vec3 = new Vec3(0, 0, -1)) {
        this.origin = origin.copy();
        this.direction = direction.normalized();
    }

    getPoint(t: number): Vec3 {
        return this.origin.added(this.direction.mulled(t));
    }
}

export class Bounds {
    min: Vec3;
    max: Vec3;

    constructor(min: Vec3 = new Vec3(Infinity, Infinity, Infinity), max: Vec3 = new Vec3(-Infinity, -Infinity, -Infinity)) {
        this.min = min; this.max = max;
    }

    static fromPoints(points: Vec3[]): Bounds {
        const b = new Bounds();
        for (const p of points) b.encapsulate(p);
        return b;
    }

    encapsulate(v: Vec3): void {
        this.min.x = Math.min(this.min.x, v.x);
        this.min.y = Math.min(this.min.y, v.y);
        this.min.z = Math.min(this.min.z, v.z);
        this.max.x = Math.max(this.max.x, v.x);
        this.max.y = Math.max(this.max.y, v.y);
        this.max.z = Math.max(this.max.z, v.z);
    }

    expand(amount: number): void {
        this.min.x -= amount; this.min.y -= amount; this.min.z -= amount;
        this.max.x += amount; this.max.y += amount; this.max.z += amount;
    }

    getCenter(): Vec3 { return new Vec3((this.min.x + this.max.x) * 0.5, (this.min.y + this.max.y) * 0.5, (this.min.z + this.max.z) * 0.5); }
    getSize(): Vec3 { return new Vec3(this.max.x - this.min.x, this.max.y - this.min.y, this.max.z - this.min.z); }
    getExtents(): Vec3 { return new Vec3((this.max.x - this.min.x) * 0.5, (this.max.y - this.min.y) * 0.5, (this.max.z - this.min.z) * 0.5); }

    contains(v: Vec3): boolean {
        return v.x >= this.min.x && v.x <= this.max.x &&
               v.y >= this.min.y && v.y <= this.max.y &&
               v.z >= this.min.z && v.z <= this.max.z;
    }

    intersects(other: Bounds): boolean {
        return this.min.x <= other.max.x && this.max.x >= other.min.x &&
               this.min.y <= other.max.y && this.max.y >= other.min.y &&
               this.min.z <= other.max.z && this.max.z >= other.min.z;
    }

    intersectRay(ray: Ray): number | null {
        let tmin = -Infinity, tmax = Infinity;
        for (let i = 0; i < 3; i++) {
            const invD = 1 / (i === 0 ? ray.direction.x : i === 1 ? ray.direction.y : ray.direction.z);
            const o = i === 0 ? ray.origin.x : i === 1 ? ray.origin.y : ray.origin.z;
            let t1 = ( (i === 0 ? this.min.x : i === 1 ? this.min.y : this.min.z) - o ) * invD;
            let t2 = ( (i === 0 ? this.max.x : i === 1 ? this.max.y : this.max.z) - o ) * invD;
            if (t1 > t2) [t1, t2] = [t2, t1];
            tmin = Math.max(tmin, t1);
            tmax = Math.min(tmax, t2);
            if (tmin > tmax) return null;
        }
        return tmax < 0 ? null : Math.max(tmin, 0);
    }

    copy(): Bounds { return new Bounds(this.min.copy(), this.max.copy()); }
}

export function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
export function clamp(v: number, min: number, max: number): number { return Math.max(min, Math.min(max, v)); }
export function smoothstep(edge0: number, edge1: number, x: number): number {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
}
export function smootherstep(edge0: number, edge1: number, x: number): number {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * t * (t * (t * 6 - 15) + 10);
}
export function approach(current: number, target: number, delta: number): number {
    if (current < target) return Math.min(current + delta, target);
    return Math.max(current - delta, target);
}
export function damp(current: number, target: number, smoothing: number, dt: number): number {
    return target + (current - target) * Math.exp(-smoothing * dt);
}
export function wrapAngle(angle: number): number {
    while (angle <= -Math.PI) angle += 2 * Math.PI;
    while (angle > Math.PI) angle -= 2 * Math.PI;
    return angle;
}
export function angleDifference(a: number, b: number): number {
    return wrapAngle(b - a);
}