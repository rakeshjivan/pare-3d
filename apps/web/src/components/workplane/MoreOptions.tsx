"use client";

import { useState, type ReactNode } from "react";
import { Minus, Plus } from "lucide-react";
import { t } from "@/lib/i18n";

/** Whether each window's "More options" was open when it was last left, so it opens the same way next time. */
const openBefore = new Map<string, boolean>();

/**
 * Fork (build 32): the fold that keeps a tool window short. The few controls a beginner needs stay
 * above it; the fine ones open below. `forceOpen` opens it at first when one of them is not at its
 * default, so nothing that changes the result starts out hidden.
 */
export function MoreOptions({ id, forceOpen = false, children }: { id: string; forceOpen?: boolean; children: ReactNode }) {
  const [shown, setOpenState] = useState(() => forceOpen || (openBefore.get(id) ?? false));
  const setOpen = (next: boolean) => {
    openBefore.set(id, next);
    setOpenState(next);
  };
  return (
    <>
      <button type="button" className="edge-more-toggle" aria-expanded={shown} onClick={() => setOpen(!shown)}>
        {shown ? <Minus size={15} /> : <Plus size={15} />}
        <span>{t("common.moreOptions")}</span>
      </button>
      {shown ? <div className="edge-more-options">{children}</div> : null}
    </>
  );
}
