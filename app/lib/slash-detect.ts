// 只判断「是不是斜杠命令」：对话页首屏静态引用这个，命令解析和帮助表（lib/slash.ts）用到时再加载
export function isSlash(text: string): boolean {
  return /^\/[\w?]/.test(text.trim());
}
