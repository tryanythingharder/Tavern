'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// 酒馆助手（JS-Slash-Runner）角色卡脚本的运行器：每个脚本一个隐藏沙盒 iframe（public/sandbox/runner.html），
// 脚本能做的事都经这里中转：变量落库（/api/chats/[id]/helper）、脚本按钮、发消息、改楼层、提示。
// 对话里发生的事（发送、收到回复、编辑、删除、换候选）由 chat-room 用 window 事件 'tavern:helper' 通知过来，再广播给各脚本。
// 玩家可以按角色关掉卡内脚本（localStorage tavern:helper-off:<chatId>）。

type Script = { id: string; name: string; info: string; content: string; buttons: { name: string; visible: boolean }[] };
type Snapshot = { vars: Record<string, unknown> & { script?: Record<string, unknown> }; floors: { message_id: number; id: number; role: string; message: string }[]; total: number };
type Toast = { id: number; level: string; text: string };

export type HelperActions = {
  send: (text: string) => void;
  setInput: (text: string) => void;
  /** 对话页的斜杠命令执行器（lib/slash.ts）；有它就整条交给它，行为与玩家在输入框里打的一致 */
  slash?: (text: string) => Promise<void>;
  editMessage: (id: number, content: string) => Promise<void>;
};

export function emitHelperEvent(event: string, ...args: unknown[]) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('tavern:helper', { detail: { event, args } }));
}

const OFF_KEY = (chatId: number) => `tavern:helper-off:${chatId}`;

export function HelperRunner({ chatId, names, actions }: { chatId: number; names: { char: string; user: string }; actions: HelperActions }) {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [skipped, setSkipped] = useState<{ name: string }[]>([]);
  const [off, setOff] = useState(false);
  const [buttons, setButtons] = useState<Record<string, { name: string; visible: boolean }[]>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const frames = useRef(new Map<string, HTMLIFrameElement>());
  const snapshot = useRef<Snapshot | null>(null);
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const namesRef = useRef(names);
  namesRef.current = names;

  const toast = useCallback((level: string, text: string) => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list.slice(-2), { id, level, text }]);
    window.setTimeout(() => setToasts((list) => list.filter((item) => item.id !== id)), 3600);
  }, []);

  useEffect(() => {
    setOff(localStorage.getItem(OFF_KEY(chatId)) === '1');
    let cancelled = false;
    void fetch(`/api/chats/${chatId}/helper?scripts=1`, { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: (Snapshot & { scripts?: Script[]; skipped?: { name: string }[] }) | null) => {
        if (cancelled || !data) return;
        snapshot.current = { vars: data.vars, floors: data.floors, total: data.total };
        setScripts(data.scripts ?? []);
        setSkipped(data.skipped ?? []);
        setButtons(Object.fromEntries((data.scripts ?? []).map((script) => [script.id, script.buttons])));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [chatId]);

  const postAll = useCallback((message: unknown, except?: string) => {
    for (const [id, frame] of frames.current) if (id !== except) frame.contentWindow?.postMessage(message, '*');
  }, []);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/chats/${chatId}/helper`, { cache: 'no-store' }).catch(() => null);
    if (!response?.ok) return;
    const data = (await response.json()) as Snapshot;
    snapshot.current = data;
    postAll({ type: 'tavern-sync', snapshot: data });
  }, [chatId, postAll]);

  const slash = useCallback((command: string): string => {
    if (actionsRef.current.slash) {
      void actionsRef.current.slash(command);
      return '';
    }
    // 旧兜底：/send 文本 | /trigger、/setinput 文本、/echo 文本
    let sendText: string | null = null;
    let trigger = false;
    for (const part of command.split(/\|(?![^{]*\})/)) {
      const m = part.trim().match(/^\/(\w+)\s*([\s\S]*)$/);
      if (!m) continue;
      const [, name, rest] = m;
      const arg = rest.replace(/^(?:\w+=(?:"[^"]*"|\S+)\s+)+/, '').trim();
      if (name === 'send') sendText = arg;
      else if (name === 'trigger') trigger = true;
      else if (name === 'setinput') actionsRef.current.setInput(arg);
      else if (name === 'echo') toast('info', arg);
      else toast('warning', `卡内脚本用到了 /${name}，本站暂不支持`);
    }
    if (sendText !== null || trigger) actionsRef.current.send(sendText ?? '');
    return '';
  }, [toast]);

  useEffect(() => {
    if (off || !scripts.length) return;
    const ready = new Set<string>();
    const onMessage = (event: MessageEvent) => {
      let scriptId: string | null = null;
      for (const [id, frame] of frames.current) if (frame.contentWindow === event.source) scriptId = id;
      if (!scriptId) return;
      const frame = frames.current.get(scriptId)!;
      const data = event.data as { type?: string; [key: string]: unknown } | null;
      if (!data?.type) return;
      if (data.type === 'tavern-ready') {
        if (ready.has(scriptId)) return;
        ready.add(scriptId);
        const script = scripts.find((item) => item.id === scriptId);
        frame.contentWindow?.postMessage({ type: 'tavern-script', script, snapshot: snapshot.current, names: namesRef.current }, '*');
      } else if (data.type === 'tavern-vars') {
        const scope = String(data.scope);
        const body = { scope, scriptId: data.scriptId, data: data.data };
        const vars = snapshot.current?.vars;
        if (vars) {
          if (scope === 'script') vars.script = { ...(vars.script ?? {}), [String(data.scriptId)]: data.data };
          else vars[scope] = data.data;
        }
        postAll({ type: 'tavern-vars-changed', scope, scriptId: data.scriptId, data: data.data }, scriptId);
        void fetch(`/api/chats/${chatId}/helper`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
          .then((response) => { if (response.status === 413) toast('warning', '卡内脚本的变量太大，没能保存'); })
          .catch(() => {});
      } else if (data.type === 'tavern-emit') {
        postAll({ type: 'tavern-event', event: data.event, args: data.args }, scriptId);
      } else if (data.type === 'tavern-buttons' && Array.isArray(data.buttons)) {
        const list = (data.buttons as { name?: unknown; visible?: unknown }[])
          .filter((b) => typeof b?.name === 'string' && b.name)
          .slice(0, 12)
          .map((b) => ({ name: String(b.name).slice(0, 40), visible: b.visible !== false }));
        setButtons((prev) => ({ ...prev, [scriptId!]: list }));
      } else if (data.type === 'tavern-toast') {
        toast(String(data.level), String(data.text));
      } else if (data.type === 'tavern-log') {
        const text = `[卡内脚本 ${String(data.script)}] ${String(data.text)}`;
        if (data.level === 'error') console.warn(text);
        else console.info(text);
      } else if (data.type === 'tavern-rpc') {
        const reply = (ok: boolean, value?: unknown, error?: string) => frame.contentWindow?.postMessage({ type: 'tavern-rpc-result', id: data.id, ok, value, error }, '*');
        const args = Array.isArray(data.args) ? data.args : [];
        if (data.method === 'slash') reply(true, slash(String(args[0] ?? '')));
        else if (data.method === 'setChatMessages') {
          const list = Array.isArray(args[0]) ? (args[0] as { message_id?: number; message?: unknown }[]) : [];
          const floors = snapshot.current?.floors ?? [];
          void (async () => {
            try {
              for (const item of list.slice(0, 20)) {
                if (typeof item?.message !== 'string') continue;
                const floor = floors.find((f) => f.message_id === item.message_id);
                if (!floor) throw new Error(`楼层 ${item.message_id} 不在已加载范围内`);
                await actionsRef.current.editMessage(floor.id, item.message);
              }
              await refresh();
              reply(true);
            } catch (caught) {
              reply(false, undefined, (caught as Error).message);
            }
          })();
        } else reply(false, undefined, '不支持的操作');
      }
    };
    const onEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ event: string; args: unknown[] }>).detail;
      if (!detail?.event) return;
      // chat-room 传的是消息 id（{ dbId }）或倒数第几楼（{ fromEnd }），脚本要的是楼层号。
      // 被删的楼刷新后就找不到了，所以先按旧快照换算一次
      const before = snapshot.current?.floors ?? [];
      const early = (detail.args ?? []).map((arg) => (arg && typeof arg === 'object' && 'dbId' in arg ? before.find((f) => f.id === (arg as { dbId: number }).dbId)?.message_id : undefined));
      void refresh().then(() => {
        const floors = snapshot.current?.floors ?? [];
        const last = Math.max(0, (snapshot.current?.total ?? 1) - 1);
        const args = (detail.args ?? []).map((arg, index) => {
          if (!arg || typeof arg !== 'object') return arg;
          if ('fromEnd' in arg) return Math.max(0, last - Number((arg as { fromEnd: number }).fromEnd));
          if ('dbId' in arg) return floors.find((f) => f.id === (arg as { dbId: number }).dbId)?.message_id ?? early[index] ?? last;
          return arg;
        });
        postAll({ type: 'tavern-event', event: detail.event, args });
      });
    };
    window.addEventListener('message', onMessage);
    window.addEventListener('tavern:helper', onEvent);
    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('tavern:helper', onEvent);
    };
  }, [chatId, off, scripts, postAll, refresh, slash, toast]);

  const toggle = () => {
    const next = !off;
    localStorage.setItem(OFF_KEY(chatId), next ? '1' : '0');
    setOff(next);
  };

  if (!scripts.length && !skipped.length) return null;
  const visible = off ? [] : scripts.flatMap((script) => (buttons[script.id] ?? []).filter((b) => b.visible).map((b) => ({ script: script.id, name: b.name })));
  const title = [
    scripts.length ? `卡内脚本：${scripts.map((s) => s.name).join('、')}` : '',
    skipped.length ? `已由平台内置 MVU 接管：${skipped.map((s) => s.name).join('、')}` : '',
  ].filter(Boolean).join('\n');

  return (
    <>
      {!off && scripts.map((script) => (
        <iframe
          key={script.id}
          ref={(node) => { if (node) frames.current.set(script.id, node); else frames.current.delete(script.id); }}
          src="/sandbox/runner.html"
          sandbox="allow-scripts"
          title={`卡内脚本 ${script.name}`}
          aria-hidden="true"
          tabIndex={-1}
          style={{ position: 'absolute', width: 0, height: 0, border: 0, visibility: 'hidden' }}
        />
      ))}
      {scripts.length > 0 && (
        <div className="rp-helper-bar" role="toolbar" aria-label="卡内脚本">
          {visible.map((b) => (
            <button key={`${b.script}:${b.name}`} type="button" data-no-i18n="" className="p-chip rp-helper-btn" onClick={() => frames.current.get(b.script)?.contentWindow?.postMessage({ type: 'tavern-button', name: b.name }, '*')}>
              {b.name}
            </button>
          ))}
          <button type="button" className="rp-helper-toggle" aria-pressed={!off} title={title} onClick={toggle}>
            <span className="rp-helper-dot" data-on={off ? '0' : '1'} aria-hidden="true" />
            {off ? '卡内脚本已关闭' : `卡内脚本 ${scripts.length}`}
          </button>
        </div>
      )}
      {/* 挂到 body：有的主题给输入区加了 transform，fixed 会被困在里面 */}
      {toasts.length > 0 && createPortal(
        <div className="rp-helper-toasts" role="status" aria-live="polite">
          {toasts.map((item) => <div key={item.id} className="rp-helper-toast" data-level={item.level}>{item.text}</div>)}
        </div>,
        document.body,
      )}
    </>
  );
}
