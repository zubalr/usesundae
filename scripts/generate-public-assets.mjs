#!/usr/bin/env node
/**
 * Build public favicon and Open Graph assets from app/globals.css primitives.
 * Colours are never authored here; they are parsed from the token file.
 *
 *   node scripts/generate-public-assets.mjs
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CSS = readFileSync(join(ROOT, "app", "globals.css"), "utf8");
const OUT = join(ROOT, "public");

function primitive(name) {
  const match = CSS.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})`));
  if (!match) throw new Error(`Missing primitive token --${name} in app/globals.css`);
  return match[1];
}

function hexRgb(hex) {
  const value = hex.slice(1);
  const full =
    value.length === 3
      ? value
          .split("")
          .map((part) => part + part)
          .join("")
      : value;
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const paper = primitive("c-paper");
const ink = primitive("c-ink");
const coral = primitive("c-coral");
const teal = primitive("c-teal");
const [paperR, paperG, paperB] = hexRgb(paper);
const [inkR, inkG, inkB] = hexRgb(ink);
const [coralR, coralG, coralB] = hexRgb(coral);
const [tealR, tealG, tealB] = hexRgb(teal);

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(width, height, colorAt) {
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * stride;
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = colorAt(x, y);
      const i = row + 1 + x * 3;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function writeSundaeWordmark(setPixel, originX, originY, scale, color) {
  const glyphs = {
    s: ["01110", "10000", "01110", "00001", "01110"],
    u: ["10001", "10001", "10001", "10001", "01110"],
    n: ["10001", "11001", "10101", "10011", "10001"],
    d: ["11110", "10001", "10001", "10001", "11110"],
    a: ["01110", "10001", "11111", "10001", "10001"],
    e: ["11111", "10000", "11110", "10000", "11111"],
  };
  const word = "sundae";
  let cursor = originX;
  for (const letter of word) {
    const glyph = glyphs[letter];
    for (let gy = 0; gy < glyph.length; gy += 1) {
      for (let gx = 0; gx < 5; gx += 1) {
        if (glyph[gy][gx] !== "1") continue;
        for (let dy = 0; dy < scale; dy += 1) {
          for (let dx = 0; dx < scale; dx += 1) {
            setPixel(cursor + gx * scale + dx, originY + gy * scale + dy, color);
          }
        }
      }
    }
    cursor += 6 * scale;
  }
}

function markColor(x, y, size) {
  const rail = Math.round(size * 0.18);
  const bar = Math.round(size * 0.08);
  if (x < rail) return [inkR, inkG, inkB];
  if (x < rail + bar) return [coralR, coralG, coralB];
  const inner = size - rail - bar;
  const localX = x - rail - bar;
  const band = Math.floor((y / size) * 3);
  if (band === 1 && localX > inner * 0.12 && localX < inner * 0.88) {
    return [tealR, tealG, tealB];
  }
  return [paperR, paperG, paperB];
}

mkdirSync(OUT, { recursive: true });

writeFileSync(
  join(OUT, "favicon.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" fill="${paper}"/>
  <rect width="6" height="32" fill="${ink}"/>
  <rect x="6" width="3" height="32" fill="${coral}"/>
  <rect x="12" y="11" width="16" height="4" fill="${teal}"/>
</svg>
`,
);

const favicon = png(32, 32, (x, y) => markColor(x, y, 32));
writeFileSync(join(OUT, "favicon.png"), favicon);

const apple = png(180, 180, (x, y) => markColor(x, y, 180));
writeFileSync(join(OUT, "apple-touch-icon.png"), apple);

const ogPixels = Array.from({ length: 630 }, () =>
  Array.from({ length: 1200 }, () => [paperR, paperG, paperB]),
);
function setOg(x, y, color) {
  if (y < 0 || y >= 630 || x < 0 || x >= 1200) return;
  ogPixels[y][x] = color;
}
for (let y = 0; y < 630; y += 1) {
  for (let x = 0; x < 1200; x += 1) {
    if (x < 72) setOg(x, y, [inkR, inkG, inkB]);
    else if (x < 84) setOg(x, y, [coralR, coralG, coralB]);
    else if (y < 8) setOg(x, y, [coralR, coralG, coralB]);
  }
}
for (let i = 0; i < 3; i += 1) {
  const top = 180 + i * 72;
  const color = i === 1 ? [tealR, tealG, tealB] : [inkR, inkG, inkB];
  for (let y = top; y < top + 28; y += 1) {
    for (let x = 160; x < 520; x += 1) setOg(x, y, color);
  }
}
writeSundaeWordmark(setOg, 160, 72, 8, [inkR, inkG, inkB]);
const og = png(1200, 630, (x, y) => ogPixels[y][x]);
writeFileSync(join(OUT, "og.png"), og);

const digest = createHash("sha256")
  .update(paper)
  .update(ink)
  .update(coral)
  .update(teal)
  .digest("hex")
  .slice(0, 12);
process.stdout.write(`Wrote public assets from tokens ${digest}\n`);
