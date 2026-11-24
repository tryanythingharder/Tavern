import { inflateRawSync } from 'node:zlib';

// 极简 zip 读取（只读中央目录，支持 store / deflate），用于导入 ST 表情包等小压缩包。
export type ZipEntry = { name: string; data: Buffer };

export function readZip(buf: Buffer, limits = { files: 300, bytes: 60 * 1024 * 1024 }): ZipEntry[] {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('不是有效的 zip 文件');
  const count = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16);
  const out: ZipEntry[] = [];
  let total = 0;
  for (let n = 0; n < count && out.length < limits.files; n++) {
    if (buf.readUInt32LE(ptr) !== 0x02014b50) break;
    const method = buf.readUInt16LE(ptr + 10);
    const compSize = buf.readUInt32LE(ptr + 20);
    const size = buf.readUInt32LE(ptr + 24);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const local = buf.readUInt32LE(ptr + 42);
    const name = buf.subarray(ptr + 46, ptr + 46 + nameLen).toString('utf8');
    ptr += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/') || name.startsWith('__MACOSX') || (method !== 0 && method !== 8)) continue;
    // 中央目录里声明的 size 可以随便写，不能拿来计数：按实际解出的字节累计，解压时把输出上限卡在剩余额度
    if (size > limits.bytes - total) throw new Error('压缩包解开后太大');
    const remaining = limits.bytes - total;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + compSize);
    let data: Buffer;
    if (method === 0) {
      if (raw.length > remaining) throw new Error('压缩包解开后太大');
      data = Buffer.from(raw);
    } else {
      try {
        // maxOutputLength 必须 ≥1；超出时 zlib 抛 ERR_BUFFER_TOO_LARGE
        data = inflateRawSync(raw, { maxOutputLength: Math.max(1, remaining) });
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'ERR_BUFFER_TOO_LARGE' || /Cannot create a Buffer larger|buffer.*too large/i.test((error as Error).message)) throw new Error('压缩包解开后太大');
        throw error;
      }
    }
    total += data.length;
    if (total > limits.bytes) throw new Error('压缩包解开后太大');
    out.push({ name, data });
  }
  return out;
}
