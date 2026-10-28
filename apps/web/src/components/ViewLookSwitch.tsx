"use client";

import { Grid3x3, Moon, Square } from "lucide-react";
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { readViewLook, storeViewLook, type ViewLook } from "@/lib/viewLook";

/** Build 85: the three-way switch for the view's look, beside Simple mode. */
export function ViewLookSwitch() {
  const [look, setLook] = useState<ViewLook>("plate");
  useEffect(() => { setLook(readViewLook()); }, []);
  const choose = (next: ViewLook) => {
    setLook(next);
    storeViewLook(next);
    window.layerlingViewLook?.(next);
  };
  const options: Array<{ value: ViewLook; label: string; icon: typeof Grid3x3 }> = [
    { value: "plate", label: t("view.look.plate"), icon: Grid3x3 },
    { value: "clear", label: t("view.look.clear"), icon: Square },
    { value: "dark", label: t("view.look.dark"), icon: Moon },
  ];
  return (
    <div className="view-look-switch" role="radiogroup" aria-label={t("view.look")} title={t("view.look")}>
      {options.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={look === value}
          className={look === value ? "active" : undefined}
          title={label}
          aria-label={label}
          data-view-look={value}
          onClick={() => choose(value)}
        >
          <Icon aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
