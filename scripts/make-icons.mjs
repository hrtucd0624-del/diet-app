// アイコン（なすび）を PNG で書き出す。依存なし：node scripts/make-icons.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

const BG = [251, 243, 220];
const NASU = [127, 90, 159];
const SHINE = [176, 146, 202];
const LEAF = [75, 138, 92];

// 0..1 の座標で色を返す
function shade(x, y) {
  // ヘタ
  const inCap = ((x - 0.5) / 0.2) ** 2 + ((y - 0.27) / 0.08) ** 2 <= 1;
  const inStem = x > 0.47 && x < 0.53 && y > 0.12 && y < 0.25;
  if (inStem || inCap) return LEAF;
  // 実（下ほど太い、少し傾いた楕円）
  const cx = 0.5, cy = 0.58;
  const rx = 0.22 + (y - 0.3) * 0.12, ry = 0.3;
  const inBody = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 && y > 0.3;
  if (inBody) {
    const inShine = ((x - 0.42) / 0.04) ** 2 + ((y - 0.55) / 0.13) ** 2 <= 1;
    return inShine ? SHINE : NASU;
  }
  return BG;
}

function png(size) {
  const SS = 4;
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let py = 0; py < size; py++) {
    raw[py * (size * 3 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const c = shade((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size);
          r += c[0]; g += c[1]; b += c[2];
        }
      const o = py * (size * 3 + 1) + 1 + px * 3;
      raw[o] = r / SS / SS; raw[o + 1] = g / SS / SS; raw[o + 2] = b / SS / SS;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

writeFileSync("public/icons/icon-192.png", png(192));
writeFileSync("public/icons/icon-512.png", png(512));
writeFileSync("public/icons/apple-touch-icon.png", png(180));
console.log("icons written");
