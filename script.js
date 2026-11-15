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

// Ease the reveal and color front without an abrupt start or stop.
function ease(t) {
    return t * t * t * (10 + t * (-15 + 6 * t));
}

// Low harmonics fitted to the recording's bell width. The curve loops without a seam.
function bellRadius(time) {
    const a = PI * (time - 5.28);
    return 18.7 + 3 * cos(a) - .41 * sin(a) + .65 * sin(2 * a) + .32 * cos(2 * a);
}

// Project the bell and its rim in the same square coordinate system as the trailing links.
function pose(time) {
    const radius = bellRadius(time);
    const tuck = (22.6 - radius) / 7.6;
    const reveal = reducedMotion.matches ? 1 : ease(Math.max(0, Math.min(1, time / 2.8)));
    const pitch = -1.38 + reveal * (1.69 + .07 * cos(.54 * time));
    const roll = -.17 * sin(.54 * (time - .36));
    const a = PI * (time - 5.28);
    const crown = 2.13 * cos(a) - .84 * sin(a) + .40 * sin(2 * a) + .38 * cos(2 * a);
    return {
        radius, height: 21 + 1.9 * tuck, reveal,
        x: 7 * cos(.54 * (time - .36)), y: (2.8 * tuck - 1 - 12.5 * reveal + crown) * 1.4,
        cosPitch: cos(pitch), sinPitch: sin(pitch), cosRoll: cos(roll), sinRoll: sin(roll)
    };
}

const rimLevel = .32;
const links = 20;
const fixedStep = 1 / 90;
let simulatedAt = -Infinity;
let bundles = [];

// A turn bends the first link. Each damped joint follows the angle above it,
// carrying that bend down the three filaments sharing the guide.
function advanceTentacles(time) {
    if (time < simulatedAt - fixedStep - 1e-8 || time - simulatedAt > .5) {
        simulatedAt = time - 3.2;
        bundles = [];
    }
    while (simulatedAt < time) {
        simulatedAt += fixedStep;
        const body = pose(simulatedAt);
        const beat = PI * (simulatedAt - 5.28);
        for (let b = 0; b < 6; b++) {
            const angle = tau * b / 6 + simulatedAt * .37;
            const r = body.radius * sqrt(1 - rimLevel ** 2);
            const rimX = r * cos(angle);
            const rimY = body.height * rimLevel * body.cosPitch - r * sin(angle) * body.sinPitch;
            const rootX = body.x + body.cosRoll * rimX - body.sinRoll * rimY;
            const rootY = body.y + body.sinRoll * rimX + body.cosRoll * rimY;
            const length = (47 + 6 * noise(b, 4)) / links;
            const chain = bundles[b] ??= Array.from({ length: links + 1 }, () =>
                ({ x: rootX, y: rootY, oldX: rootX, oldY: rootY, angle: 0, angularVelocity: 0 }));
            const rimVelocity = (rootX - chain[0].x) / fixedStep;
            const bellVelocity = -7 * .54 * sin(.54 * (simulatedAt - .36));
            chain[0].angle = -.95 * Math.atan(.075 * (.62 * rimVelocity + 1.68 * bellVelocity));
            chain[0].oldX = chain[0].x;
            chain[0].oldY = chain[0].y;
            chain[0].x = rootX;
            chain[0].y = rootY;
            for (let j = 1; j <= links; j++) {
                const node = chain[j], parent = chain[j - 1];
                const d = j / links;
                const current = .029 * sin(beat - 5.5 * d) + .012 * sin(angle + 3 * d);
                node.angularVelocity += fixedStep * (165 * (parent.angle + current - node.angle) - 18 * node.angularVelocity);
                node.angle += fixedStep * node.angularVelocity;
                node.oldX = node.x;
                node.oldY = node.y;
                node.x = parent.x + length * sin(node.angle);
                node.y = parent.y + length * cos(node.angle);
            }
        }
    }
    const blend = Math.max(0, Math.min(1, 1 - (simulatedAt - time) / fixedStep));
    for (const chain of bundles) {
        for (const node of chain) {
            node.drawX = node.oldX + blend * (node.x - node.oldX);
            node.drawY = node.oldY + blend * (node.y - node.oldY);
        }
    }
}

function draw(time) {
    const stroke = Math.max(0, (time - 5.65) / strokeSeconds + 1);
    const cycle = Math.floor(stroke);
    const phase = stroke - cycle;
    const palette = palettes[cycle % palettes.length];
    const previous = palettes[Math.max(0, cycle - 1) % palettes.length];
    const body = pose(time);
    const sideView = body.reveal;
    const cx = width / 2 + body.x * cell;
    const cy = height / 2 + body.y * cell;
    advanceTentacles(time);
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
    const tailLength = 39;
    ctx.globalAlpha = sideView;
    for (let row = 0; sideView > 0 && row <= tailLength; row++) {
        const depth = row / tailLength;
        const arrival = ease(Math.max(0, Math.min(1, (phase - depth * .77) / .13)));
        const wave = sin(PI * arrival) ** 2;
        const threadHue = mixHue(previous[0], palette[0], arrival);
        const coreHue = mixHue(previous[2], palette[2], arrival);
        const spin = (time - depth * 1.05) * .37;
        for (let strand = 0; strand < bundles.length * 3; strand++) {
            const b = Math.floor(strand / 3);
            const chain = bundles[b];
            const reach = depth * (1 - .045 * (strand % 3)) * links;
            const j = Math.min(links - 1, Math.floor(reach)), f = reach - j;
            const p = chain[j], q = chain[j + 1];
            const dx = q.drawX - p.drawX, dy = q.drawY - p.drawY;
            const member = strand % 3 - 1;
            const theta = tau * b / 6 + spin;
            const separation = member * (1.25 + .48 * sin(5 * depth + theta));
            const invLength = 1 / Math.hypot(dx, dy);
            const x = p.drawX + f * dx + dy * invLength * separation - body.x;
            const rootY = chain[0].drawY;
            const y = (rootY - body.y + sideView * (p.drawY + f * dy - rootY - dx * invLength * separation)) / 1.4;
            const slope = dx / Math.max(.36, dy);
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
        const reach = depth * links, j = Math.floor(reach), f = reach - j;
        let mid = 0, armY = 0;
        for (const chain of bundles) {
            mid += chain[j].drawX * (1 - f) + chain[j + 1].drawX * f;
            armY += chain[j].drawY * (1 - f) + chain[j + 1].drawY * f;
        }
        mid = mid / bundles.length - body.x + 1.8 * sin(twist) * sin(PI * armDepth);
        armY = (armY / bundles.length - body.y) * sideView / 1.4;
        const restHalf = 5.4 - 3.9 * armDepth;
        const foldWidth = .57 + .53 * Math.abs(cos(twist));
        for (let col = -Math.floor(restHalf); col <= restHalf; col++) {
            const edge = Math.abs(col) > restHalf - 1;
            const grain = noise(col, row);
            const fold = .5 + .5 * cos(col * .8 + row * .22 - time * .7);
            const chars = glyphs[Math.floor(1.3 + 2.2 * (.5 + .5 * cos(col * .8 + row * .22)) + 1.5 * grain)];
            ctx.fillStyle = `hsl(${coreHue} ${58 + wave * 24}% ${38 + 28 * fold + 14 * grain + 12 * wave}%)`;
            ctx.fillText(edge ? '|/\\'[Math.floor(grain * 3)] : chars[Math.floor(grain * chars.length)],
                (mid + col * foldWidth) * cell, armY * line);
        }
    }

    ctx.globalAlpha = 1;
    const change = cycle === 0 ? 1 : ease(Math.min(1, phase / .13));
    const baseHue = mixHue(previous[0], palette[0], change);
    const stripeHue = mixHue(previous[1], palette[1], change);
    const yaw = time * .37;
    ctx.shadowBlur = cell * .22;
    // Intersect each viewing ray with a tilted ellipsoid, cut just below its equator.
    // The exposed mouth is an elliptical opening on the same surface as the dome.
    const R = body.radius, H = body.height;
    const projectedH = Math.hypot(H * body.cosPitch, R * body.sinPitch);
    const nyScale = H * body.cosPitch / projectedH, nzScale = -R * body.sinPitch / projectedH;
    const lipRadius = sqrt(1 - rimLevel ** 2);
    for (let col = -24; col <= 24; col++) {
        for (let row = -19; row <= 18; row++) {
            const x = body.cosRoll * col + body.sinRoll * row * 1.4;
            const y = -body.sinRoll * col + body.cosRoll * row * 1.4;
            const u = x / R, v = y / projectedH;
            const silhouette = 1 - Math.hypot(u, v);
            if (silhouette < -.5 / R) continue;
            const front = sqrt(Math.max(0, 1 - u * u - v * v));
            const ny = nyScale * v - nzScale * front;
            const nz = nzScale * v + nyScale * front;
            const mouth = ny > rimLevel;
            const mouthZ = body.sinPitch > .001 ? (H * rimLevel * body.cosPitch - y) / (R * body.sinPitch) : 0;
            const lipDistance = mouth ? lipRadius - Math.hypot(u, mouthZ) : rimLevel - ny;
            if (mouth && (body.sinPitch <= 0 || lipDistance < -.4 / R)) continue;
            const coverage = ease(Math.max(0, Math.min(1, .5 + silhouette * R)));
            const grain = noise(col, row);
            const longitude = Math.atan2(u, nz);
            const stripe = (.5 + .5 * cos(8 * (longitude - yaw) + ny * .7)) ** 2;
            const normalLight = Math.max(0, -.36 * u - .64 * ny + .58 * nz);
            const edge = Math.exp(-((lipDistance / .075) ** 2));
            const glint = Math.max(0, -.42 * u - .53 * ny + .73 * nz) ** 9;
            const light = mouth ? .21 + .13 * stripe + .28 * edge
                : .13 + normalLight * (.19 + .43 * stripe) + .22 * glint + .23 * edge;
            const chars = glyphs[Math.min(5, Math.floor((.1 + light + .19 * grain) * 6))];
            const hue = mouth ? mixHue(baseHue, 248, .60) : mixHue(baseHue, stripeHue, stripe);
            ctx.fillStyle = `hsl(${hue} ${mouth ? 35 : 54}% ${22 + 65 * light + 9 * grain}%)`;
            ctx.shadowColor = ctx.fillStyle;
            ctx.globalAlpha = coverage * (mouth ? .50 + .48 * edge : 1);
            const char = edge > .85 ? '_-~'[Math.floor(grain * 3)] : chars[Math.floor(grain * chars.length)];
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
