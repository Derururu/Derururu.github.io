const ocean = document.querySelector('#ocean');
const ctx = ocean.getContext('2d');
const motion = document.querySelector('#motion');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const field = document.createElement('canvas');
const ink = field.getContext('2d', { willReadFrequently: true });
const mask = document.createElement('canvas');
const letters = mask.getContext('2d');
const atlas = document.createElement('canvas');
const { sin, cos, sqrt, exp, PI } = Math;
const tau = 2 * PI;
const hues = [178, 272, 321, 43, 204];
const glyphs = " .,:;!iltrcoax%0B#@";
const strokeSeconds = 2.8;
let width, height, cellWidth, cellHeight;
let elapsed = 0;
let lastFrame;
let frame;
let paused = false;

function noise(x, y) {
    const n = sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
}

// Paint a translucent, ribbed dome once. Every swimmer uses the same anatomy.
const bell = document.createElement('canvas');
bell.width = 320;
bell.height = 164;
const shell = bell.getContext('2d');
const surface = shell.createImageData(bell.width, bell.height);
for (let col = 0; col < bell.width; col++) {
    const x = (col + .5) / 160 - 1;
    const arc = sqrt(1 - x * x);
    const scallop = .045 * cos(16 * Math.acos(x));
    const top = -.9 * arc;
    const lip = -.11 * arc + scallop;
    const bottom = .15 * arc + scallop;
    for (let row = 0; row < bell.height; row++) {
        const y = row / 145 - .94;
        if (y < top || y > bottom) continue;
        const v = (y - top) / (lip - top);
        const ny = -arc * (1 - Math.min(v, 1));
        const nz = sqrt(Math.max(0, 1 - x * x - ny * ny));
        const longitude = Math.atan2(x, nz);
        const ribs = (.5 + .5 * cos(21 * longitude + 1.6 * v)) ** 6;
        const rim = exp(-(((y - lip) / .032) ** 2));
        const lowerRim = exp(-(((y - bottom) / .024) ** 2));
        const glint = exp(-((x + .46) ** 2 / .13 + (v - .24) ** 2 / .08));
        const folds = .5 + .5 * sin(v * 14 + 2 * sin(longitude * 9));
        const veins = (.5 + .5 * cos(49 * longitude + 2 * sin(v * 9))) ** 13;
        const light = y < lip ? .22 + .57 * ribs + .14 * veins + .34 * folds * glint : .14 + .28 * ribs;
        const speck = .80 + .2 * noise(col, row);
        const i = (row * bell.width + col) * 4;
        surface.data[i] = (160 * light + 79 * glint + 190 * rim + 125 * lowerRim) * speck;
        surface.data[i + 1] = (100 * light + 194 * glint + 150 * rim + 65 * lowerRim) * speck;
        surface.data[i + 2] = (255 * light + 163 * glint + 189 * rim + 171 * lowerRim) * speck;
        surface.data[i + 3] = 255;
    }
}
shell.putImageData(surface, 0, 0);

function swimmer(x, y, size, angle, stroke, opacity) {
    const phase = stroke % 1;
    const squeeze = phase < .26 ? phase / .26 : (1 - phase) / .74;
    const pulse = .5 - .5 * cos(PI * squeeze);
    const spread = 1 - .15 * pulse;
    const lift = 1 + .12 * pulse;
    const hue = hues[Math.floor(stroke) % hues.length];

    ink.save();
    ink.translate(x, y);
    ink.rotate(angle);
    ink.scale(size, size);
    ink.globalAlpha = opacity;

    // The leading edge of the color band advances from the rim to the tips.
    const crest = phase / .86;
    const filament = ink.createLinearGradient(0, -1, 0, 68);
    const ribbon = ink.createLinearGradient(0, -1, 0, 68);
    for (let step = 0; step <= 32; step++) {
        const depth = step / 32;
        const wave = exp(-(((depth - crest) / .09) ** 2));
        const highlight = (1 - depth * .55);
        filament.addColorStop(depth, `hsl(${wave > .12 ? hue : 258} 65% ${highlight * (35 + 56 * wave)}%)`);
        ribbon.addColorStop(depth, `hsl(${wave > .12 ? hue : 267 + 37 * sin(depth * 5)} 65% ${highlight * (49 + 43 * wave)}%)`);
    }

    // Fine perimeter filaments and thicker, folded oral arms move at different depths.
    for (let strand = 0; strand < 25; strand++) {
        const broad = strand >= 20;
        const longitude = strand * 2.4;
        const root = (broad ? 7 : 25) * cos(longitude) * spread;
        const length = broad ? 50 + 12 * sin(strand) : 46 + 23 * noise(strand, 2);
        ink.strokeStyle = broad ? ribbon : filament;
        ink.lineWidth = broad ? .6 : .32 + .24 * noise(strand, 4);
        ink.beginPath();
        const edge = [];
        for (let row = 0; row <= length; row++) {
            const depth = row / length;
            const sway = depth * (9 * sin(row * .076 - stroke * .98 + .55 * sin(strand)) +
                7 * sin(row * .044 - stroke * .64 + longitude));
            const center = root * (1 - .27 * depth) + sway + depth * 7 * sin(stroke * .46 - 1);
            const py = row + (broad ? 0 : 2.8 * sin(longitude));
            const fold = broad ? (1 - depth * .9) * (1.5 + 1.35 * sin(.35 * row + longitude - stroke)) : 0;
            if (row === 0) ink.moveTo(center - fold, py);
            else ink.lineTo(center - fold, py);
            if (broad) edge.push([center + fold, py]);
        }
        if (broad) {
            for (let i = edge.length - 1; i >= 0; i--) ink.lineTo(...edge[i]);
            ink.closePath();
            ink.globalAlpha = opacity * .45;
            ink.fillStyle = ribbon;
            ink.fill();
            ink.globalAlpha = opacity;
        }
        ink.stroke();
    }
    ink.scale(spread, lift);
    ink.drawImage(bell, -27, -20.3, 54, 24.5);
    if (phase < .22) {
        ink.beginPath();
        for (let col = -26; col <= 26; col++) {
            const nx = col / 27;
            const lip = -.11 * sqrt(1 - nx * nx) + .045 * cos(16 * Math.acos(nx));
            const py = lip * 21.7;
            if (col === -26) ink.moveTo(col, py);
            else ink.lineTo(col, py);
        }
        ink.strokeStyle = `hsla(${hue} 85% 80% / ${sin(PI * phase / .22)})`;
        ink.lineWidth = .65;
        ink.stroke();
    }
    ink.restore();
}

function draw(time) {
    const cols = field.width, rows = field.height;
    ink.setTransform(1, 0, 0, 1, 0, 0);
    ink.clearRect(0, 0, cols, rows);
    // Model coordinates use square units; the final ASCII cells are taller than wide.
    ink.scale(1 / cellWidth, 1 / cellHeight);
    const stroke = time / strokeSeconds;
    const phase = stroke % 1;
    const travel = stroke + .12 * (1 - cos(tau * phase));
    const portrait = width < height;
    const size = Math.min(height / (portrait ? 90 : 79), width / (portrait ? 62 : 96));
    const companions = [[.10, .26, .18, -.52], [.85, .19, .13, .32], [.88, .70, .20, -.35], [.14, .79, .11, .53]];
    for (const [px, py, scale, lean] of companions) {
        const drift = travel * (.55 + scale) + px * 13;
        swimmer(width * (px + .035 * sin(drift)), height * (py + .045 * cos(drift)), size * scale,
            lean + .24 * sin(drift), stroke * (.65 + scale) + px * 4, .48 + scale);
    }
    const path = travel * .51;
    swimmer(width * ((portrait ? .51 : .58) + (portrait ? .065 : .115) * sin(path)),
        height * ((portrait ? .37 : .34) + .055 * cos(path * 1.6)) - size * 2 * sin(phase * PI) ** 4,
        size, (portrait ? .13 : .63) + .19 * cos(path), stroke, 1);

    // Use luminance to pick a glyph, then transfer the field's color through the glyph mask.
    const pixels = ink.getImageData(0, 0, cols, rows).data;
    letters.clearRect(0, 0, mask.width, mask.height);
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const i = (row * cols + col) * 4;
            const value = Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) * pixels[i + 3] / 255;
            if (value < 8) continue;
            const glyph = Math.ceil((glyphs.length - 1) * (value / 255) ** .68);
            letters.drawImage(atlas, glyph * cellWidth, 0, cellWidth, cellHeight,
                col * cellWidth, row * cellHeight, cellWidth, cellHeight);
        }
    }
    ctx.clearRect(0, 0, ocean.width, ocean.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(field, 0, 0, cols * cellWidth, rows * cellHeight);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(mask, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
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
    width = ocean.width = Math.round(ocean.clientWidth * dpr);
    height = ocean.height = Math.round(ocean.clientHeight * dpr);
    cellWidth = Math.max(2, Math.round(Math.min(ocean.clientWidth / 105, ocean.clientHeight / 150) * dpr));
    cellHeight = Math.round(cellWidth * 1.55);
    field.width = Math.ceil(width / cellWidth);
    field.height = Math.ceil(height / cellHeight);
    mask.width = width;
    mask.height = height;
    atlas.width = glyphs.length * cellWidth;
    atlas.height = cellHeight;
    const type = atlas.getContext('2d');
    type.font = `600 ${cellHeight}px monospace`;
    type.textBaseline = 'middle';
    type.fillStyle = 'white';
    for (let i = 0; i < glyphs.length; i++) type.fillText(glyphs[i], i * cellWidth, cellHeight / 2);
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
