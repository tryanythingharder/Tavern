import fs from 'node:fs';
import path from 'node:path';
import { newQuickJSWASMModule, type QuickJSWASMModule } from 'quickjs-emscripten';
import { EJS_RUNTIME } from '@/lib/ejs-runtime';

// EJS 模板（ST-Prompt-Template 写法：<% %> <%= %> <%- %> <%_ _%> <%# %>）。
// 卡里的代码是作者写的任意 JS，绝不能在 Node 里直接跑：放进 QuickJS（WASM）沙盒，
// 没有 require/process/网络/文件，限内存、限时；宿主只传 JSON 数据进去、拿 JSON 结果出来。

export type EjsVars = { global?: Record<string, unknown>; local?: Record<string, unknown>; message?: Record<string, unknown> };
export type EjsLore = { uid: string; title: string; content: string; book?: string };
export type EjsSet = { op: 'set' | 'del'; scope: string; key: string[]; value?: unknown };
export type EjsError = { index: number; name: string; message: string };

export type EjsInput = {
  texts: { text: string; name?: string; data?: Record<string, unknown> }[];
  vars: EjsVars;
  /** 模板里直接可用的只读字段（userName、charName、lastUserMessage…） */
  env: Record<string, unknown>;
  lore?: EjsLore[];
  char?: Record<string, unknown>;
  messages?: { role: string; content: string }[];
  charLoreBook?: string;
  /** true：setvar 真的写（收到回复后处理）；false：只算不写（生成提示词时，和 ST-PT 默认一致） */
  persist?: boolean;
  /** 渲染楼层时 <%= %> 转义 HTML */
  escape?: boolean;
  timeoutMs?: number;
};

export type EjsOutput = { out: (string | null)[]; sets: EjsSet[]; errors: EjsError[] };

export const hasEjs = (text: string | null | undefined) => typeof text === 'string' && text.includes('<%');

let modulePromise: Promise<QuickJSWASMModule> | null = null;
const quick = () => (modulePromise ??= newQuickJSWASMModule());

let lodashSource: string | null | undefined;
function lodash(): string | null {
  if (lodashSource !== undefined) return lodashSource;
  try {
    lodashSource = fs.readFileSync(path.join(process.cwd(), 'public/sandbox/vendor/lodash.min.js'), 'utf8');
  } catch {
    lodashSource = null;
  }
  return lodashSource;
}

const MEMORY_LIMIT = 48 * 1024 * 1024;

export async function runEjs(input: EjsInput): Promise<EjsOutput> {
  const empty: EjsOutput = { out: input.texts.map((item) => item.text), sets: [], errors: [] };
  if (!input.texts.some((item) => hasEjs(item.text))) return empty;
  let QJS: QuickJSWASMModule;
  try {
    QJS = await quick();
  } catch (error) {
    modulePromise = null;
    return { out: input.texts.map(() => null), sets: [], errors: [{ index: -1, name: '', message: `EJS 沙盒加载失败：${error instanceof Error ? error.message : String(error)}` }] };
  }
  const runtime = QJS.newRuntime();
  runtime.setMemoryLimit(MEMORY_LIMIT);
  runtime.setMaxStackSize(1024 * 1024);
  // 每条模板单独计时（见下面的循环）
  let deadline = Date.now() + 1000;
  runtime.setInterruptHandler(() => Date.now() > deadline);
  const vm = runtime.newContext();
  const evalOk = (code: string, name: string) => {
    const result = vm.evalCode(code, name);
    if (result.error) {
      const err = vm.dump(result.error) as { message?: string } | string;
      if (result.error.alive) result.error.dispose();
      throw new Error(typeof err === 'string' ? err : err?.message ?? 'EJS 运行失败');
    }
    const value = vm.dump(result.value);
    if (result.value.alive) result.value.dispose();
    return value;
  };
  try {
    evalOk(EJS_RUNTIME, 'ejs-runtime.js');
    const needsLodash = input.texts.some((item) => /(^|[^\w$.])_\s*\./.test(item.text)) || (input.lore ?? []).some((entry) => /(^|[^\w$.])_\s*\./.test(entry.content));
    const lib = needsLodash ? lodash() : null;
    if (lib) evalOk(`${lib};globalThis._=_;`, 'lodash.js');
    const data = {
      vars: input.vars,
      env: input.env,
      lore: input.lore ?? [],
      char: input.char ?? {},
      messages: input.messages ?? [],
      charLoreBook: input.charLoreBook ?? '',
      persist: Boolean(input.persist),
      escape: Boolean(input.escape),
    };
    evalOk(`__init(JSON.parse(${JSON.stringify(JSON.stringify(data))}))`, 'init.js');
    const texts = input.texts.map((item) => ({ text: item.text, name: item.name ?? '', data: item.data ?? {} }));
    evalOk(`__load(JSON.parse(${JSON.stringify(JSON.stringify(texts))}))`, 'load.js');
    const per = input.timeoutMs ?? 800;
    const timedOut: EjsError[] = [];
    const budgetEnd = Date.now() + 4000;
    for (let index = 0; index < texts.length; index += 1) {
      if (!hasEjs(texts[index].text)) continue;
      // 整次最多 4 秒：后面的保持原文
      if (Date.now() > budgetEnd) {
        timedOut.push({ index, name: texts[index].name, message: 'EJS 总时长超限，后面的模板按原文发送' });
        break;
      }
      deadline = Math.min(Date.now() + per, budgetEnd);
      try {
        evalOk(`__renderOne(${index})`, 'render.js');
        // async 模板：把 Promise 队列跑完
        for (let guard = 0; guard < 10_000; guard += 1) {
          const pending = runtime.executePendingJobs();
          if (pending.error) {
            const err = vm.dump(pending.error) as { message?: string };
            if (pending.error.alive) pending.error.dispose();
            throw new Error(err?.message ?? 'EJS 运行失败');
          }
          if (pending.value === 0) break;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        timedOut.push({ index, name: texts[index].name, message: /interrupted/i.test(message) ? `「${texts[index].name}」运行超时` : message });
      }
    }
    deadline = Date.now() + 500;
    const raw = evalOk('__result()', 'result.js');
    if (typeof raw !== 'string' || !raw) throw new Error('EJS 超时或没有返回结果');
    const parsed = JSON.parse(raw) as EjsOutput;
    return {
      out: parsed.out.map((value, index) => (value === null ? null : String(value ?? input.texts[index].text))),
      sets: parsed.sets ?? [],
      errors: [...(parsed.errors ?? []).map((item) => (/interrupted/i.test(item.message) ? { ...item, message: `「${item.name}」运行超时` } : item)), ...timedOut],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { out: input.texts.map(() => null), sets: [], errors: [{ index: -1, name: '', message: /interrupted/i.test(message) ? 'EJS 运行超时' : message }] };
  } finally {
    try {
      vm.dispose();
      runtime.dispose();
    } catch {
      // 释放失败（有句柄漏了）会让 WASM 模块 abort，下次换一个新模块
      modulePromise = null;
    }
  }
}
