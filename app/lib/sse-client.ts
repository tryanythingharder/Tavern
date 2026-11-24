// 客户端读生成接口的 SSE：按空行切事件，只认 `data:` 开头的一行 JSON；
// 坏 JSON 跳过，onEvent 抛出的错误照常往外抛（调用方自己决定吞不吞）。
// 流结束时缓冲里没切完的残片丢弃（服务端每条都以 \n\n 结尾）。
export async function readSse<T = Record<string, unknown>>(body: ReadableStream<Uint8Array>, onEvent: (event: T) => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith('data:')) continue;
      let event: T;
      try {
        event = JSON.parse(line.slice(5).trim()) as T;
      } catch {
        continue;
      }
      onEvent(event);
    }
  }
}
