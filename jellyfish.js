'use strict';

// An ASCII jellyfish rendered onto an upright character grid.
//
// The animal is modelled in 3D and every part is splatted into a z-buffered
// grid of cells, so glyphs never rotate: motion shows up as characters
// changing, like the terminal it imitates.
//
// What makes it feel alive:
//   - the bell beats with a fast squeeze and a slow refill, with a little
//     irregularity from beat to beat;
//   - each squeeze is a push: the body surges along its own axis and then
//     coasts and sinks, steering by leaning a few degrees, never flipping;
//   - tentacles and oral arms are free chains dragged through water (Verlet),
//     so they lag the surge, straighten, then curl back during the glide.

const canvas = document.querySelector('#ocean');
const ctx = canvas.getContext('2d');
const motionButton = document.querySelector('#motion');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

const { sin, cos, sqrt, abs, min, max, exp, floor, ceil, round, hypot, PI } = Math;
const TAU = 2 * PI;
const STEP = 1 / 120;          // physics step, seconds
const INTRO = 6;               // camera eases from above the bell to beside it
const INTRO_PITCH = 0.95;      // starting camera angle above the bell (radians, ~55°)
const FIRST_SHIFT = 6;         // first colour change
const SHIFT_EVERY = 6.5;       // seconds between colour changes
const SWEEP = 2.6;             // a new colour flows from the crown to the tentacle tips
const FINAL_PITCH = -0.13;     // camera ends slightly below, looking up into the bell

const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
const smooth = t => { t = clamp(t); return t * t * (3 - 2 * t); };
const smoother = t => { t = clamp(t); return t * t * t * (t * (t * 6 - 15) + 10); };
const hash = n => { const s = sin(n * 127.1 + 311.7) * 43758.5453; return s - floor(s); };

// bell, stripe, core (oral arms), thread (tentacles); RGB 0..1
const palettes = [
    [[0.16, 0.24, 0.86], [0.80, 0.86, 1.00], [0.45, 0.40, 0.98], [0.62, 0.66, 0.92]],
    [[0.16, 0.48, 0.96], [0.88, 0.36, 0.96], [1.00, 0.30, 0.62], [0.56, 0.62, 0.88]],
    [[0.94, 0.24, 0.30], [1.00, 0.84, 0.26], [0.24, 0.74, 1.00], [0.86, 0.60, 0.72]],
    [[0.08, 0.66, 0.60], [0.56, 0.95, 0.36], [1.00, 0.56, 0.16], [0.62, 0.80, 0.76]],
    [[0.95, 0.36, 0.12], [1.00, 0.72, 0.22], [0.62, 0.42, 1.00], [0.90, 0.66, 0.56]],
    [[0.20, 0.34, 0.92], [0.40, 0.82, 1.00], [1.00, 0.80, 0.26], [0.76, 0.72, 0.62]]
];
const BELL = 0, STRIPE = 1, CORE = 2, THREAD = 3;
const LUT = 64;
const lut = new Float32Array(4 * (LUT + 1) * 3);
const glowLut = new Float32Array(LUT + 1);

// Cell kinds below 32; anything else is a literal character code.
const K_BELL = 1, K_RIM = 2, K_SUB = 3, K_ARM = 4, K_ARM_L = 5, K_ARM_R = 6;
const RAMP = '.:;-=+*o08B%$#@';
const ARM_RAMP = '*+xo8B%&$@#';
const RIM_CHARS = '=~-=_~';
const SUB_CHARS = '.:;,-~';
const charCache = [];
const glyph = code => charCache[code] ??= String.fromCharCode(code);

// ---------------------------------------------------------------- colour

// Precompute colour along the body (0 = crown, 1 = tentacle tips) for this frame.
function updateColors(t) {
    let shift = -1, front = 9;
    if (t >= FIRST_SHIFT) {
        shift = floor((t - FIRST_SHIFT) / SHIFT_EVERY);
        front = (t - FIRST_SHIFT - shift * SHIFT_EVERY) / SWEEP - 0.2;
    }
    const next = palettes[(shift + 1) % palettes.length];
    const prev = palettes[max(0, shift) % palettes.length];
    for (let i = 0; i <= LUT; i++) {
        const s = i / LUT;
        const m = smooth((front - s) / 0.2 + 0.5);
        glowLut[i] = front < 2 ? exp(-(((front - s) / 0.07) ** 2)) : 0;
        for (let k = 0; k < 4; k++) {
            for (let c = 0; c < 3; c++) {
                lut[(k * (LUT + 1) + i) * 3 + c] = prev[k][c] + (next[k][c] - prev[k][c]) * m;
            }
        }
    }
}

// ---------------------------------------------------------------- grid

let W = 0, H = 0, R = 0, Hb = 0, cw = 0, ch = 0, cols = 0, rows = 0, cells = 0;
let bellLayer, innerLayer, backLayer, cellHash, stars = [];
let glowCanvas, glowCtx, glowImage;

function makeLayer(n) {
    return {
        z: new Float32Array(n), l: new Float32Array(n),
        r: new Float32Array(n), g: new Float32Array(n), b: new Float32Array(n),
        k: new Uint16Array(n)
    };
}

function plot(L, x, y, d, lum, r, g, b, kind) {
    if (x < 0 || y < 0) return;
    const c = (x / cw) | 0, row = (y / ch) | 0;
    if (c >= cols || row >= rows) return;
    const i = row * cols + c;
    if (d <= L.z[i]) return;
    L.z[i] = d; L.l[i] = lum; L.r[i] = r; L.g[i] = g; L.b[i] = b; L.k[i] = kind;
}

// ---------------------------------------------------------------- transforms

let cp = 1, sp = 0;                    // camera pitch
let ct = 1, st = 0, cl = 1, sl = 0;    // body tilt (screen plane) and lean (toward viewer)
let wx = 0, wy = 0, wz = 0;            // rotate() output
let sx = 0, sy = 0, sd = 0;            // project() output

function setPose() {
    ct = cos(body.tilt); st = sin(body.tilt);
    cl = cos(body.lean); sl = sin(body.lean);
}

// Body frame (y = bell axis) to world orientation.
function rotate(x, y, z) {
    const y1 = y * cl - z * sl, z1 = y * sl + z * cl;
    wx = x * ct + y1 * st;
    wy = -x * st + y1 * ct;
    wz = z1;
}

// World (y up, z toward viewer) to screen pixels plus depth.
function project(x, y, z) {
    sx = W / 2 + x;
    sy = H / 2 - (y * cp - z * sp);
    sd = y * sp + z * cp;
}

// ---------------------------------------------------------------- the beat

// Fast squeeze (30% of the beat), slower refill with a slight overshoot.
function contraction(p) {
    p -= floor(p);
    const k = 0.3;
    if (p < k) return smoother(p / k);
    const q = (p - k) / (1 - k);
    return 1 - smooth(q ** 0.8) - 0.05 * sin(PI * q) ** 2 * (1 - q);
}

const body = {
    x: 0, y: 0, vx: 0, vy: 0, tilt: 0, spin: 0, lean: 0, yaw: 0,
    phase: 0.55, period: 2.7, beat: 0, wobble: 0, c: 0
};

// A slowly wandering spot to hover around; the bell sits in the upper part of the view.
function goal(t) {
    const roam = W * clamp(W / H, 0.45, 1);     // wander less on tall, narrow screens
    return {
        x: roam * (0.13 * sin(0.047 * t + 0.6) + 0.05 * sin(0.113 * t + 2.1)),
        y: H * 0.15 + R * 0.35 * sin(0.071 * t + 1.3)
    };
}

function stepBody(t, dt) {
    const b = body;
    b.phase += dt / b.period;
    if (b.phase >= 1) {
        b.phase -= 1;
        b.beat++;
        b.period = 2.35 + 0.7 * hash(b.beat * 3.1);
        b.wobble = (hash(b.beat * 7.7) - 0.5) * 1.4;
    }
    const before = b.c;
    b.c = contraction(b.phase);
    const squeeze = max(0, (b.c - before) / dt);

    // Steer by leaning a little toward the goal; a jellyfish can't swim sideways.
    const target = goal(t);
    const ex = target.x - b.x, ey = target.y - b.y;
    // A soft, critically damped lean of a few degrees: no overshoot, no swinging.
    const want = clamp(0.15 * ex / R, -0.17, 0.17) + 0.03 * sin(0.21 * t);
    b.spin += dt * (2 * (want - b.tilt) - 2.8 * b.spin + 0.12 * b.wobble * squeeze);
    b.tilt += dt * b.spin;
    b.lean = 0.05 * sin(0.13 * t + 0.4);
    b.yaw += 0.02 * dt;

    // Each squeeze pushes along the bell axis; drag and a slight sink take over between beats.
    const strength = clamp(1 + 1.2 * ey / R, 0.25, 1.9);
    const thrust = 0.95 * R * squeeze * strength;
    const drag = exp(-1.5 * dt);
    b.vx = (b.vx + sin(b.tilt) * thrust * dt) * drag;
    b.vy = (b.vy + (cos(b.tilt) * thrust - 0.37 * R) * dt) * drag;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
}

// ---------------------------------------------------------------- bell shape

const A = PI / 2 + 0.17;    // latitude of the margin: a little past the equator, so it curls in
let shapeR = 0, shapeY = 0;

// u: 0 at the crown, 1 at the margin. c: contraction 0..1.
function bellShape(u, c) {
    const a = u * A;
    const squeeze = 1 - 0.23 * c * u ** 1.5;
    const flare = 1 + 0.07 * (1 - c) * smooth((u - 0.75) / 0.25);
    shapeR = R * sin(a) * squeeze * flare;
    shapeY = Hb * cos(a) * (1 + 0.15 * c);
}

// ---------------------------------------------------------------- tentacles & arms

let strands = [];
let rx = 0, ry = 0, rz = 0, gx = 0, gy = 0, gz = 0;   // rootOf() output

function makeStrand(n, length, options) {
    return Object.assign({
        n, seg: length / (n - 1),
        p: new Float64Array(n * 3), q: new Float64Array(n * 3),
        sx: new Float32Array(n), sy: new Float32Array(n), sd: new Float32Array(n)
    }, options);
}

function buildStrands() {
    strands = [];
    for (let i = 0; i < 4; i++) {
        strands.push(makeStrand(18, (2.0 + 0.35 * hash(i + 40)) * R, {
            arm: true, phi: TAU * (i + 0.5) / 4, seed: i * 1.7 + 0.4,
            drag: 2.6, gravity: 0.85, flow: 0.45, guide: 0.6, bend: 0.55
        }));
    }
    for (let i = 0; i < 16; i++) {
        strands.push(makeStrand(30, (2.6 + 0.9 * hash(i + 3)) * R, {
            arm: false, phi: TAU * (i + 0.5) / 16, seed: hash(i + 11) * TAU,
            drag: 2.0, gravity: 0.9, flow: 0.75, guide: 0.4, bend: 0.22
        }));
    }
}

// Where a strand is attached right now, and which way it leaves the body.
function rootOf(s) {
    const ang = s.phi + body.yaw;
    const ca = cos(ang), sa = sin(ang);
    let x, y, z, dx, dy, dz;
    if (s.arm) {
        x = 0.1 * R * ca; y = 0.5 * Hb * (1 + 0.15 * body.c); z = 0.1 * R * sa;
        dx = 0.12 * ca; dy = -1; dz = 0.12 * sa;
    } else {
        bellShape(1, body.c);
        const r = shapeR * 0.95;
        x = r * ca; y = shapeY; z = r * sa;
        dx = 0.18 * ca; dy = -1; dz = 0.18 * sa;
    }
    rotate(x, y, z);
    rx = wx + body.x; ry = wy + body.y; rz = wz;
    const inv = 1 / hypot(dx, dy, dz);
    rotate(dx * inv, dy * inv, dz * inv);
    gx = wx; gy = wy; gz = wz;
}

function resetStrand(s) {
    rootOf(s);
    for (let i = 0; i < s.n; i++) {
        const k = i * 3;
        s.p[k] = s.q[k] = rx + gx * s.seg * i;
        s.p[k + 1] = s.q[k + 1] = ry + gy * s.seg * i;
        s.p[k + 2] = s.q[k + 2] = rz + gz * s.seg * i;
    }
}

function stepStrand(s, t, dt) {
    rootOf(s);
    const { n, p, q, seg } = s;
    const damp = exp(-s.drag * dt), dt2 = dt * dt, F = s.flow * R, G = s.gravity * R;
    for (let i = 1; i < n; i++) {
        const k = i * 3;
        const x = p[k], y = p[k + 1], z = p[k + 2];
        const vx = (x - q[k]) * damp, vy = (y - q[k + 1]) * damp, vz = (z - q[k + 2]) * damp;
        q[k] = x; q[k + 1] = y; q[k + 2] = z;
        // A slow, uneven current so no two strands sway alike.
        const X = x / R, Y = y / R, Z = z / R;
        // Mostly one shared current, so neighbours sway together, plus a little of their own.
        const own = 0.3 * sin(2.5 * Y + 1.3 * t + s.seed);
        const fx = F * (sin(1.3 * Y + 0.8 * t) + 0.4 * sin(1.7 * Z - 1.1 * t) + own);
        const fy = F * 0.3 * sin(1.5 * X + 0.6 * t);
        const fz = F * (0.7 * cos(1.1 * Y - 0.7 * t) + 0.3 * sin(1.6 * X + 0.9 * t) + own);
        p[k] = x + vx + fx * dt2;
        p[k + 1] = y + vy + (fy - G) * dt2;
        p[k + 2] = z + vz + fz * dt2;
    }
    const rest = 1.85 * seg;
    for (let it = 0; it < 4; it++) {
        p[0] = rx; p[1] = ry; p[2] = rz;
        p[3] += (rx + gx * seg - p[3]) * s.guide;
        p[4] += (ry + gy * seg - p[4]) * s.guide;
        p[5] += (rz + gz * seg - p[5]) * s.guide;
        for (let i = 0; i < n - 1; i++) {
            const a = i * 3, b = a + 3;
            const dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2];
            const d = sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
            const diff = (d - seg) / d;
            if (i === 0) {
                p[b] -= dx * diff; p[b + 1] -= dy * diff; p[b + 2] -= dz * diff;
            } else {
                const h = diff * 0.5;
                p[a] += dx * h; p[a + 1] += dy * h; p[a + 2] += dz * h;
                p[b] -= dx * h; p[b + 1] -= dy * h; p[b + 2] -= dz * h;
            }
        }
        // Resist folding back on itself, but allow soft curls.
        for (let i = 0; i < n - 2; i++) {
            const a = i * 3, b = a + 6;
            const dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2];
            const d = sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
            if (d >= rest) continue;
            const push = (rest - d) / d * s.bend * 0.5;
            if (i === 0) {
                p[b] += dx * push * 2; p[b + 1] += dy * push * 2; p[b + 2] += dz * push * 2;
            } else {
                p[a] -= dx * push; p[a + 1] -= dy * push; p[a + 2] -= dz * push;
                p[b] += dx * push; p[b + 1] += dy * push; p[b + 2] += dz * push;
            }
        }
    }
}

// ---------------------------------------------------------------- simulation

let time = 0, simTime = 0;

function simulate(to) {
    while (simTime + STEP <= to) {
        simTime += STEP;
        stepBody(simTime, STEP);
        setPose();
        for (const s of strands) stepStrand(s, simTime, STEP);
        stepMinis(simTime, STEP);
    }
}

// Place everything and let the tentacles settle before anything is shown.
function settle(t) {
    const start = goal(t - 2.5);
    Object.assign(body, { x: start.x, y: start.y, vx: 0, vy: 0, tilt: 0, spin: 0 });
    setPose();
    buildStrands();
    strands.forEach(resetStrand);
    resetMinis(t - 2.5);
    simTime = t - 2.5;
    simulate(t);
}

// ---------------------------------------------------------------- drawing the parts

function drawBell(t) {
    const L = bellLayer;
    const step = 0.45 * min(cw, ch);
    const nLat = ceil(A * max(R, Hb) * 1.2 / step);
    const lonMax = ceil(TAU * R * 1.12 / step);
    const lx = -0.42, ly = 0.58, lz = 0.70;                 // key light, camera space
    const hx = -0.24, hy = 0.33, hz = 0.91;                 // half vector for the sheen
    for (let i = 0; i <= nLat; i++) {
        const u = i / nLat;
        const c = contraction(body.phase - 0.06 * u);        // the crown follows the margin a moment later
        bellShape(u, c);
        const baseR = shapeR, y = shapeY;
        const a = u * A, nr = sin(a) / R, ny0 = cos(a) / Hb;
        const lappet = smooth((u - 0.86) / 0.14);
        const rimBand = smooth((u - 0.9) / 0.06);
        const nLon = max(6, ceil(lonMax * sin(min(a, PI / 2))) + 6);
        const ci = round(u * 0.22 * LUT);
        const bi = (BELL * (LUT + 1) + ci) * 3, si = (STRIPE * (LUT + 1) + ci) * 3;
        const ki = (CORE * (LUT + 1) + ci) * 3, ti = (THREAD * (LUT + 1) + ci) * 3;
        const glow = 1 + 0.7 * glowLut[ci];
        for (let j = 0; j < nLon; j++) {
            const phi = TAU * (j + (i & 1) * 0.5) / nLon;
            const ang = phi + body.yaw;
            const ca = cos(ang), sa = sin(ang);
            const r = baseR * (1 + 0.03 * cos(16 * phi) * lappet) * (1 + 0.02 * sin(3 * phi + 1.1 * t) * u);
            rotate(r * ca, y, r * sa);
            project(wx + body.x, wy + body.y, wz);
            let nx = nr * ca, ny = ny0, nz = nr * sa;
            const inv = 1 / sqrt(nx * nx + ny * ny + nz * nz);
            rotate(nx * inv, ny * inv, nz * inv);
            nx = wx; ny = wy * cp - wz * sp; nz = wy * sp + wz * cp;
            const stripe = smooth((0.5 + 0.5 * cos(10 * phi + 0.5 * u) - 0.35) / 0.4);
            if (nz >= 0) {
                const diffuse = max(0, nx * lx + ny * ly + nz * lz);
                const fresnel = (1 - nz) ** 2;
                const sheen = max(0, nx * hx + ny * hy + nz * hz) ** 24;
                const lum = (0.14 + 0.42 * diffuse + 0.32 * fresnel + stripe * (0.18 + 0.32 * diffuse)
                    + 0.35 * sheen + 0.45 * rimBand) * glow;
                const m = stripe * 0.85, w = rimBand * 0.45;
                const R0 = lut[bi] + (lut[si] - lut[bi]) * m, G0 = lut[bi + 1] + (lut[si + 1] - lut[bi + 1]) * m;
                const B0 = lut[bi + 2] + (lut[si + 2] - lut[bi + 2]) * m;
                plot(L, sx, sy, sd, lum,
                    R0 + (lut[ti] - R0) * w, G0 + (lut[ti + 1] - G0) * w, B0 + (lut[ti + 2] - B0) * w,
                    rimBand > 0.6 ? K_RIM : K_BELL);
            } else {
                // Looking up through the opening at the inside of the bell.
                const lum = (0.1 + 0.16 * stripe + 0.3 * rimBand) * glow;
                plot(L, sx, sy, sd, lum,
                    (lut[bi] * 0.6 + lut[ki] * 0.4) * 0.9, (lut[bi + 1] * 0.6 + lut[ki + 1] * 0.4) * 0.9,
                    (lut[bi + 2] * 0.6 + lut[ki + 2] * 0.4) * 0.9, rimBand > 0.6 ? K_RIM : K_SUB);
            }
        }
    }
}

function projectStrand(s) {
    for (let i = 0; i < s.n; i++) {
        project(s.p[i * 3], s.p[i * 3 + 1], s.p[i * 3 + 2]);
        s.sx[i] = sx; s.sy[i] = sy; s.sd[i] = sd;
    }
}

function drawTentacle(s, dBody) {
    const { n, sx: X, sy: Y, sd: D } = s;
    for (let i = 0; i < n - 1; i++) {
        const dx = X[i + 1] - X[i], dy = Y[i + 1] - Y[i], dd = D[i + 1] - D[i];
        const ax = dx / cw, ay = dy / ch;
        const steps = max(1, ceil(max(abs(ax), abs(ay)) * 2));
        const code = abs(ax) < 0.45 * abs(ay) ? 124 : abs(ay) < 0.45 * abs(ax) ? 45 : ax * ay > 0 ? 92 : 47;
        for (let k = 0; k < steps; k++) {
            const f = k / steps, along = (i + f) / (n - 1);
            const d = D[i] + dd * f;
            const ci = round((0.22 + 0.78 * along) * LUT);
            const base = (THREAD * (LUT + 1) + ci) * 3;
            const depth = 0.5 + 0.5 * smooth((d - dBody) / (1.6 * R) + 0.5);
            const lum = (0.82 - 0.4 * along) * depth * smooth((1 - along) / 0.15) * (1 + 0.8 * glowLut[ci]);
            plot(innerLayer, X[i] + dx * f, Y[i] + dy * f, d, lum, lut[base], lut[base + 1], lut[base + 2], code);
        }
    }
}

// The oral arms: frilly ribbons that twist slowly as they trail.
function drawArm(s, t, dBody) {
    const { n, sx: X, sy: Y, sd: D } = s;
    const stepPx = 0.5 * min(cw, ch);
    for (let i = 0; i < n - 1; i++) {
        const dx = X[i + 1] - X[i], dy = Y[i + 1] - Y[i], dd = D[i + 1] - D[i];
        const len = hypot(dx, dy) || 1e-6;
        const px = -dy / len, py = dx / len;
        const steps = max(1, ceil(len / stepPx));
        for (let k = 0; k < steps; k++) {
            const f = k / steps, along = (i + f) / (n - 1);
            const cx = X[i] + dx * f, cy = Y[i] + dy * f, d = D[i] + dd * f;
            const twist = s.seed + 5 * along - 0.9 * t;
            const frill = 1 + 0.35 * sin(17 * along - 2.4 * t + 2 * s.seed) * sin(5 * along + 0.7 * t + s.seed);
            const w = R * 0.2 * (1 - 0.55 * along) * (0.45 + 0.55 * abs(cos(twist))) * frill
                * smooth(along / 0.06 + 0.3);
            const fade = smooth((1 - along) / 0.22);
            const ci = round((0.12 + 0.75 * along) * LUT);
            const base = (CORE * (LUT + 1) + ci) * 3;
            const tone = fade * (1 + 0.8 * glowLut[ci]) * (0.6 + 0.4 * smooth((d - dBody) / (1.6 * R) + 0.5));
            for (let o = -w; o <= w; o += 0.5 * cw) {
                const e = w > 0 ? abs(o) / w : 0;
                const shade = (0.3 + 0.55 * (1 - e * e)) * (0.75 + 0.25 * sin(9 * along + 6 * o / R - 1.6 * t + s.seed));
                const kind = e > 0.8 ? (px * o < 0 ? K_ARM_L : K_ARM_R) : K_ARM;
                plot(innerLayer, cx + px * o, cy + py * o, d + (1 - e * e) * 0.05 * R, shade * tone,
                    lut[base], lut[base + 1], lut[base + 2], kind);
            }
        }
    }
}

// ---------------------------------------------------------------- background

// Small distant jellies. They follow the same rules as the big one: a beat, a push up on each
// squeeze, drag, a slow sink, and a gentle pull toward a spot of their own that drifts over time.
// Far ones (low depth) are dimmer, smaller-stroked and lazier.
const MINI_HEAD = [
    [" .-~~-. ", "(      )", " `^^^^` "],     // relaxed, wide open
    ["  .--.  ", " (    ) ", "  `^^`  "],     // half squeezed
    ["  .--.  ", "  (  )  ", "  )^^(  "]      // squeezed: narrow
];
const MINI_WAVE = ["  ( ( ( ", "   ) ) )"];  // tentacles drifting: a wiggle that travels down
const MINI_STREAM = ["  ||||  ", "  ||||  ", "  :;;:  "];  // right after a push: pulled straight behind
const minis = [
    { home: [0.11, 0.22], period: 2.2, depth: 0.95, tint: [0.62, 0.55, 0.68] },
    { home: [0.87, 0.17], period: 2.9, depth: 0.55, tint: [0.50, 0.50, 0.66] },
    { home: [0.90, 0.60], period: 2.5, depth: 0.80, tint: [0.45, 0.62, 0.68] },
    { home: [0.08, 0.68], period: 2.0, depth: 0.60, tint: [0.66, 0.50, 0.58] },
    { home: [0.74, 0.88], period: 3.2, depth: 0.45, tint: [0.52, 0.56, 0.64] },
    { home: [0.27, 0.90], period: 2.6, depth: 0.70, tint: [0.58, 0.52, 0.66] }
];

function miniGoal(m, i, t) {
    return [(m.home[0] + 0.05 * sin(0.05 * t + i * 1.9)) * W, (m.home[1] + 0.06 * sin(0.043 * t + i * 2.7)) * H];
}

function resetMinis(t) {
    minis.forEach((m, i) => {
        const [x, y] = miniGoal(m, i, t);
        Object.assign(m, { x, y, vx: 0, vy: 0, phase: hash(i + 61), c: 0, beat: 0, wave: 0, beatLength: m.period });
    });
}

function stepMinis(t, dt) {
    minis.forEach((m, i) => {
        m.phase += dt / m.beatLength;
        if (m.phase >= 1) {
            m.phase -= 1;
            m.beat++;
            m.beatLength = m.period * (0.88 + 0.24 * hash(m.beat * 5.3 + i));
        }
        const before = m.c;
        m.c = contraction(m.phase);
        const squeeze = max(0, (m.c - before) / dt);
        const [gx, gy] = miniGoal(m, i, t);
        const size = 6 * ch * (0.6 + 0.4 * m.depth);        // about one sprite height
        const lean = clamp((gx - m.x) / (0.25 * W), -0.25, 0.25);
        const strength = clamp(1 + (m.y - gy) / size, 0.2, 1.9);  // push harder when below its spot
        const thrust = 0.75 * size * squeeze * strength;
        const drag = exp(-1.5 * dt);
        m.vx = (m.vx + sin(lean) * thrust * dt) * drag;
        m.vy = (m.vy - cos(lean) * thrust * dt + 0.29 * size * dt) * drag;   // screen y points down
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        m.wave += dt * (1.2 + 0.8 * m.depth);
    });
}

function stamp(x, y, depth, lum, tint, text) {
    for (let j = 0; j < text.length; j++) {
        const code = text.charCodeAt(j);
        if (code !== 32) plot(backLayer, x + j * cw, y, depth, lum, tint[0], tint[1], tint[2], code);
    }
}

function drawBackground(t) {
    for (const s of stars) {
        const lum = s.base * (0.55 + 0.45 * sin(t * s.speed + s.phase));
        plot(backLayer, (s.i % cols + 0.5) * cw, (floor(s.i / cols) + 0.5) * ch, 0, lum, 0.55, 0.58, 0.78, s.code);
    }
    // Drifting specks of marine snow.
    for (let i = 0; i < 46; i++) {
        const x = ((hash(i + 90) * W + 14 * sin(0.3 * t + i)) % W + W) % W;
        const y = ((hash(i + 190) * H - t * (3 + 6 * hash(i + 290))) % H + H) % H;
        plot(backLayer, x, y, 0, 0.14 + 0.12 * hash(i + 390), 0.6, 0.66, 0.8, i % 3 ? 46 : 44);
    }
    minis.forEach(m => {
        const lum = (0.16 + 0.2 * m.depth) * (1 + 0.15 * m.c);
        const x = m.x - 4 * cw, y = m.y - 1.5 * ch;
        const head = MINI_HEAD[m.c < 0.33 ? 0 : m.c < 0.7 ? 1 : 2];
        head.forEach((line, r) => stamp(x, y + r * ch, m.depth, lum, m.tint, line));
        // Tentacles react a moment after the bell: straight while it surges, wiggling while it drifts,
        // and trailing away from the direction it is moving.
        const surge = contraction(m.phase - 0.1) > 0.45;
        for (let r = 0; r < 3; r++) {
            const trail = round(-m.vx * 0.06 * (r + 1) / cw);
            const line = surge ? MINI_STREAM[r] : MINI_WAVE[((floor(m.wave) - r) % 2 + 2) % 2];
            stamp(x + trail * cw, y + (r + 3) * ch, m.depth, lum * (1 - r * 0.22), m.tint, line);
        }
    });
}

// ---------------------------------------------------------------- frame

function render(t) {
    if (!cells) return;
    updateColors(t);
    const pitch = INTRO_PITCH + (FINAL_PITCH - INTRO_PITCH) * smoother((t - 0.3) / INTRO);
    cp = cos(pitch); sp = sin(pitch);
    setPose();

    for (const L of [bellLayer, innerLayer, backLayer]) { L.z.fill(-1e9); L.l.fill(0); }
    drawBackground(t);
    drawBell(t);
    project(body.x, body.y, 0);
    const dBody = sd;
    for (const s of strands) {
        projectStrand(s);
        if (s.arm) drawArm(s, t, dBody); else drawTentacle(s, dBody);
    }

    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = smooth(t / 1.2);
    ctx.font = `500 ${ch * 0.92}px "SF Mono", ui-monospace, Menlo, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const glow = glowImage.data;
    glow.fill(0);
    const B = bellLayer, I = innerLayer, K = backLayer;
    for (let i = 0; i < cells; i++) {
        const lb = B.l[i], li = I.l[i];
        let lum, r, g, b, kind, isBack = false;
        if (lb > 0 && li > 0) {
            if (I.z[i] > B.z[i]) {
                lum = li; r = I.r[i]; g = I.g[i]; b = I.b[i]; kind = I.k[i];
            } else {
                // The bell is translucent: what hangs inside shows through it.
                const wb = lb * 0.5, wi = li * 0.85, w = wb + wi;
                r = (B.r[i] * wb + I.r[i] * wi) / w;
                g = (B.g[i] * wb + I.g[i] * wi) / w;
                b = (B.b[i] * wb + I.b[i] * wi) / w;
                lum = min(1.4, wb + wi * 0.85);
                kind = wi > wb ? I.k[i] : B.k[i];
            }
        } else if (lb > 0) {
            lum = lb; r = B.r[i]; g = B.g[i]; b = B.b[i]; kind = B.k[i];
        } else if (li > 0) {
            lum = li; r = I.r[i]; g = I.g[i]; b = I.b[i]; kind = I.k[i];
        } else if (K.l[i] > 0) {
            lum = K.l[i]; r = K.r[i]; g = K.g[i]; b = K.b[i]; kind = K.k[i]; isBack = true;
        } else continue;
        if (lum < 0.035) continue;

        const h = cellHash[i];
        let code;
        if (kind >= 32) code = kind;
        else if (kind === K_BELL) code = RAMP.charCodeAt(clamp(floor(lum * 0.72 * RAMP.length + (h - 0.5) * 3), 0, RAMP.length - 1));
        else if (kind === K_RIM) code = RIM_CHARS.charCodeAt(floor(h * RIM_CHARS.length));
        else if (kind === K_SUB) code = SUB_CHARS.charCodeAt(floor(h * SUB_CHARS.length));
        else if (kind === K_ARM) code = ARM_RAMP.charCodeAt(clamp(floor(lum * ARM_RAMP.length + (h - 0.5) * 3), 0, ARM_RAMP.length - 1));
        else code = kind === K_ARM_L ? 40 : 41;

        const R8 = min(255, r * lum * 255) | 0, G8 = min(255, g * lum * 255) | 0, B8 = min(255, b * lum * 255) | 0;
        ctx.fillStyle = `rgb(${R8} ${G8} ${B8})`;
        const col = i % cols, row = (i - col) / cols;
        ctx.fillText(glyph(code), (col + 0.5) * cw, (row + 0.5) * ch);
        if (!isBack) {
            const o = i * 4;
            glow[o] = R8; glow[o + 1] = G8; glow[o + 2] = B8; glow[o + 3] = 255;
        }
    }
    // A soft bloom from a tiny copy of the grid.
    glowCtx.putImageData(glowImage, 0, 0);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.38 * smooth(t / 1.2);
    ctx.filter = `blur(${(cw * 1.4).toFixed(1)}px)`;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(glowCanvas, 0, 0, cols * cw, rows * ch);
    ctx.restore();
    ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- lifecycle

let lastFrame, raf, paused = false;

function frame(now) {
    if (lastFrame !== undefined) time += min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    simulate(time);
    render(time);
    raf = requestAnimationFrame(frame);
}

function updateMotion() {
    cancelAnimationFrame(raf);
    lastFrame = undefined;
    motionButton.hidden = reducedMotion.matches;
    motionButton.textContent = paused ? 'Resume motion' : 'Pause motion';
    if (reducedMotion.matches) {
        // One calm, finished frame instead of the animation.
        time = 8;
        settle(time);
        render(time);
        return;
    }
    if (!paused && !document.hidden) raf = requestAnimationFrame(frame);
}

function resize() {
    const dpr = min(devicePixelRatio, 2);
    const oldW = W, oldH = H, oldR = R;
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = round(W * dpr);
    canvas.height = round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    R = min(W * 0.21, H * 0.155);
    Hb = 0.92 * R;
    cw = max(4.2, R / 22);
    ch = cw * 1.7;
    cols = ceil(W / cw);
    rows = ceil(H / ch);
    cells = cols * rows;
    bellLayer = makeLayer(cells);
    innerLayer = makeLayer(cells);
    backLayer = makeLayer(cells);
    cellHash = new Float32Array(cells);
    for (let i = 0; i < cells; i++) cellHash[i] = hash(i * 0.731 + 5);
    stars = [];
    for (let i = 0; i < cells / 70; i++) {
        const n = hash(i + 7);
        stars.push({
            i: floor(hash(i * 1.37 + 2) * cells), base: 0.06 + 0.12 * n,
            speed: 0.6 + 1.6 * hash(i + 17), phase: hash(i + 27) * TAU,
            code: n > 0.93 ? 43 : n > 0.82 ? 42 : 46
        });
    }
    glowCanvas = document.createElement('canvas');
    glowCanvas.width = cols;
    glowCanvas.height = rows;
    glowCtx = glowCanvas.getContext('2d');
    glowImage = glowCtx.createImageData(cols, rows);

    if (!strands.length) {
        settle(time);
    } else {
        // Keep the animal where it is on screen (a phone toolbar collapsing must not make it jump);
        // only rescale it if its size changed. Physics then eases it toward the new goal.
        const k = R / oldR, shiftX = (oldW - W) / 2, shiftY = (H - oldH) / 2;
        body.x = body.x * k + shiftX; body.y = body.y * k + shiftY;
        body.vx *= k; body.vy *= k;
        for (const m of minis) { m.x *= W / oldW; m.y *= H / oldH; }
        for (const s of strands) {
            s.seg *= k;
            for (let i = 0; i < s.p.length; i += 3) {
                s.p[i] = s.p[i] * k + shiftX; s.p[i + 1] = s.p[i + 1] * k + shiftY; s.p[i + 2] *= k;
                s.q[i] = s.q[i] * k + shiftX; s.q[i + 1] = s.q[i + 1] * k + shiftY; s.q[i + 2] *= k;
            }
        }
    }
    render(time);
}

motionButton.addEventListener('click', () => {
    paused = !paused;
    updateMotion();
});
reducedMotion.addEventListener('change', updateMotion);
document.addEventListener('visibilitychange', updateMotion);
window.addEventListener('resize', resize);

// Deterministic frames for checking the motion: __jellyfish.seek(seconds).
window.__jellyfish = {
    seek(t) {
        if (t < simTime) settle(t); else simulate(t);
        time = t;
        render(t);
    },
    pause() { paused = true; updateMotion(); }
};

resize();
updateMotion();
