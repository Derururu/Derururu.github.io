const ocean = document.querySelector('#ocean');
const ctx = ocean.getContext('2d');
const motion = document.querySelector('#motion');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const glyphs = ' .:;!i1l|trvxzco0OQ8B$#';
const bell = document.createElement('canvas');
const { sin, cos, sqrt, exp, PI } = Math;
const strokeSeconds = 2.1;
const hues = [178, 315, 38, 225, 135];
let bellHue;
let width, height, unit, pixelRatio;
let elapsed = 0;
let lastFrame;
let frame;
let paused = false;

function noise(x, y) {
    const n = sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
}

function rim(x) {
    return 1 - x * .15 + .95 * cos(x * .43);
}

function paintBell(hue) {
    bellHue = hue;
    const highlight = [`hsl(${hue} 82% 83%)`, `hsl(${hue} 72% 66%)`];
    const shade = [`hsl(${hue + 85} 65% 81%)`, `hsl(${hue + 85} 32% 60%)`];
    bell.width = Math.ceil(34 * unit * pixelRatio);
    bell.height = Math.ceil(26 * unit * pixelRatio);
    const ink = bell.getContext('2d');
    ink.scale(unit * pixelRatio, unit * pixelRatio);
    ink.translate(17, 18);
    ink.font = '1px monospace';
    ink.shadowBlur = 2 * pixelRatio;
    for (let x = -25; x <= 25; x++) {
        const top = -15.8 * sqrt(1 - (x / 25) ** 2) - x * .15;
        const base = rim(x);
        for (let y = Math.ceil(top); y <= base; y++) {
            const grain = noise(x, y);
            const ridge = sin(x * .52 + y * .3 + sin(y * .64));
            const shine = exp(-((x + 10 + 5 * sin(y * .42)) ** 2) / 65);
            const density = .27 + .38 * shine + .14 * ridge + .21 * grain;
            const edge = y < top + 1 || y > base - 1;
            const char = edge ? (y < top + 1 ? '._-/'[Math.floor(grain * 4)] : '_/|~'[Math.floor(grain * 4)])
                : glyphs[Math.min(glyphs.length - 1, Math.floor(density * glyphs.length))];
            ink.fillStyle = shine + .32 * ridge > .57 && y < base - 2
                ? highlight[grain > .46 ? 0 : 1]
                : shade[grain + density > 1.15 ? 0 : 1];
            ink.shadowColor = ink.fillStyle;
            ink.fillText(char, x * .64, y);
        }
    }
}

const smallJelly = ['  .---.  ', " /     \\", '(       )', " '-~~~-' ", '  ) ( )  ', ' (  )  ( ', '  )  ( ) '];

function draw(time) {
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.font = '12px monospace';
    for (let i = 0; i < width * height / 5200; i++) {
        const n = noise(i, 2);
        ctx.fillStyle = n > .85 ? '#554e68' : '#272936';
        ctx.fillText(n > .85 ? '+' : '.', noise(i, 5) * width, noise(i, 7) * height);
    }

    const mobile = width <= 680;
    ctx.font = Math.max(6, unit * .55) + 'px monospace';
    for (const [x, y, color] of [[mobile ? .035 : .1, .24, '#74515f'], [.91, .61, '#385961']]) {
        ctx.fillStyle = color;
        smallJelly.forEach((row, i) => ctx.fillText(row, x * width, y * height + i * unit * .58 + sin(time * .19 + x) * 4));
    }

    const stroke = time / strokeSeconds;
    const phase = stroke % 1;
    const hue = hues[Math.floor(stroke) % hues.length];
    if (bellHue !== hue) paintBell(hue);

    // Contract quickly, then reopen slowly as the jellyfish glides.
    const squeeze = phase < .3 ? phase / .3 : (1 - phase) / .7;
    const pulse = (1 - cos(PI * squeeze)) / 2;
    const spread = 1 - .24 * pulse;
    const lift = 1 + .14 * pulse;
    const path = (stroke + .12 * (1 - cos(2 * PI * phase))) * .8;
    ctx.translate(width * ((mobile ? .5 : .64) + (mobile ? .11 : .2) * sin(path)),
        (height - unit * (mobile ? 13 : 0)) / 2 - unit * (11 + 2.2 * pulse + 2 * sin(path * 2)));
    ctx.rotate((mobile ? .14 : .30) * cos(path));
    ctx.scale(unit, unit);
    ctx.font = '1px monospace';

    // The outer filaments trail farther sideways as they get farther from the bell.
    const filaments = [75, 59, 39].map(light => `hsl(${hue + 85} 27% ${light}%)`);
    for (let strand = 0; strand < 26; strand++) {
        const root = -24 + strand * 1.92;
        const length = 24 + Math.round(22 * noise(strand, 3));
        let previous = root * spread;
        ctx.fillStyle = filaments[strand % 4 === 0 ? 0 : strand % 3 === 0 ? 1 : 2];
        for (let row = 0; row < length; row++) {
            const depth = row / length;
            const wake = sin(2 * PI * (phase - depth * .8));
            const x = root * (spread + depth * (1 - spread)) + 4 * depth * wake + depth * (6 + 8 * sin(strand * .32))
                + depth * (7 * sin(row * .13 + time * .38 + strand * .13) + 3 * cos(row * .18 + strand));
            ctx.fillText(x - previous > .27 ? '\\' : previous - x > .27 ? '/' : '|', Math.round(x) * .64, rim(root) * lift + row);
            previous = x;
        }
    }

    // A folded central ribbon catches warmer light between the fine filaments.
    const ribbon = [82, 64, 46].map(light => `hsl(${hue - 133} 62% ${light}%)`);
    for (let row = 0; row < 36; row++) {
        const depth = row / 36;
        const center = 1 + depth * 10 + 2 * sin(row * .26 + time * .32);
        const radius = (1 - depth * .78) * (4.3 + 1.6 * cos(row * .57));
        for (let x = Math.ceil(center - radius); x <= center + radius; x++) {
            const grain = noise(x, row);
            ctx.fillStyle = ribbon[grain > .68 ? 0 : grain > .28 ? 1 : 2];
            ctx.fillText('r|t0x/1+}'[Math.floor(grain * 9)], x * .64, row);
        }
    }
    ctx.scale(spread, lift);
    ctx.drawImage(bell, -17, -18, bell.width / (unit * pixelRatio), bell.height / (unit * pixelRatio));
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
    width = ocean.clientWidth;
    height = ocean.clientHeight;
    pixelRatio = Math.min(devicePixelRatio, 2);
    ocean.width = Math.round(width * pixelRatio);
    ocean.height = Math.round(height * pixelRatio);
    unit = Math.min(height / (width <= 680 ? 85 : 68), width / (width <= 680 ? 39 : 70));
    bellHue = undefined;
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
