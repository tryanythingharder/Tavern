// node:test 的启动钩子（node --import ./scripts/test/register.mjs）：
// 1) 注册解析钩子，让 '@/lib/x' 和省略扩展名的相对导入找到 .ts 文件（Node 22 自带类型剥离，不需要额外依赖）；
// 2) 把工作目录切到临时目录，lib/db.ts 会在 <cwd>/.data 建一个全新的库，不碰开发库。
import { register } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
register('./loader.mjs', import.meta.url);
const dir = mkdtempSync(join(tmpdir(), 'tavern-unit-'));
process.chdir(dir);
process.on('exit', () => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* 留给系统清 */ } });
process.env.TAVERN_TIMEZONE ??= 'UTC';
