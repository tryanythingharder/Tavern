// Next.js 服务端错误钩子：所有路由、Server Action、渲染错误都会经过这里
export async function register() {}

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
