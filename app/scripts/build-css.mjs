// 按主题拆分的全局样式：三套主题各自一个文件，只加载当前主题那一份。
// 层叠顺序必须与原来 app/layout.tsx 里的 import 顺序一致：
//   Next 打包的样式（proto/*、redesign、themes/shared.css）→ 当前主题 → 主题之后的样式（custom、dark…i18n-en）
// 所以「主题之后」的样式也一起拆出来，按原顺序合成一份，layout 用 React 的 precedence 分组保证先后。
// 用与 postcss.config.mjs 相同的插件处理，产物写到 public/_css/（带内容 hash），清单 public/_css/manifest.json。
// 用法：node scripts/build-css.mjs [--watch]（npm run dev / build 前会自动跑）
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);
const postcss = require('postcss');
const cssnano = require('next/dist/compiled/cssnano-simple');
const plugins = [
  require('./postcss-select.cjs'),
  require('./postcss-dark.cjs'),
  require('next/dist/compiled/postcss-flexbugs-fixes'),
  require('next/dist/compiled/postcss-preset-env')({
    browsers: ['defaults'],
    autoprefixer: { flexbox: 'no-2009' },
    stage: 3,
    features: { 'custom-properties': false },
  }),
];

const THEME_FILES = ['styles/themes/folio.css', 'styles/themes/nocturne.css', 'styles/themes/stage.css'];
const THEMES = ['folio', 'nocturne', 'stage'];
// 每个主题包 = 三个主题文件按原顺序拼接，再删掉只作用于「其它主题」的选择器。
// 主题文件里也有不带 data-theme 的通用规则（如主题选择卡片的缩略图），它们在每个包里都保留、位置不变。
export const BUNDLES = {
  ...Object.fromEntries(THEMES.map((t) => [`theme-${t}`, THEME_FILES])),
  // 原来排在三套主题之后的全局样式，顺序不能改
  post: [
    'styles/themes/custom.css',
    'styles/themes/dark.css',
    'styles/chat-focus.css',
    'styles/ui-select.css',
    'styles/quick-replies.css',
    'styles/ui-dialog.css',
    'styles/auth.css',
    'styles/me-shell.css',
    'styles/wallet.css',
    'styles/points-chip.css',
    'styles/sprites.css',
    'styles/models.css',
    'styles/i18n-en.css',
  ],
};
const OUT = path.join(ROOT, 'public/_css');

async function processFile(rel) {
  const from = path.join(ROOT, rel);
  const res = await postcss(plugins).process(fs.readFileSync(from, 'utf8'), { from, map: false });
  return res.css;
}

// 选择器（去掉 :not(...) 后）里出现 data-theme="X" 且 X 不是当前主题 → 这条选择器对当前主题永远不生效
function targetsOther(sel, theme) {
  const bare = sel.replace(/:not\((?:[^()]|\([^()]*\))*\)/g, '');
  const m = [...bare.matchAll(/\[data-theme[~|^$*]?=\s*["']?([a-z-]+)["']?\s*\]/g)].map((x) => x[1]);
  return m.length > 0 && m.some((x) => x !== theme);
}
function pruneForTheme(css, theme) {
  const root = postcss.parse(css);
  root.walkRules((rule) => {
    if (rule.parent && rule.parent.type === 'atrule' && /keyframes/.test(rule.parent.name)) return;
    const keep = rule.selectors.filter((sel) => !targetsOther(sel, theme));
    if (keep.length === 0) rule.remove();
    else if (keep.length !== rule.selectors.length) rule.selectors = keep;
  });
  // 删空的 @media / @supports
  let changed = true;
  while (changed) {
    changed = false;
    root.walkAtRules((at) => {
      if (/^(media|supports|container|layer)$/.test(at.name) && at.nodes && at.nodes.length === 0) { at.remove(); changed = true; }
    });
  }
  return root.toString();
}

async function buildAll() {
  const started = Date.now();
  fs.mkdirSync(OUT, { recursive: true });
  const manifest = {};
  for (const [name, files] of Object.entries(BUNDLES)) {
    const parts = [];
    for (const f of files) parts.push(await processFile(f));
    let css = parts.join('\n');
    if (name.startsWith('theme-')) css = pruneForTheme(css, name.slice(6));
    const min = await postcss([cssnano()]).process(css, { from: undefined, map: false });
    const hash = createHash('sha256').update(min.css).digest('hex').slice(0, 10);
    const file = `${name}.${hash}.css`;
    fs.writeFileSync(path.join(OUT, file), min.css);
    manifest[name] = `/_css/${file}`;
  }
  // 清掉旧 hash 的文件
  const keep = new Set(Object.values(manifest).map((h) => path.basename(h)));
  for (const f of fs.readdirSync(OUT)) if (f.endsWith('.css') && !keep.has(f)) fs.rmSync(path.join(OUT, f));
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`[build-css] ${Object.keys(manifest).length} bundles in ${Date.now() - started} ms`);
}

await buildAll();

if (process.argv.includes('--watch')) {
  const files = new Set(Object.values(BUNDLES).flat().map((f) => path.join(ROOT, f)));
  let timer = null;
  for (const f of files) {
    fs.watch(f, () => {
      clearTimeout(timer);
      timer = setTimeout(() => buildAll().catch((e) => console.error('[build-css]', e.message)), 120);
    });
  }
  console.log('[build-css] watching');
}
