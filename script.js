const ocean = document.querySelector('#ocean');
const ctx = ocean.getContext('2d');
const motion = document.querySelector('#motion');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const { sin, cos, sqrt, exp, PI } = Math;
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

function drift(time) {
    return 5 * sin(time * .56) + 1.7 * sin(time * .93 - .7);
}

function draw(time) {
    const stroke = time / strokeSeconds;
    const cycle = Math.floor(stroke);
    const phase = stroke - cycle;
    const squeeze = phase < .325 ? phase / .325 : (1 - phase) / .675;
    const pulse = .5 - .5 * cos(PI * squeeze);
    const palette = palettes[cycle % palettes.length];
    const previous = palettes[(cycle + palettes.length - 1) % palettes.length];
    const tilt = .17 * sin(time * .61 - .4);
    const radius = 22 - 6 * pulse;
    const capHeight = 12 + 2.3 * pulse;
    const center = drift(time);
    // The recording opens above the crown, then reveals the hanging tentacles.
    const reveal = reducedMotion.matches ? 1 : Math.min(1, time / 2.8);
    const sideView = reveal * reveal * (3 - 2 * reveal);
    const cx = width / 2 + center * cell;
    const cy = height / 2 - (10.6 * sideView + pulse * 2.5) * line;
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
    const lastX = new Float64Array(16);
    ctx.globalAlpha = sideView;
    for (let row = 0; sideView > 0 && row <= tailLength; row++) {
        const depth = row / tailLength;
        const arrival = Math.max(0, Math.min(1, (phase - depth * .77) / .13));
        const wave = exp(-(((phase - depth * .77 - .055) / .085) ** 2));
        const threadHue = mixHue(previous[0], palette[0], arrival);
        const coreHue = mixHue(previous[2], palette[2], arrival);
        const lag = drift(time - 2.4 * depth) - center;
        const trail = lag * 1.65 + depth * 2.2 * sin(time * .67 - row * .13);
        const delayedPulse = .5 + .5 * cos(tau * (phase - depth * .48 - .325));
        for (let strand = 0; strand < 16; strand++) {
            const theta = tau * strand / 16 + .09;
            const tip = 30 + 9 * noise(strand, 4);
            if (row > tip) continue;
            const root = radius * .95 * cos(theta);
            const fan = .80 + .2 * cos(row * .15 - time * .9 + theta);
            const bend = depth * (4.7 * sin(row * .22 - time * .91 + theta) + 3.4 * sin(theta));
            const radiusAtDepth = radius + depth * 6 * (pulse - delayedPulse);
            const x = radiusAtDepth * .95 * cos(theta) * (1 - depth + depth * fan) + trail + bend;
            const slope = row ? x - lastX[strand] : 0;
            lastX[strand] = x;
            const y = row * sideView + rimY(root) + 2 * sin(theta) - depth * 2.5 * delayedPulse;
            ctx.fillStyle = `hsl(${threadHue} ${22 + wave * 49}% ${48 + 17 * sin(theta) + 22 * wave - depth * 8}%)`;
            ctx.fillText(slope > .23 ? '\\' : slope < -.23 ? '/' : '|', Math.round(x) * cell, Math.round(y) * line);
        }

        if (row > 29) continue;
        const armDepth = row / 30;
        const mid = trail * .65 + 1.3 * sin(row * .22 - time * .7);
        const half = (5.4 - 3.9 * armDepth) * (1 + .17 * cos(row * .36 - time));
        for (let x = Math.ceil(mid - half); x <= mid + half; x++) {
            const edge = Math.abs(x - mid) / half;
            const grain = noise(x, row);
            const fold = .5 + .5 * cos(x * .8 + row * .22 - time * .7);
            const chars = glyphs[Math.min(5, Math.floor(1.3 + 2.5 * fold + 1.5 * grain))];
            ctx.fillStyle = `hsl(${coreHue} ${58 + wave * 24}% ${38 + 28 * fold + 14 * grain + 12 * wave}%)`;
            ctx.fillText(edge > .84 ? '|/\\'[Math.floor(grain * 3)] : chars[Math.floor(grain * chars.length)],
                x * cell, Math.round(row * sideView) * line);
        }
    }

    ctx.globalAlpha = 1;
    const change = cycle === 0 ? 1 : Math.min(1, phase / .13);
    const baseHue = mixHue(previous[0], palette[0], change);
    const stripeHue = mixHue(previous[1], palette[1], change);
    const yaw = .40 * sin(time * .48);
    ctx.shadowBlur = cell * .22;
    for (let x = Math.ceil(-radius); x <= radius; x++) {
        const u = x / radius;
        const arc = sqrt(Math.max(0, 1 - u * u));
        const top = tilt * x - capHeight * arc;
        const lip = rimY(x);
        const bottom = tilt * x + (11 - 7.1 * sideView) * arc;
        for (let y = Math.ceil(top); y <= bottom; y++) {
            const grain = noise(x, y);
            const v = Math.min(1, Math.max(0, (y - top) / Math.max(.2, lip - top)));
            const nz = arc * sqrt(1 - (1 - v) ** 2);
            const longitude = Math.atan2(u, nz * sideView + (y - tilt * x) / capHeight * (1 - sideView));
            const stripe = (.5 + .5 * cos(10 * longitude + yaw + v * .72)) ** 2;
            const underside = y > lip;
            const rim = Math.abs(y - lip) < .6 || bottom - y < .65;
            // Gaps in the underside reveal the attachments of the central arm and filaments.
            if (underside && !rim && (Math.abs(x) < 4.5 || grain < .27)) continue;
            const light = underside ? .18 + .22 * stripe : .22 + .48 * stripe + .15 * (1 - v);
            const level = Math.min(5, Math.floor((light + .22 * grain) * 6));
            const chars = glyphs[level];
            const hue = underside ? mixHue(baseHue, 248, .65) : mixHue(baseHue, stripeHue, stripe);
            ctx.fillStyle = `hsl(${hue} ${rim ? 28 : 53}% ${rim ? 77 : 23 + 68 * light + 12 * grain}%)`;
            ctx.shadowColor = ctx.fillStyle;
            const char = rim ? '_-_/|'[Math.floor(grain * 5)] : chars[Math.floor(grain * chars.length)];
            ctx.fillText(char, x * cell, y * line);
        }
    }
    ctx.restore();
}

function animate(now) {
    if (lastFrame === undefined || now - lastFrame >= 32) {
        if (lastFrame !== undefined) elapsed += (now - lastFrame) / 1000;
        lastFrame = now;
        draw(elapsed);
    }
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
