#!/usr/bin/env node
// 内置立绘缩略图：public/characters/<id>.jpg 与 private/characters/<id>.jpg（18+）
//   → 统一输出到 private/characters/t/<id>.webp，地址 /characters/t/<id>.webp?v=N
// 全部经 app/characters/t/[file]/route.ts 提供：全年龄卡回 public 长缓存，18+ 卡先 nsfwBlock 判定、回 private no-cache。
// （不放 public/：静态文件不能按卡分别给缓存头，next.config 的 headers 又会盖掉路由自己的头。）
// 列表卡片（广场 / 首页 / 作者页 / 搜索 / 书架）用缩略图，详情页仍用原图。
// 用法：node scripts/build-thumbs.mjs [--force]
// 只用项目已有依赖 sharp；产物入库，运行时不生成。新增内置立绘后重跑一次即可。
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const WIDTH = 480; // 卡片显示宽约 170–240 CSS px，480 够 2x 屏
const QUALITY = 72;
const MAX_BYTES = 40 * 1024;
const force = process.argv.includes('--force');

let made = 0, kept = 0, total = 0, biggest = { name: '', size: 0 };
const out = path.join(ROOT, 'private/characters/t');
fs.mkdirSync(out, { recursive: true });
const wanted = new Set();
for (const base of ['public/characters', 'private/characters']) {
  const src = path.join(ROOT, base);
  if (!fs.existsSync(src)) continue;
  for (const file of fs.readdirSync(src).filter((name) => /^[a-z0-9-]+\.jpg$/.test(name)).sort()) {
    const target = path.join(out, file.replace(/\.jpg$/, '.webp'));
    wanted.add(path.basename(target));
    const from = path.join(src, file);
    if (!force && fs.existsSync(target) && fs.statSync(target).mtimeMs >= fs.statSync(from).mtimeMs) { kept += 1; }
    else {
      // 超过 40KB 的先降质量（最低 60），仍超就缩窄宽度（细节多的场景图），保证单张不超标
      let buffer;
      outer: for (const width of [WIDTH, 432, 400, 360]) {
        for (let quality = QUALITY; quality >= 60; quality -= 4) {
          buffer = await sharp(from).resize({ width, withoutEnlargement: true }).webp({ quality, effort: 6, smartSubsample: true }).toBuffer();
          if (buffer.length <= MAX_BYTES) break outer;
        }
      }
      fs.writeFileSync(target, buffer);
      made += 1;
    }
    const size = fs.statSync(target).size;
    total += size;
    if (size > biggest.size) biggest = { name: path.basename(target), size };
  }
}
// 原图已删的缩略图一并清掉
for (const name of fs.readdirSync(out)) if (!wanted.has(name)) fs.rmSync(path.join(out, name));
// 没到 480 宽的（细节多、为了 ≤40KB 缩窄的）记下实际宽度，srcset 用真实宽度描述，浏览器才不会把它放大
const narrow = {};
for (const name of [...wanted].sort()) {
  const { width } = await sharp(path.join(out, name)).metadata();
  if (width && width < WIDTH) narrow[name.replace(/\.webp$/, '')] = width;
}
fs.writeFileSync(path.join(ROOT, 'lib/thumb-widths.ts'), `// 由 scripts/build-thumbs.mjs 生成，勿手改：宽度不足 480 的内置缩略图的实际宽度（srcset 用）\nexport const NARROW_THUMBS: Record<string, number> = ${JSON.stringify(narrow, null, 2)};\n`);
console.log(`缩略图：新生成 ${made}，沿用 ${kept}，合计 ${(total / 1024).toFixed(0)}KB；最大 ${biggest.name} ${(biggest.size / 1024).toFixed(1)}KB`);
