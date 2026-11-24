// 解析钩子：'@/x' → <app>/x；没有扩展名时依次试 .ts、/index.ts；包子路径找不到时补 .js
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = new URL('../../', import.meta.url);
const tryFile = (url) => {
  const p = fileURLToPath(url);
  if (existsSync(p) && statSync(p).isFile()) return url.href;
  for (const ext of ['.ts', '/index.ts']) if (existsSync(p + ext)) return pathToFileURL(p + ext).href;
  return null;
};
export async function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    const hit = tryFile(new URL(specifier.slice(2), ROOT));
    if (hit) return { url: hit, shortCircuit: true };
  } else if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:') && !/\.[cm]?[jt]s$/.test(specifier)) {
    const hit = tryFile(new URL(specifier, context.parentURL));
    if (hit) return { url: hit, shortCircuit: true };
  }
  try {
    return await next(specifier, context);
  } catch (error) {
    // next/headers 这类包内子路径没写 exports，ESM 下要带 .js
    if (!specifier.startsWith('.') && !specifier.startsWith('node:') && !/\.[cm]?js$/.test(specifier)) return next(`${specifier}.js`, context);
    throw error;
  }
}
