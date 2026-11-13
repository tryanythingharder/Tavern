import { cookies } from 'next/headers';

export type ViewMode = 'classic' | 'cinema';

export async function getViewMode(): Promise<ViewMode> {
  const store = await cookies();
  return store.get('tavern_view')?.value === 'cinema' ? 'cinema' : 'classic';
}
