import { describe, expect, it } from "vitest";

describe("handle style switch (build 99)", () => {
  it("starts as the box, switches to the gimbal and remembers it", async () => {
    const store = new Map<string, string>();
    const listeners: Array<() => void> = [];
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } },
      addEventListener: (_: string, fn: () => void) => { listeners.push(fn); },
      removeEventListener: () => {},
      dispatchEvent: () => { listeners.forEach((fn) => fn()); return true; },
    };
    const { handleStyle, setHandleStyle, readHandleStyle } = await import("@/lib/handleStyle");
    expect(handleStyle()).toBe("box");
    let heard = 0;
    (globalThis as unknown as { window: { addEventListener: (e: string, f: () => void) => void } }).window.addEventListener("x", () => { heard += 1; });
    setHandleStyle("gimbal");
    expect(handleStyle()).toBe("gimbal");
    expect(readHandleStyle()).toBe("gimbal");
    expect(heard).toBe(1);
  });
});
