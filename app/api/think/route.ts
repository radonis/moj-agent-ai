import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  isStepCount,
} from "ai";
import {
  ChatMode,
  ChatModel,
  generateWithModelFallback,
  RequestBody,
  thinkPrompt,
} from "../../lib/agent";

export const runtime = "nodejs";
const maxSteps = 3;

export async function POST(req: Request) {
  const body = (await req.json()) as RequestBody;
  const mode: ChatMode = body.mode === "ekspert" || body.mode === "kreatywny" ? body.mode : "casual";
  const model: ChatModel = body.model === "pro" ? "pro" : "flash";

  const modelMessages = await convertToModelMessages(body.messages);
  const { result, resolvedModel } = await generateWithModelFallback({
    messages: modelMessages,
    system: thinkPrompt,
    model,
    stopWhen: isStepCount(maxSteps),
  });

  const textId = `text-${Date.now()}`;
  const stream = createUIMessageStream({
    originalMessages: body.messages,
    execute: ({ writer }) => {
      writer.write({
        type: "start",
        messageMetadata: {
          mode,
          model,
          resolvedModel,
        },
      });
      writer.write({ type: "text-start", id: textId });
      writer.write({ type: "text-delta", id: textId, delta: result.text });
      writer.write({ type: "text-end", id: textId });
      writer.write({
        type: "finish",
        finishReason: result.finishReason,
        messageMetadata: {
          mode,
          model,
          resolvedModel,
        },
      });
    },
  });

  return createUIMessageStreamResponse({ stream });
}
