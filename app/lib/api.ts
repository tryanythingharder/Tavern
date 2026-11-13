import { getCurrentUser, type User } from '@/lib/auth';

// 接口层的小工具：统一 JSON 错误格式，避免每个路由重复写 Response 头。
export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export function fail(message: string, status = 400): Response {
  return Response.json({ message }, { status });
}

export async function requireUser(): Promise<User | null> {
  return getCurrentUser();
}

export function idParam(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}
