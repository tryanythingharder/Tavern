// MVU 文本小工具，单独成文件：对话页只需要这两个，不必把整个变量引擎打进首屏包。

export function hasMvuCommands(text: string): boolean {
  return /_\.(set|add|insert|assign|remove|unset|delete)\s*\(|<JSONPatch>|<json_patch>/i.test(text);
}

export function stripMvuBlocks(text: string): string {
  if (!/<(UpdateVariable|update_variable|JSONPatch|json_patch)>/i.test(text)) return text;
  return text
    .replace(/<(UpdateVariable|update_variable|JSONPatch|json_patch)>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(UpdateVariable|update_variable|JSONPatch|json_patch)>[\s\S]*$/i, '')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
}
