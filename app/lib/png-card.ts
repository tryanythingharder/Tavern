import { inflateSync } from 'node:zlib';

// 读取 SillyTavern 角色卡 PNG：tEXt/iTXt 里关键字为 chara 或 ccv3 的 base64 JSON
export function parsePngCard(buffer: Buffer): unknown | null {
  if (buffer.length < 16) return null;
  if (buffer.readUInt32BE(0) !== 0x89504e47 || buffer.readUInt32BE(4) !== 0x0d0a1a0a) return null;
  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const start = offset + 8;
    const end = start + length;
    if (end + 4 > buffer.length) break;
    if (type === 'tEXt') {
      const data = buffer.subarray(start, end);
      const zero = data.indexOf(0);
      if (zero > 0) {
        const keyword = data.toString('latin1', 0, zero);
        if (keyword === 'chara' || keyword === 'ccv3') {
          const json = decodeBase64Json(data.toString('latin1', zero + 1));
          if (json) return json;
        }
      }
    } else if (type === 'iTXt') {
      const data = buffer.subarray(start, end);
      const zero = data.indexOf(0);
      if (zero > 0) {
        const keyword = data.toString('latin1', 0, zero);
        if (keyword === 'chara' || keyword === 'ccv3') {
          let p = zero + 1;
          const flag = data[p];
          p += 1;
          p += 1; // compression method
          p = data.indexOf(0, p) + 1; // language tag
          p = data.indexOf(0, p) + 1; // translated keyword
          let text = data.subarray(p);
          if (flag === 1) {
            try {
              text = inflateSync(text);
            } catch {
              // 压缩失败就按原文试一次
            }
          }
          const json = decodeBase64Json(text.toString('utf8'));
          if (json) return json;
        }
      }
    }
    if (type === 'IEND') break;
    offset = end + 4;
  }
  return null;
}

function decodeBase64Json(value: string): unknown | null {
  try {
    const raw = Buffer.from(value.trim(), 'base64').toString('utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
