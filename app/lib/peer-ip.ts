import http from 'node:http';

// 在请求进入 Next 之前，把 TCP 对端地址写进 x-tavern-peer（先删掉客户端自带的同名头，防伪造）。
// App Router 的路由和 Server Action 拿不到 socket，只能这样传进去；lib/rate-limit.ts 的 ipFromHeaders 读它。
// 与 lib/rate-limit.ts 的 PEER_HEADER 保持一致（这里不 import，避免在 instrumentation 里拉起数据库）。
const PEER_HEADER = 'x-tavern-peer';
const FLAG = Symbol.for('tavern.peer-ip.installed');

export function installPeerIp() {
  const proto = http.Server.prototype as unknown as { emit: (...args: unknown[]) => boolean; [FLAG]?: boolean };
  if (proto[FLAG]) return;
  proto[FLAG] = true;
  const original = proto.emit;
  proto.emit = function patchedEmit(this: unknown, event: unknown, ...rest: unknown[]) {
    if (event === 'request') {
      const req = rest[0] as http.IncomingMessage | undefined;
      if (req?.headers) {
        delete req.headers[PEER_HEADER];
        const addr = req.socket?.remoteAddress;
        if (addr) req.headers[PEER_HEADER] = addr;
      }
    }
    return original.call(this, event, ...rest);
  };
}
