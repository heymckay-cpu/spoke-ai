import { describe, expect, it } from "vitest";
import { parseAttachments } from "./agent";

describe("parseAttachments", () => {
  it("returns the original text when there are no attachment fences", () => {
    const out = parseAttachments("Just a prose answer with **bold** text.");
    expect(out.attachments).toEqual([]);
    expect(out.stripped).toBe("Just a prose answer with **bold** text.");
  });

  it("extracts a single well-formed table attachment and strips its fence", () => {
    const text = `Here are your worst trades:\n\n\`\`\`attachment\n${JSON.stringify(
      {
        type: "table",
        title: "Worst trades",
        columns: [
          { key: "ticker", label: "Ticker" },
          { key: "pnl", label: "P/L", align: "right" },
        ],
        rows: [{ ticker: "PLTR", pnl: -432.1 }],
        deepLinkColumn: "ticker",
      },
    )}\n\`\`\`\n\nLet me know if you want to filter further.`;
    const out = parseAttachments(text);
    expect(out.attachments).toHaveLength(1);
    expect(out.attachments[0].title).toBe("Worst trades");
    expect(out.attachments[0].rows[0]).toEqual({ ticker: "PLTR", pnl: -432.1 });
    expect(out.stripped).toContain("Here are your worst trades");
    expect(out.stripped).toContain("filter further");
    expect(out.stripped).not.toContain("```attachment");
  });

  it("leaves malformed fences untouched so the user still sees the raw text", () => {
    const text = "broken:\n```attachment\n{not json}\n```";
    const out = parseAttachments(text);
    expect(out.attachments).toEqual([]);
    expect(out.stripped).toContain("```attachment");
  });

  it("skips fences whose body is not a table-shaped object", () => {
    const text = `\`\`\`attachment\n${JSON.stringify({ type: "chart", foo: 1 })}\n\`\`\``;
    const out = parseAttachments(text);
    expect(out.attachments).toEqual([]);
  });

  it("extracts multiple attachments in order", () => {
    const a = JSON.stringify({ type: "table", title: "A", columns: [], rows: [] });
    const b = JSON.stringify({ type: "table", title: "B", columns: [], rows: [] });
    const text = `intro\n\n\`\`\`attachment\n${a}\n\`\`\`\n\nmid\n\n\`\`\`attachment\n${b}\n\`\`\``;
    const out = parseAttachments(text);
    expect(out.attachments.map((x) => x.title)).toEqual(["A", "B"]);
  });
});
