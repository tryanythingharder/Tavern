// /register：注册和登录共用 /login 页面（默认就是注册），这里只做跳转，保留 ?ref= 邀请码等参数。
// 用相对地址跳转：部署在反向代理后面时 request.url 可能是内部地址。
export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  params.delete('mode');
  params.set('mode', 'register');
  return new Response(null, { status: 307, headers: { Location: `/login?${params.toString()}` } });
}
