// HTTP Range（RFC 9110 §14）的单段解析，给 /media 的音频拖动 / 断点续传用。
// 返回：
//   null                        —— 没有 Range、不是 bytes 单位、写法认不出来、或多段：按规范忽略，回整份 200
//   { start, end }              —— 闭区间，已按文件大小截好：回 206
//   'unsatisfiable'             —— 写法对但取不到（起点超出文件、末尾小于起点、后缀 0 字节、空文件）：回 416
export type ByteRange = { start: number; end: number };

export function parseRange(header: string | null | undefined, size: number): ByteRange | 'unsatisfiable' | null {
  if (!header) return null;
  const m = /^\s*bytes\s*=\s*(.+)$/i.exec(header);
  if (!m) return null;
  const specs = m[1].split(',').map((part) => part.trim()).filter(Boolean);
  // 多段 range 要回 multipart/byteranges，这里不支持，按规范可以忽略整个 Range 回 200
  if (specs.length !== 1) return null;
  const spec = /^(\d*)-(\d*)$/.exec(specs[0]);
  if (!spec || (spec[1] === '' && spec[2] === '')) return null;
  if (spec[1] === '') {
    // 后缀：最后 N 字节
    const suffix = Number(spec[2]);
    if (!Number.isSafeInteger(suffix) || suffix === 0 || size === 0) return 'unsatisfiable';
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(spec[1]);
  const end = spec[2] === '' ? size - 1 : Number(spec[2]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return 'unsatisfiable';
  if (end < start || start >= size) return 'unsatisfiable';
  return { start, end: Math.min(end, size - 1) };
}
