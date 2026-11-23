// Eklenti ikonlarını bağımlılıksız üretir: node scripts/gen-icons.mjs
// Tasarım: mor yuvarlatılmış kare üzerinde üç mikser sürgüsü.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const SIZES = [16, 32, 48, 128];
const OUT = new URL('../public/icon/', import.meta.url);
const BG = [91, 91, 240];
const FG = [255, 255, 255];

/** Yuvarlatılmış dikdörtgen SDF (merkez cx,cy; yarı boyut hw,hh; köşe r). */
function rrect(x, y, cx, cy, hw, hh, r) {
  const qx = Math.abs(x - cx) - hw + r;
  const qy = Math.abs(y - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

// 0..1 birim koordinatlarda şekiller.
const sliders = [
  { x: 0.3, knob: 0.62 },
  { x: 0.5, knob: 0.34 },
  { x: 0.7, knob: 0.52 },
];

function sample(x, y) {
  if (rrect(x, y, 0.5, 0.5, 0.47, 0.47, 0.2) > 0) return null; // arka plan dışı → şeffaf
  for (const s of sliders) {
    if (rrect(x, y, s.x, s.knob, 0.075, 0.055, 0.05) <= 0) return FG; // topuz
    if (rrect(x, y, s.x, 0.5, 0.022, 0.29, 0.022) <= 0) return [200, 200, 255]; // ray
  }
  return BG;
}

function render(size) {
  const SS = 8; // süper örnekleme
  const px = Buffer.alloc(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = sample((i + (sx + 0.5) / SS) / size, (j + (sy + 0.5) / SS) / size);
          if (!c) continue;
          r += c[0]; g += c[1]; b += c[2]; a++;
        }
      }
      const o = (j * size + i) * 4;
      if (a) {
        px[o] = Math.round(r / a);
        px[o + 1] = Math.round(g / a);
        px[o + 2] = Math.round(b / a);
        px[o + 3] = Math.round((a / (SS * SS)) * 255);
      }
    }
  }
  return png(size, px);
}

// --------------------------------------------------------------------- PNG
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit derinliği
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
for (const s of SIZES) {
  writeFileSync(new URL(`${s}.png`, OUT), render(s));
  console.log(`public/icon/${s}.png`);
}
