// 生成并发锁 + SSE 心跳。
// 同一个会话 / 群聊同时只跑一条生成（和 ST 一样，生成中不能再发/重新生成/继续），
// 否则两条回复会交错落库、楼层顺序和扣费都乱掉。锁在进程内存里，流结束（含中断、出错、客户端断开）即释放，
// 另有超时兜底，避免异常时永远锁死。
// 心跳：模型长时间思考、迟迟不出正文时，每 15 秒发一行 SSE 注释，防止反向代理 / CDN 因空闲断开连接。

const locks = new Map<string, number>();
const LOCK_TTL_MS = 12 * 60_000;
const HEARTBEAT_MS = 15_000;

export function generationBusy(key: string): boolean {
  const at = locks.get(key);
  if (at && Date.now() - at < LOCK_TTL_MS) return true;
  if (at) locks.delete(key);
  return false;
}

function acquire(key: string): boolean {
  if (generationBusy(key)) return false;
  locks.set(key, Date.now());
  return true;
}

function release(key: string) {
  locks.delete(key);
}

export const BUSY_MESSAGE = '上一条回复还在生成，请等它结束或先停止';

export function busyResponse(): Response {
  return new Response(JSON.stringify({ message: BUSY_MESSAGE, code: 'busy' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
}

// 编辑 / 删除 / 分支 / 恢复快照等改动楼层的操作：这个会话或群聊正在生成时返回 409，避免和正在落库的回复互相覆盖
export function busyGuard(key: string): Response | null {
  return generationBusy(key) ? busyResponse() : null;
}

export async function withGenerationLock(key: string, run: () => Promise<Response>): Promise<Response> {
  if (!acquire(key)) return busyResponse();
  let response: Response;
  try {
    response = await run();
  } catch (error) {
    release(key);
    throw error;
  }
  if (!response.body || !(response.headers.get('content-type') ?? '').includes('event-stream')) {
    release(key);
    return response;
  }
  return new Response(withHeartbeat(response.body, () => release(key)), { status: response.status, headers: response.headers });
}

// 先鉴权和归属检查（authorize 返回错误响应或锁键），通过后才获取锁：
// 否则别人的会话 id 会因「忙→409 / 闲→404」暴露存在性和活动状态，不存在的消息也会共用同一把锁。
export async function withAuthorizedLock(authorize: () => Promise<string | Response>, run: () => Promise<Response>): Promise<Response> {
  const key = await authorize();
  if (typeof key !== 'string') return key;
  return withGenerationLock(key, run);
}

export function withHeartbeat(source: ReadableStream<Uint8Array>, onEnd?: () => void): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  const ping = new TextEncoder().encode(': ping\n\n');
  let timer: ReturnType<typeof setInterval> | null = null;
  let ended = false;
  const end = () => {
    if (ended) return;
    ended = true;
    if (timer) clearInterval(timer);
    onEnd?.();
  };
  return new ReadableStream<Uint8Array>({
    start(controller) {
      let last = Date.now();
      timer = setInterval(() => {
        if (Date.now() - last < HEARTBEAT_MS) return;
        last = Date.now();
        try { controller.enqueue(ping); } catch { /* 已关闭 */ }
      }, 5000);
      void (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            last = Date.now();
            try { controller.enqueue(value); } catch { /* 客户端已断开，继续读完让服务端落库 */ }
          }
        } catch {
          // 源流出错
        } finally {
          end();
          try { controller.close(); } catch { /* 已关闭 */ }
        }
      })();
    },
    cancel() {
      // 客户端断开：不取消源流（服务端还要把已生成的部分落库，靠 request.signal 中断上游），只停心跳
      if (timer) clearInterval(timer);
    },
  });
}
