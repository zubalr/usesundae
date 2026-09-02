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
const paperBrightHex = primitive("c-paper-bright");
const ink = primitive("c-ink");
const coral = primitive("c-coral");
const teal = primitive("c-teal");
const [paperR, paperG, paperB] = hexRgb(paper);
const [paperBrightR, paperBrightG, paperBrightB] = hexRgb(paperBrightHex);
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

function writeBitmapText(setPixel, originX, originY, scale, color, text) {
  const glyphs = {
    " ": ["00000", "00000", "00000", "00000", "00000"],
    "-": ["00000", "00000", "11111", "00000", "00000"],
    ".": ["00000", "00000", "00000", "00000", "00100"],
    ",": ["00000", "00000", "00000", "00100", "01000"],
    "'": ["00100", "00100", "00000", "00000", "00000"],
    a: ["00000", "01110", "10001", "10001", "01111"],
    b: ["10000", "11110", "10001", "10001", "11110"],
    c: ["00000", "01111", "10000", "10000", "01111"],
    d: ["00001", "01111", "10001", "10001", "01111"],
    e: ["01110", "10001", "11111", "10000", "01110"],
    f: ["00111", "01000", "11110", "01000", "01000"],
    g: ["01111", "10001", "01111", "00001", "01110"],
    h: ["10000", "10000", "11110", "10001", "10001"],
    i: ["00100", "00000", "01100", "00100", "01110"],
    l: ["01100", "00100", "00100", "00100", "01110"],
    n: ["00000", "11110", "10001", "10001", "10001"],
    o: ["00000", "01110", "10001", "10001", "01110"],
    p: ["11110", "10001", "11110", "10000", "10000"],
    r: ["00000", "10110", "11000", "10000", "10000"],
    s: ["01110", "10000", "01110", "00001", "01110"],
    t: ["01000", "11110", "01000", "01000", "00111"],
    u: ["00000", "10001", "10001", "10001", "01111"],
    v: ["00000", "10001", "10001", "01010", "00100"],
    w: ["00000", "10001", "10101", "10101", "01010"],
    y: ["10001", "10001", "01111", "00001", "01110"],
    A: ["01110", "10001", "11111", "10001", "10001"],
    I: ["11111", "00100", "00100", "00100", "11111"],
    R: ["11110", "10001", "11110", "10100", "10010"],
  };
  let cursor = originX;
  for (const letter of text) {
    const glyph = glyphs[letter] ?? glyphs["."];
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

function fillRect(setPixel, x, y, width, height, color) {
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) setPixel(px, py, color);
  }
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

const inkColor = [inkR, inkG, inkB];
const coralColor = [coralR, coralG, coralB];
const tealColor = [tealR, tealG, tealB];
const paperColor = [paperR, paperG, paperB];
const paperBright = [paperBrightR, paperBrightG, paperBrightB];

fillRect(setOg, 0, 0, 72, 630, inkColor);
fillRect(setOg, 72, 0, 12, 630, coralColor);
fillRect(setOg, 84, 0, 1116, 8, coralColor);

writeSundaeWordmark(setOg, 128, 40, 7, inkColor);
writeBitmapText(setOg, 128, 92, 3, coralColor, "A live review with your AI");

const stageX = 128;
const stageY = 140;
const stageW = 1000;
const stageH = 360;
const split = 520;
fillRect(setOg, stageX, stageY, stageW, stageH, inkColor);
fillRect(setOg, stageX + split, stageY, 4, stageH, coralColor);
fillRect(setOg, stageX + split + 4, stageY, stageW - split - 4, stageH, paperBright);

fillRect(setOg, stageX + 28, stageY + 28, 180, 18, coralColor);
fillRect(setOg, stageX + 28, stageY + 64, 360, 28, paperColor);
fillRect(setOg, stageX + 28, stageY + 108, 280, 16, paperColor);
fillRect(setOg, stageX + 28, stageY + 148, 140, 36, coralColor);
fillRect(setOg, stageX + 28, stageY + 208, 420, 12, paperColor);
fillRect(setOg, stageX + 28, stageY + 232, 300, 12, paperColor);
fillRect(setOg, stageX + 28, stageY + 280, 72, 48, paperColor);
fillRect(setOg, stageX + 116, stageY + 280, 72, 48, paperColor);
fillRect(setOg, stageX + 204, stageY + 280, 160, 48, tealColor);

const evidenceX = stageX + split + 28;
fillRect(setOg, evidenceX, stageY + 28, 220, 14, inkColor);
fillRect(setOg, evidenceX, stageY + 64, 400, 72, paperColor);
fillRect(setOg, evidenceX, stageY + 64, 6, 72, coralColor);
fillRect(setOg, evidenceX + 20, stageY + 78, 300, 14, inkColor);
fillRect(setOg, evidenceX + 20, stageY + 100, 240, 10, coralColor);
fillRect(setOg, evidenceX, stageY + 160, 400, 72, paperColor);
fillRect(setOg, evidenceX, stageY + 160, 6, 72, tealColor);
fillRect(setOg, evidenceX + 20, stageY + 174, 280, 14, inkColor);
fillRect(setOg, evidenceX + 20, stageY + 196, 200, 10, tealColor);
fillRect(setOg, evidenceX, stageY + 256, 400, 56, paperColor);
fillRect(setOg, evidenceX + 20, stageY + 276, 160, 16, tealColor);

writeBitmapText(setOg, 128, 528, 4, inkColor, "Review a live product with your AI");
writeBitmapText(setOg, 128, 568, 4, inkColor, "and see the proof.");

const og = png(1200, 630, (x, y) => ogPixels[y][x]);
writeFileSync(join(OUT, "og.png"), og);

const digest = createHash("sha256")
  .update(paper)
  .update(paperBrightHex)
  .update(ink)
  .update(coral)
  .update(teal)
  .digest("hex")
  .slice(0, 12);
process.stdout.write(`Wrote public assets from tokens ${digest}\n`);
