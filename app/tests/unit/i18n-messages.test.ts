// 报错 / 提示文案英文覆盖（第二轮审计 D2）：静态扫 fail / setError / showAlert / setNotice / new Error / toast.* 的中文字面量，
// 模板占位代入样例值后按运行时规则（lib/i18n/core.ts translate）试译，结果里不能再有汉字。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { translate } from '@/lib/i18n/core';

const APP = fileURLToPath(new URL('../../', import.meta.url));
const HAN = /[\u4e00-\u9fff]/;
const CALL = /\b(fail|setError|showAlert|setNotice|new Error|toast\.(?:ok|err|error|info))\(\s*/g;

function literals(): { where: string; text: string }[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|tsx)$/.test(name)) files.push(path);
    }
  };
  for (const dir of ['app', 'components', 'lib']) walk(join(APP, dir));
  const out: { where: string; text: string }[] = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(CALL)) {
      let i = m.index! + m[0].length;
      const quote = src[i];
      if (quote !== '"' && quote !== "'" && quote !== '`') continue;
      let text = '';
      let n = 0;
      for (i += 1; i < src.length && src[i] !== quote; ) {
        const c = src[i];
        if (c === '\\') { const next = src[i + 1]; text += next === 'n' ? '\n' : next; i += 2; continue; }
        if (quote === '`' && c === '$' && src[i + 1] === '{') {
          let depth = 1;
          for (i += 2; i < src.length && depth; i += 1) { if (src[i] === '{') depth += 1; else if (src[i] === '}') depth -= 1; }
          text += `{${n++}}`;
          continue;
        }
        text += c;
        i += 1;
      }
      if (HAN.test(text)) out.push({ where: `${file.slice(APP.length)}:${src.slice(0, m.index).split('\n').length}`, text });
    }
  }
  return out;
}

test('报错 / 提示里的中文字面量都能译成英文', () => {
  const en = JSON.parse(readFileSync(join(APP, 'lib/i18n/en.json'), 'utf8')) as Record<string, string>;
  const all = literals();
  assert.ok(all.length > 500, `只扫到 ${all.length} 条，扫描规则可能失效`);
  const missing = all.filter(({ text }) => HAN.test(translate(text.replace(/\{(\d+)\}/g, (_x, k) => String(10 + Number(k))), en)));
  assert.deepEqual(missing.map((item) => `${item.where} ${JSON.stringify(item.text)}`), []);
});

test('停止词提示的英文保留字面 \\n（原来词条值里是真换行）', () => {
  const en = JSON.parse(readFileSync(join(APP, 'lib/i18n/en.json'), 'utf8')) as Record<string, string>;
  const out = translate('停止词要写成 JSON 数组，例如 ["\\n{{user}}:"]', en);
  assert.equal(out, 'Stop strings must be a JSON array, e.g. ["\\n{{user}}:"]');
});
