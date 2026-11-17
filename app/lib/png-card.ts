import { crc32, inflateSync } from 'node:zlib';

// 读取 SillyTavern 角色卡 PNG：tEXt/iTXt 里关键字为 chara 或 ccv3 的 base64 JSON
export function parsePngCard(buffer: Buffer): unknown | null {
  if (buffer.length < 16) return null;
  if (buffer.readUInt32BE(0) !== 0x89504e47 || buffer.readUInt32BE(4) !== 0x0d0a1a0a) return null;
  let offset = 8;
  // 同时有 chara(V2) 和 ccv3 时取 ccv3：新版工具把完整数据写在 ccv3 里
  const found: Record<string, unknown> = {};
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
          if (json && !found[keyword]) found[keyword] = json;
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
          if (json && !found[keyword]) found[keyword] = json;
        }
      }
    }
    if (type === 'IEND') break;
    offset = end + 4;
  }
  return found.ccv3 ?? found.chara ?? null;
}

export function isPng(buffer: Buffer): boolean {
  return buffer.length > 16 && buffer.readUInt32BE(0) === 0x89504e47 && buffer.readUInt32BE(4) === 0x0d0a1a0a;
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
}

// 把角色卡写进 PNG：去掉旧的 chara/ccv3 文本块，在 IEND 前写入新的（与 SillyTavern 导出一致）
export function embedPngCard(buffer: Buffer, cards: { chara?: unknown; ccv3?: unknown }): Buffer | null {
  if (!isPng(buffer)) return null;
  const parts: Buffer[] = [buffer.subarray(0, 8)];
  let offset = 8;
  let iend: Buffer | null = null;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (end > buffer.length) return null;
    const whole = buffer.subarray(offset, end);
    if (type === 'IEND') {
      iend = whole;
      break;
    }
    let skip = false;
    if (type === 'tEXt' || type === 'iTXt' || type === 'zTXt') {
      const data = buffer.subarray(offset + 8, offset + 8 + length);
      const zero = data.indexOf(0);
      const keyword = zero > 0 ? data.toString('latin1', 0, zero) : '';
      skip = keyword === 'chara' || keyword === 'ccv3';
    }
    if (!skip) parts.push(whole);
    offset = end;
  }
  if (!iend) return null;
  for (const [keyword, value] of Object.entries(cards)) {
    if (value === undefined) continue;
    const text = Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
    parts.push(chunk('tEXt', Buffer.concat([Buffer.from(keyword, 'latin1'), Buffer.from([0]), Buffer.from(text, 'latin1')])));
  }
  parts.push(iend);
  return Buffer.concat(parts);
}

function decodeBase64Json(value: string): unknown | null {
  try {
    const raw = Buffer.from(value.trim(), 'base64').toString('utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
