'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function ViewSwitch({ initial }: { initial: 'classic' | 'cinema' }) {
  const router = useRouter();
  const [mode, setMode] = useState(initial);

  const choose = (next: 'classic' | 'cinema') => {
    if (next === mode) return;
    document.cookie = `tavern_view=${next}; path=/; max-age=31536000; samesite=lax`;
    setMode(next);
    router.refresh();
  };

  return (
    <div className="p-view-switch" role="group" aria-label="浏览模式">
      <button type="button" aria-pressed={mode === 'classic'} onClick={() => choose('classic')}>经典</button>
      <button type="button" aria-pressed={mode === 'cinema'} onClick={() => choose('cinema')}>影院</button>
    </div>
  );
}
