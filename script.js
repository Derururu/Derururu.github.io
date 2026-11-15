const ocean = document.querySelector('#ocean');
const ctx = ocean.getContext('2d');
const motion = document.querySelector('#motion');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const { sin, cos, sqrt, PI } = Math;
const tau = 2 * PI;
const strokeSeconds = 2;
// Bell, crown stripes, central arm.
const palettes = [[234, 215, 251], [178, 304, 332], [332, 45, 172], [146, 62, 33], [17, 345, 278], [262, 178, 50]];
const glyphs = ['.:;!-', '1i;!r', 'trv+x', 'zcuo=', '08B$#', '8B%$@'];
const miniature = ['  .---.  ', " /     \\", '(       )', " '-~~~-' ", ' )  (  ) ', '  (  )  (', ' )  (  ) '];
let width, height, cell, line;
let elapsed = 0;
let lastFrame;
let frame;
let paused = false;

function noise(x, y) {
    const n = sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
}

function mixHue(a, b, t) {
    return a + ((b - a + 540) % 360 - 180) * t;
}

// Tracked across five strokes: the tips swing farther and reverse about 2.7 s after the crown.
function sway(time, depth) {
    const delay = 3 * depth * (1.45 - .45 * depth);
    return 7 * (1 + .48 * depth ** 1.55) * cos(.54 * (time - .36 - delay));
}

// Ease the reveal and color front without an abrupt start or stop.
function ease(t) {
    return t * t * t * (10 + t * (-15 + 6 * t));
}

// Low harmonics fitted to the recording's bell width. The curve loops without a seam.
function bellRadius(time) {
    const a = PI * (time - 5.28);
    return 18.7 + 3 * cos(a) - .41 * sin(a) + .65 * sin(2 * a) + .32 * cos(2 * a);
}

function draw(time) {
    const stroke = Math.max(0, (time - 5.65) / strokeSeconds + 1);
    const cycle = Math.floor(stroke);
    const phase = stroke - cycle;
    const radius = bellRadius(time);
    const tuck = (22.6 - radius) / 7.6;
    const palette = palettes[cycle % palettes.length];
    const previous = palettes[Math.max(0, cycle - 1) % palettes.length];
    const tilt = -.19 * sin(.54 * (time - .36));
    const capHeight = 14 + 2.8 * tuck;
    const center = sway(time, 0);
    const reveal = reducedMotion.matches ? 1 : Math.min(1, time / 2.8);
    const sideView = ease(reveal);
    const cx = width / 2 + center * cell;
    // Crown height was tracked independently: its highest point precedes the narrowest rim.
    const a = PI * (time - 5.28);
    const crown = 2.13 * cos(a) - .84 * sin(a) + .40 * sin(2 * a) + .38 * cos(2 * a);
    const cy = height / 2 + (capHeight - 15 - 12.5 * sideView + crown) * line;
    ctx.clearRect(0, 0, width, height);
    ctx.font = `${cell * 1.47}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < width * height / 5000; i++) {
        const n = noise(i, 3);
        ctx.fillStyle = n > .78 ? '#505167' : '#292935';
        ctx.fillText(n > .90 ? '+' : n > .78 ? '*' : '.', width * noise(i, 5), height * noise(i, 6));
    }

    const companions = [[.10,.30,.71,'#716275'], [.86,.15,.48,'#49455e'], [.89,.72,.78,'#42626e'], [.13,.77,.52,'#6d515f']];
    for (const [x, y, scale, color] of companions) {
        const t = time * (.28 + scale * .12) + x * 19;
        ctx.fillStyle = color;
        ctx.font = `${cell * scale * 1.55}px monospace`;
        miniature.forEach((part, i) => {
            ctx.fillText(part, width * (x + .026 * sin(t)) + (i > 3 ? cell * .35 * sin(t + i * .6) : 0),
                height * (y + .032 * cos(t)) + i * line * scale);
        });
    }

    ctx.save();
    ctx.translate(cx, cy);
    ctx.font = `500 ${cell * 1.52}px ui-monospace, monospace`;
    const rimY = x => tilt * x + (9 - 11.2 * sideView) * sqrt(Math.max(0, 1 - (x / radius) ** 2)) + .55 * cos(x * .52);
    // The ends follow an earlier position of the bell, so they sweep out on turns.
    const tailLength = 39;
    const lastX = new Float64Array(18);
    ctx.globalAlpha = sideView;
    for (let row = 0; sideView > 0 && row <= tailLength; row++) {
        const depth = row / tailLength;
        const arrival = ease(Math.max(0, Math.min(1, (phase - depth * .77) / .13)));
        const wave = sin(PI * arrival) ** 2;
        const threadHue = mixHue(previous[0], palette[0], arrival);
        const coreHue = mixHue(previous[2], palette[2], arrival);
        const trail = sway(time, depth) - center;
        const history = time - depth * 1.05;
        const spin = history * .37;
        const trailingRadius = bellRadius(history);
        const delayedTuck = (22.6 - trailingRadius) / 7.6;
        for (let strand = 0; strand < lastX.length; strand++) {
            const bundle = Math.floor(strand / 3);
            const longitude = tau * bundle / 6 + (strand % 3 - 1) * .13;
            const rootAngle = longitude + time * .37;
            const theta = longitude + spin + depth * .82 * sin(time * .82 - depth * 5.8 + bundle);
            const tip = 32 + 5 * noise(bundle, 4) + 2 * noise(strand, 8);
            if (row > tip) continue;
            const root = radius * .95 * cos(rootAngle);
            const fan = 1 - .27 * depth + .21 * depth * sin(row * .17 - time * 1.3 + bundle * 2.3);
            const x = trailingRadius * .95 * cos(theta) * fan + trail;
            const slope = row ? x - lastX[strand] : 0;
            lastX[strand] = x;
            const y = row * sideView + rimY(root) + (2.7 + 2 * depth) * sin(theta) + depth * 2.6 * delayedTuck;
            ctx.fillStyle = `hsl(${threadHue} ${22 + wave * 49}% ${61 + 13 * sin(theta) + 16 * wave - depth * 8}%)`;
            const slant = ease(Math.max(0, Math.min(1, (Math.abs(slope) - .12) / .36)));
            if (slant < 1) {
                ctx.globalAlpha = sideView * (1 - slant);
                ctx.fillText('|', x * cell, y * line);
            }
            if (slant > 0) {
                ctx.globalAlpha = sideView * slant;
                ctx.fillText(slope > 0 ? '\\' : '/', x * cell, y * line);
            }
        }

        if (row > 29) continue;
        ctx.globalAlpha = sideView;
        const armDepth = row / 30;
        const twist = spin + armDepth * 2.9;
        const mid = trail + 1.8 * sin(twist) * sin(PI * armDepth);
        const restHalf = 5.4 - 3.9 * armDepth;
        const foldWidth = .57 + .53 * Math.abs(cos(twist));
        for (let col = -Math.floor(restHalf); col <= restHalf; col++) {
            const edge = Math.abs(col) > restHalf - 1;
            const grain = noise(col, row);
            const fold = .5 + .5 * cos(col * .8 + row * .22 - time * .7);
            const chars = glyphs[Math.floor(1.3 + 2.2 * (.5 + .5 * cos(col * .8 + row * .22)) + 1.5 * grain)];
            ctx.fillStyle = `hsl(${coreHue} ${58 + wave * 24}% ${38 + 28 * fold + 14 * grain + 12 * wave}%)`;
            ctx.fillText(edge ? '|/\\'[Math.floor(grain * 3)] : chars[Math.floor(grain * chars.length)],
                (mid + col * foldWidth) * cell, row * sideView * line);
        }
    }

    ctx.globalAlpha = 1;
    const change = cycle === 0 ? 1 : ease(Math.min(1, phase / .13));
    const baseHue = mixHue(previous[0], palette[0], change);
    const stripeHue = mixHue(previous[1], palette[1], change);
    const yaw = time * .37;
    ctx.shadowBlur = cell * .22;
    const upperRadius = bellRadius(time + .11);
    for (let col = -23; col <= 23; col++) {
        const u = col / upperRadius;
        const arc = sqrt(Math.max(0, 1 - u * u));
        const top = tilt * col - capHeight * arc;
        const lip = rimY(col);
        const bottom = tilt * col + (11 - 3.7 * sideView) * arc;
        for (let row = Math.floor(top); row <= Math.ceil(bottom); row++) {
            const v = Math.min(1, Math.max(0, (row - top) / Math.max(1, lip - top)));
            const edgeRadius = upperRadius + (radius - upperRadius) * v;
            const coverage = Math.min(1, edgeRadius - Math.abs(col) + .6, row - top + .7, bottom - row + .7);
            if (coverage <= 0) continue;
            const grain = noise(col, row);
            const underside = row > lip;
            const rim = Math.abs(row - lip) < .5 || bottom - row < .6;
            if (underside && !rim && (Math.abs(col) < 4 || grain < .13)) continue;
            const nz = arc * sqrt(1 - (1 - v) ** 2);
            const longitude = Math.atan2(u, nz * sideView + (row - tilt * col) / capHeight * (1 - sideView));
            const stripe = (.5 + .5 * cos(8 * (longitude - yaw) + v * .55)) ** 2;
            const light = underside ? .23 + .17 * stripe : .17 + .53 * stripe + .15 * (1 - v);
            const chars = glyphs[Math.min(5, Math.floor((.12 + light + .17 * grain) * 6))];
            const hue = underside ? mixHue(baseHue, 248, .66) : mixHue(baseHue, stripeHue, stripe);
            ctx.fillStyle = `hsl(${hue} ${rim ? 27 : 50}% ${rim ? 73 : 22 + 69 * light + 12 * grain}%)`;
            ctx.shadowColor = ctx.fillStyle;
            ctx.globalAlpha = ease(coverage);
            const char = rim ? '_-_/|'[Math.floor(grain * 5)] : chars[Math.floor(grain * chars.length)];
            ctx.fillText(char, col * cell, row * line);
        }
    }
    ctx.restore();
}

function animate(now) {
    if (lastFrame !== undefined) elapsed += (now - lastFrame) / 1000;
    lastFrame = now;
    draw(elapsed);
    frame = requestAnimationFrame(animate);
}

function updateMotion() {
    cancelAnimationFrame(frame);
    lastFrame = undefined;
    motion.hidden = reducedMotion.matches;
    motion.textContent = paused ? 'Resume motion' : 'Pause motion';
    if (!paused && !reducedMotion.matches && !document.hidden) frame = requestAnimationFrame(animate);
}

function resize() {
    const dpr = Math.min(devicePixelRatio, 2);
    width = ocean.clientWidth;
    height = ocean.clientHeight;
    ocean.width = Math.round(width * dpr);
    ocean.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cell = Math.min(width / 62, height / 87);
    line = cell * 1.4;
    draw(elapsed);
}

motion.addEventListener('click', () => {
    paused = !paused;
    updateMotion();
});
reducedMotion.addEventListener('change', updateMotion);
document.addEventListener('visibilitychange', updateMotion);
window.addEventListener('resize', resize);
resize();
updateMotion();
