import { describe, expect, it, vi } from "vitest";
import { sendFeedback, setFeedbackContext } from "@/lib/feedback";
import { readFileSync } from "node:fs";

describe("feedback form (build 37)", () => {
  it("sends the report to Web3Forms with the key, the build and the design counts - and no address of the owner", async () => {
    setFeedbackContext(() => ({ parts: 3 }));
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 }));
    await sendFeedback({ kind: "broken", tool: "Fillet", message: "It froze", email: "tester@example.com", error: "The walls cannot be this thick" }, fetcher as unknown as typeof fetch);
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.web3forms.com/submit");
    const body = JSON.parse(String(init.body));
    expect(body.access_key).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.subject).toContain("Broken tool: Fillet");
    expect(body.Message).toBe("It froze");
    expect(body["Error shown"]).toContain("walls");
    expect(body.email).toBe("tester@example.com");
    expect(body["Design: parts"]).toBe("3");
    expect(body.botcheck).toBe("");
    setFeedbackContext(null);
  });

  it("says when it could not be sent", async () => {
    const offline = vi.fn(async () => { throw new TypeError("network"); });
    await expect(sendFeedback({ kind: "other", tool: "", message: "x", email: "" }, offline as unknown as typeof fetch)).rejects.toThrow("offline");
    const refused = vi.fn(async () => new Response(JSON.stringify({ success: false, message: "Invalid" }), { status: 400 }));
    await expect(sendFeedback({ kind: "other", tool: "", message: "x", email: "" }, refused as unknown as typeof fetch)).rejects.toThrow("Invalid");
  });

  it("never has the owner's address anywhere in the app's code", () => {
    for (const file of ["apps/web/src/lib/feedback.ts", "apps/web/src/components/FeedbackDialog.tsx", "apps/web/src/lib/messages.en.ts"]) {
      expect(readFileSync(file, "utf8")).not.toContain("parepdf.app");
    }
  });
});
