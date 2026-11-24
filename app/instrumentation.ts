// Next.js 服务端错误钩子：所有路由、Server Action、渲染错误都会经过这里
export async function register() {
  // 英文词典放到进程全局，服务端渲染（含客户端组件 SSR）同步读取
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./lib/i18n/server');
    // 限流/登录记录用的客户端地址：把 TCP 对端地址带进请求头（见 lib/peer-ip.ts、lib/rate-limit.ts）
    const { installPeerIp } = await import('./lib/peer-ip');
    installPeerIp();
  }
}

export async function onRequestError(
  error: unknown,
  request: { path: string; method: string },
  context: { routerKind: string; routePath: string; routeType: string },
) {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { reportError } = await import('./lib/monitor');
    const err = error as Error & { digest?: string };
    reportError({
    source: 'server',
    message: err?.message ?? String(error),
    stack: err?.stack,
    digest: err?.digest,
    path: `${request.method} ${request.path}`,
    extra: { route: context.routePath, type: context.routeType },
    });
  }
}
