import zlib from 'node:zlib';

// 资料库上传的二进制文档转纯文本：PDF（unpdf / pdf.js）、Word .docx、EPUB、OpenDocument .odt。
// zip 用最小实现读中央目录 + inflateRaw，不额外装解压库。

// 部首补充区（U+2E80–U+2EFF）没有兼容分解，常见的手动映射到简体常用字
const RADICALS: Record<string, string> = {
  '⻚': '页',
  '⻅': '见',
  '⻓': '长',
  '⻔': '门',
  '⻛': '风',
  '⻜': '飞',
  '⻝': '食',
  '⻢': '马',
  '⻥': '鱼',
  '⻦': '鸟',
  '⻰': '龙',
  '⻋': '车',
  '⻉': '贝',
  '⻆': '角',
  '⻩': '黄',
  '⻬': '齐',
  '⻮': '齿',
  '⻨': '麦',
  '⻳': '龟',
  '⻁': '虎',
  '⻄': '西',
  '⻘': '青',
  '⻤': '鬼',
  '⻣': '骨',
  '⺠': '民',
  '⺟': '母',
  '⻑': '镸',
  '⺁': '厂',
  '⺇': '几',
  '⺊': '卜',
  '⺌': '小',
  '⺍': '小',
  '⺕': '彐',
  '⺜': '日',
  '⺝': '月',
  '⺶': '羊',
  '⺷': '羊',
  '⻊': '足',
  '⻏': '阝',
  '⻖': '阝',
  '⻌': '辶',
  '⻍': '辶',
  '⺮': '竹',
  '⺾': '艹',
  '⺿': '艹',
  '⻀': '艹',
  '⻎': '辶',
  '⻗': '雨',
  '⻙': '韦',
  '⻞': '食',
  '⻟': '饣',
  '⻠': '饣',
  '⻡': '首',
  '⻧': '鸟',
  '⻭': '齿',
  '⻯': '龙',
  '⻱': '龟',
};

export const BINARY_DOC = /\.(pdf|docx|epub|odt)$/i;
const MAX_UNZIPPED = 64 * 1024 * 1024;

type ZipEntry = { name: string; method: number; compSize: number; offset: number };

function zipEntries(buf: Buffer): ZipEntry[] {
  // 找中央目录结尾记录（EOCD），最多在末尾 64KB 注释里
  let eocd = -1;
  for (let at = buf.length - 22; at >= Math.max(0, buf.length - 65_557); at -= 1) {
    if (buf.readUInt32LE(at) === 0x06054b50) { eocd = at; break; }
  }
  if (eocd < 0) throw new Error('文件不是有效的 zip 文档');
  const count = buf.readUInt16LE(eocd + 10);
  let at = buf.readUInt32LE(eocd + 16);
  const out: ZipEntry[] = [];
  for (let index = 0; index < count && at + 46 <= buf.length; index += 1) {
    if (buf.readUInt32LE(at) !== 0x02014b50) break;
    const method = buf.readUInt16LE(at + 10);
    const compSize = buf.readUInt32LE(at + 20);
    const nameLen = buf.readUInt16LE(at + 28);
    const extraLen = buf.readUInt16LE(at + 30);
    const commentLen = buf.readUInt16LE(at + 32);
    const offset = buf.readUInt32LE(at + 42);
    out.push({ name: buf.subarray(at + 46, at + 46 + nameLen).toString('utf8'), method, compSize, offset });
    at += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

function zipRead(buf: Buffer, entry: ZipEntry): string {
  const local = entry.offset;
  if (buf.readUInt32LE(local) !== 0x04034b50) throw new Error('zip 文档已损坏');
  const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
  const data = buf.subarray(start, start + entry.compSize);
  if (entry.method === 0) return data.toString('utf8');
  if (entry.method === 8) return zlib.inflateRawSync(data, { maxOutputLength: MAX_UNZIPPED }).toString('utf8');
  throw new Error('不支持的 zip 压缩方式');
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&amp;/g, '&');
}

function tidy(text: string): string {
  return text.replace(/[ \t\u00a0]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function docxText(xml: string): string {
  return tidy(decodeEntities(xml
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:(br|cr)\b[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')));
}

function htmlText(html: string): string {
  return tidy(decodeEntities(html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d|tr|blockquote|section)>/gi, '\n')
    .replace(/<[^>]+>/g, '')));
}

function epubText(buf: Buffer): string {
  const entries = zipEntries(buf);
  const byName = new Map(entries.map((entry) => [entry.name, entry]));
  // 按 OPF 的 spine 顺序读章节；读不到就按文件名顺序
  const container = byName.get('META-INF/container.xml');
  const opfPath = container ? /full-path="([^"]+)"/.exec(zipRead(buf, container))?.[1] : undefined;
  let order: string[] = [];
  if (opfPath && byName.has(opfPath)) {
    const opf = zipRead(buf, byName.get(opfPath)!);
    const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
    const manifest = new Map<string, string>();
    for (const match of opf.matchAll(/<item\b[^>]*>/g)) {
      const id = /\bid="([^"]+)"/.exec(match[0])?.[1];
      const href = /\bhref="([^"]+)"/.exec(match[0])?.[1];
      if (id && href) manifest.set(id, base + decodeURIComponent(href));
    }
    order = [...opf.matchAll(/<itemref\b[^>]*idref="([^"]+)"/g)].map((match) => manifest.get(match[1])).filter((name): name is string => Boolean(name && byName.has(name)));
  }
  if (!order.length) order = entries.map((entry) => entry.name).filter((name) => /\.x?html?$/i.test(name)).sort();
  return tidy(order.map((name) => htmlText(zipRead(buf, byName.get(name)!))).join('\n\n'));
}

export async function extractDocText(name: string, buf: Buffer): Promise<string> {
  const ext = name.toLowerCase().split('.').pop();
  if (ext === 'pdf') {
    const { extractText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: false });
    // PDF 里的中文常被映射成康熙部首（⼀ ⻚ ⼈），逐字 NFKC 还原成常用汉字；别的字符（全角标点）不动
    const pages = (Array.isArray(text) ? text : [text]).map((page) => tidy(String(page).replace(/[\u2e80-\u2fdf]/g, (ch) => RADICALS[ch] ?? ch.normalize('NFKC'))));
    const out = pages.filter(Boolean).join('\n\n');
    if (!out.trim()) throw new Error('这个 PDF 里没有可提取的文字（可能是扫描图片）');
    return out;
  }
  if (ext === 'docx') {
    const entries = zipEntries(buf);
    const doc = entries.find((entry) => entry.name === 'word/document.xml');
    if (!doc) throw new Error('不是有效的 Word 文档（.docx）');
    return docxText(zipRead(buf, doc));
  }
  if (ext === 'odt') {
    const content = zipEntries(buf).find((entry) => entry.name === 'content.xml');
    if (!content) throw new Error('不是有效的 OpenDocument 文档');
    return tidy(decodeEntities(zipRead(buf, content).replace(/<text:tab\/>/g, '\t').replace(/<text:line-break\/>/g, '\n').replace(/<\/text:(p|h)>/g, '\n').replace(/<[^>]+>/g, '')));
  }
  if (ext === 'epub') return epubText(buf);
  throw new Error('不支持的文件类型');
}
