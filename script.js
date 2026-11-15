const ocean = document.querySelector('#ocean');
const ctx = ocean.getContext('2d');
const motion = document.querySelector('#motion');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const { sin, cos, sqrt, PI } = Math;
const tau = 2 * PI;
let width, height;
let elapsed = 0;
let lastFrame;
let frame;
let paused = false;

const scales = {
    ivory: ['#797d78', '#bebeb0', '#eceadb', '#fff7e4'],
    red:   ['#983e31', '#c95135', '#e96a43', '#ff9261'],
    ink:   ['#444852', '#59616a', '#747b80', '#a0a09c'],
    gold:  ['#966033', '#bc803e', '#e4ad5b', '#fbd58b'],
    fin:   ['#575957', '#787872', '#9e9c91', '#c5c1ae']
};

function grain(x, y) {
    const n = sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
}

// Keep each glyph and its pigment on the same scale while the body flexes.
function markings(seed, golden) {
    const stations = [];
    const patches = [[8 + 2 * sin(seed), -1, 5.5, 4], [23, 2 * cos(seed), 6.8, 6.5], [38 + 2 * cos(seed), -1, 5.4, 4]];
    for (let col = 0; col <= 64; col++) {
        const marks = [];
        const taper = Math.max(0, Math.min(1, (col - 12) / 38));
        const nose = sqrt(1 - Math.max(0, 1 - col / 6) ** 2);
        const radius = nose * (1.1 + 3.2 * (1 + cos(PI * taper)));
        const tail = Math.max(0, (col - 48) / 16);
        const pectoral = (col - 14) / 15;
        const pelvic = (col - 34) / 9;
        for (let row = -16; row <= 16; row++) {
            const side = Math.abs(row);
            const n = grain(col + seed * 13, row);
            const body = col <= 50 && side <= radius;
            const eye = (col === 5 || col === 6) && side === 6;
            const barbel = col > 1 && col < 7 && side === col + 3;
            const tailFin = tail > 0 && side <= 1.3 + 6.3 * tail &&
                side >= Math.max(0, 15 * (tail - .56));
            const pairedFin = (pectoral > 0 && pectoral < 1 &&
                side >= 5.8 + 5.9 * pectoral ** 1.3 && side <= 6.5 + 5.4 * pectoral + 4.5 * sin(PI * pectoral)) ||
                (pelvic > 0 && pelvic < 1 && side >= 3 && side <= 3 + 4 * sin(PI * pelvic));
            if (!(body || eye || barbel || tailFin || pairedFin)) continue;

            let pigment = 'fin', light = 1, glyph;
            if (barbel && !body) {
                glyph = row < 0 ? '/' : '\\';
            } else if (eye) {
                glyph = col === 5 ? '@' : ':';
                pigment = col === 5 ? 'ivory' : 'ink';
                light = col === 5 ? 3 : 0;
            } else if (body) {
                const lat = row / Math.max(1, radius);
                const ridges = sqrt(Math.max(0, 1 - lat * lat));
                light = Math.min(3, Math.floor(2.65 * ridges + .7 * n - .28 * lat));
                const x = col + 1.5 * sin(row * .74 + seed) + .8 * sin(col * .71);
                const y = row + 1.3 * sin(col * .48 + seed);
                const red = patches.some(([cx, cy, rx, ry]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1);
                const black = seed % 2 === 0 && (Math.hypot((x - 19) / 1.5, y + 2) < 3.5 ||
                    Math.hypot(x - 32, y - 3) < 3.1 || Math.hypot(x - 43, y + 1) < 2.4);
                pigment = golden ? 'gold' : black ? 'ink' : red ? 'red' : 'ivory';
                const chars = col < 12 ? ':-vc0O' : (col % 2 === 0 ? 'c()o0%8#' : ')coO0%');
                glyph = chars[Math.floor(n * chars.length)];
                if (side > radius - .8) glyph = row > 0 ? ')' : '(';
                if (col === Math.round(13 - 2.3 * lat * lat)) { glyph = ':'; light = 0; }
                if (row === 0 && col > 18 && col < 38) { glyph = '='; light = 1; }
            } else {
                const ray = tailFin ? (side + .5) / (1.5 + tail * 6.3) : (side - radius) / 8;
                light = Math.min(3, Math.floor(1 + 2 * (.5 + .5 * cos(ray * 17 + seed))));
                glyph = n < .30 ? '.' : row > 0 ? '\\' : '/';
                if (golden) pigment = 'gold';
            }
            marks.push({row, glyph, color: scales[pigment][light], fin: !body && !eye && !barbel});
        }
        stations.push(marks);
    }
    return stations;
}

// Smaller fish occupy the deeper, dimmer part of the pond.
const school = [
    {phase: 5.05, size: .42, speed: -.15, rx: .24, ry: .32, alpha: .64, gold: true},
    {phase: 2.4, size: .54, speed: .17, rx: .17, ry: .18, alpha: .74},
    {phase: 1.52, size: .72, speed: -.18, rx: .29, ry: .31, alpha: .88, gold: true},
    {phase: 3.70, size: .85, speed: .20, rx: .33, ry: .25, alpha: .96},
    {phase: -.36, size: 1, speed: .21, rx: .31, ry: .28, alpha: 1}
];
school.forEach((fish, i) => { fish.stations = markings(i + 2, fish.gold); });

function draw(time) {
    ctx.clearRect(0, 0, width, height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const length = Math.min(width * .66, height * .64);
    for (const fish of school) {
        const unit = length * fish.size / 64;
        const beat = time * (4.9 + fish.size) + 3 * fish.phase;
        const effort = .30 + .70 * (.5 + .5 * cos(time * .85 + fish.phase)) ** 2;
        const direction = Math.sign(fish.speed);
        let route = fish.phase + fish.speed * (time + .22 * sin(.85 * time + fish.phase));
        let x = width * (.5 + fish.rx * cos(route) + .032 * sin(2 * route + fish.phase));
        let y = height * (.5 + fish.ry * sin(route) + .038 * cos(2 * route - fish.phase));
        ctx.font = `500 ${unit * 1.43}px ui-monospace, monospace`;
        ctx.globalAlpha = fish.alpha;

        for (let col = 0; col < fish.stations.length; col++) {
            const depth = col / 64;
            const dx = width * (-fish.rx * sin(route) + .064 * cos(2 * route + fish.phase));
            const dy = height * (fish.ry * cos(route) - .076 * sin(2 * route - fish.phase));
            // Lay the spine back along the route. A travelling bend grows toward the forked tail.
            const heading = Math.atan2(direction * dy, direction * dx)
                + (.045 + .85 * depth ** 1.65) * effort * sin(beat - 6.8 * depth);
            const tx = cos(heading), ty = sin(heading);
            if (col) {
                x -= unit * tx;
                y -= unit * ty;
            }
            const finBeat = .89 + .15 * sin(beat * .58 - depth * 3);
            for (const mark of fish.stations[col]) {
                const across = mark.row * unit * (mark.fin ? finBeat : 1);
                ctx.fillStyle = mark.color;
                ctx.fillText(mark.glyph, x - across * ty, y + across * tx);
            }
            route -= direction * unit / Math.hypot(dx, dy);
        }
    }
    ctx.globalAlpha = 1;
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
