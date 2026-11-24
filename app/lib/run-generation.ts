import { finishGeneration } from '@/lib/db';
import { GenTrace } from '@/lib/gen-prefs';
import { streamChat, type ChatMessage, type StreamOptions } from '@/lib/model';
import { pointsCost, settleGeneration } from '@/lib/points';
import { estimateTokens } from '@/lib/usage';

// 六个生成路由（发送、重新生成、继续、代拟，含群聊）共用的流式 + 计费外壳。
// 路由自己负责：鉴权/拼提示词/预扣点数/startGeneration，以及 complete（正常结束后落库、收尾、结算、发 done）
// 和 recover（出错/中断时把部分结果存下来）。这里负责：SSE 流、读模型事件、出错时的收尾与结算。

export type GenUsage = { promptTokens: number; completionTokens: number; totalTokens: number };
type FinishPatch = Parameters<typeof finishGeneration>[1];
type Settlement = ReturnType<typeof settleGeneration>;

export interface GenRun {
  /** 往客户端发一条 SSE（客户端已断开时静默忽略，生成照常落库） */
  send(payload: unknown): void;
  full: string;
  trace: GenTrace;
  usage: GenUsage | null;
  /** 按实际接通的模型计费（failover 到备用线路时价格以备用模型为准） */
  billedModel: string;
  /** 一条线路都没接通（全部失败）就不扣点；接通后失败且没产出任何正文也不扣 */
  connected: boolean;
  startedAt: number;
  // 结果已落库 / 生成记录已收尾 / 已结算 / done 已准备好：之后的步骤再抛错，
  // 出错分支不能再存一次部分结果、不能重复收尾结算、不能把 done 改成 error
  saved: boolean;
  finished: boolean;
  settled: boolean;
  donePayload: Record<string, unknown> | null;
  /** usage 优先，没有就按提示词估算 + 正文估算 */
  tokens(): GenUsage;
  /** finishGeneration 并标记 finished */
  finish(patch: FinishPatch): void;
  /** settleGeneration（按预扣结算）并标记 settled */
  settle(actual: number): Settlement;
}

export type RunGenerationOptions = {
  request: Request;
  messages: ChatMessage[];
  streamOptions: Omit<StreamOptions, 'signal'>;
  generationId: number;
  userId: number;
  reserved: number;
  /** 计费流水的 ref，如 chat:12 / room:3 */
  ref: string;
  /** 默认计费模型（没有 route 事件时） */
  model: string;
  /** 估算的提示词 token（出错结算、没有 usage 时用） */
  promptTokens: number;
  /**
   * 'reply'：发送/重新生成/继续/群聊——转发思考、出错时按 recover/saved/finished/settled 收尾；
   * 'impersonate'：代拟——不转发思考，出错时按旧逻辑（仅以 signal.aborted 判中断，error 记 String(error)，不写 model）。
   */
  kind?: 'reply' | 'impersonate';
  /** 流开始、读模型之前（如群聊先发 speaker） */
  begin?(run: GenRun): void;
  /** 模型流正常读完后 */
  complete(run: GenRun): Promise<void> | void;
  /** 出错/中断且 !run.saved 时，把部分结果存下来；返回 true 表示没能写进去（消息已不存在），本次不扣点 */
  recover?(run: GenRun, error: unknown): boolean | void;
  /** 出错时发给客户端的默认文案 */
  errorMessage?: string;
  /** finally 里、关流之前 */
  end?(): void;
};

export function runGeneration(options: RunGenerationOptions): Response {
  const { request, generationId, userId, reserved, ref } = options;
  const kind = options.kind ?? 'reply';
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const run: GenRun = {
        send(payload) {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
          } catch {
            // 客户端已断开，继续把生成结果落库即可
          }
        },
        full: '',
        trace: new GenTrace(),
        usage: null,
        billedModel: options.model,
        connected: false,
        startedAt: Date.now(),
        saved: false,
        finished: false,
        settled: false,
        donePayload: null,
        tokens() {
          const promptTokens = run.usage?.promptTokens ?? options.promptTokens;
          const completionTokens = run.usage?.completionTokens ?? estimateTokens(run.full);
          const totalTokens = run.usage?.totalTokens ?? promptTokens + completionTokens;
          return { promptTokens, completionTokens, totalTokens };
        },
        finish(patch) {
          finishGeneration(generationId, patch);
          run.finished = true;
        },
        settle(actual) {
          const settlement = settleGeneration(userId, reserved, actual, ref);
          run.settled = true;
          return settlement;
        },
      };
      options.begin?.(run);
      try {
        for await (const event of streamChat(options.messages, { ...options.streamOptions, signal: request.signal })) {
          if (event.type === 'route') {
            run.connected = true;
            run.billedModel = event.model;
          } else if (event.type === 'content') {
            run.trace.onContent();
            run.full += event.text;
            run.send({ type: 'delta', text: event.text });
          } else if (event.type === 'reasoning') {
            if (kind === 'reply') {
              run.trace.onReasoning(event.text);
              run.send({ type: 'reasoning', text: event.text });
            }
          } else if (event.type === 'finish') {
            run.trace.finish = event.reason;
          } else if (event.type === 'usage') {
            run.usage = event;
          }
        }
        await options.complete(run);
      } catch (error) {
        const full = run.full;
        if (kind === 'impersonate') {
          const aborted = request.signal.aborted;
          if (!run.finished) finishGeneration(generationId, { status: aborted ? 'aborted' : 'error', promptTokens: options.promptTokens, completionTokens: estimateTokens(full), estimated: true, error: aborted ? null : String(error) });
          if (!run.settled) settleGeneration(userId, reserved, (run.connected && (full.trim() || aborted) ? pointsCost(options.promptTokens, estimateTokens(full), run.billedModel) : 0), ref);
          if (!aborted) run.send({ type: 'error', message: error instanceof Error ? error.message : options.errorMessage ?? '代写失败' });
          return;
        }
        // 中断或失败时，把已经生成的部分保存下来，并按实际 token 结算预扣
        const lost = !run.saved && options.recover ? options.recover(run, error) === true : false;
        const aborted = (error as Error)?.name === 'AbortError' || request.signal.aborted;
        if (!run.finished) finishGeneration(generationId, {
          model: run.billedModel,
          status: aborted ? 'aborted' : 'error',
          promptTokens: options.promptTokens,
          completionTokens: estimateTokens(full),
          estimated: true,
          error: aborted ? null : error instanceof Error ? error.message : String(error),
        });
        if (!run.settled) {
          // 部分结果没能写进去（消息已不存在）同样不扣
          run.settle(!lost && run.connected && (full.trim() || aborted) ? pointsCost(options.promptTokens, estimateTokens(full), run.billedModel) : 0);
        }
        if (run.donePayload) {
          // 回复已经保存，只是保存之后的步骤出错：照常告诉前端完成，错误记日志
          console.error('[generation] 回复已保存，后续步骤出错', error);
          run.send(run.donePayload);
        } else if (!aborted) run.send({ type: 'error', message: error instanceof Error ? error.message : options.errorMessage ?? '生成失败' });
      } finally {
        options.end?.();
        try {
          controller.close();
        } catch {
          // 已关闭
        }
      }
    },
  });

  const headers: Record<string, string> = {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
  };
  if (kind === 'reply') headers.Connection = 'keep-alive';
  return new Response(stream, { headers });
}
