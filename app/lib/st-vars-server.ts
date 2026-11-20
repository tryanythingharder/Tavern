import { writeHelperVars } from '@/lib/helper-vars';
import type { VarOwner, VarStore } from '@/lib/st-vars';

// 宏/命令改过的变量写回（和酒馆助手脚本共用 helper_vars）
export function persistVarStore(store: VarStore, owner: VarOwner | undefined | null): void {
  if (!owner) return;
  if (store.dirty.chat) writeHelperVars(owner.userId, 'chat', owner.chatScopeId, store.chat);
  if (store.dirty.global) writeHelperVars(owner.userId, 'global', '', store.global);
  store.dirty = { chat: false, global: false };
}
