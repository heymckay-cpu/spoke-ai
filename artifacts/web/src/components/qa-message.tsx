import type { QaMessage } from "@workspace/api-client-react";
import { QaAttachmentTable } from "@/components/qa-attachment-table";
import { cn } from "@/lib/utils";

// Render a single chat bubble — user vs assistant. The assistant body keeps
// markdown extremely light (paragraph + line-break + simple lists) since the
// real heavy lifting lives in `attachments`.

interface QaMessageBubbleProps {
  message: QaMessage;
}

function renderInline(text: string): React.ReactNode {
  // Bold: **x**, code: `x`. Anything else passes through. We deliberately do
  // not pull in a full markdown lib — keeps the bundle small.
  const parts: React.ReactNode[] = [];
  let i = 0;
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let m: RegExpExecArray | null;
  let last = 0;
  while ((m = re.exec(text)) != null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) {
      parts.push(
        <strong key={i++} className="font-semibold">
          {tok.slice(2, -2)}
        </strong>,
      );
    } else {
      parts.push(
        <code key={i++} className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
          {tok.slice(1, -1)}
        </code>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function renderBody(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let listBuf: string[] = [];
  let key = 0;
  const flushList = () => {
    if (listBuf.length === 0) return;
    blocks.push(
      <ul key={key++} className="my-1 ml-5 list-disc space-y-0.5">
        {listBuf.map((l, i) => (
          <li key={i}>{renderInline(l)}</li>
        ))}
      </ul>,
    );
    listBuf = [];
  };
  let paraBuf: string[] = [];
  const flushPara = () => {
    if (paraBuf.length === 0) return;
    blocks.push(
      <p key={key++} className="whitespace-pre-wrap leading-relaxed">
        {renderInline(paraBuf.join("\n"))}
      </p>,
    );
    paraBuf = [];
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^\s*[-*]\s+/.test(line)) {
      flushPara();
      listBuf.push(line.replace(/^\s*[-*]\s+/, ""));
    } else if (line === "") {
      flushList();
      flushPara();
    } else {
      flushList();
      paraBuf.push(line);
    }
  }
  flushList();
  flushPara();
  return blocks;
}

export function QaMessageBubble({ message }: QaMessageBubbleProps) {
  const isUser = message.role === "user";
  return (
    <div
      className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}
      data-testid={`qa-message-${message.role}`}
    >
      <div
        className={cn(
          "max-w-[90%] rounded-lg px-4 py-3 text-sm shadow-sm",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-card text-card-foreground border border-border",
        )}
      >
        <div className="space-y-2">{renderBody(message.content)}</div>
        {!isUser && message.attachments?.length > 0 && (
          <div>
            {message.attachments.map((att, i) => (
              <QaAttachmentTable key={i} attachment={att} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
