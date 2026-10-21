"use client";

import { Box, KeyRound, Smartphone } from "lucide-react";
import { t } from "@/lib/i18n";
import { STARTER_IDS, type StarterId } from "@/lib/starterDesigns";

const ICONS = { box: Box, keyring: KeyRound, stand: Smartphone } as const;
const HINTS = { box: "starter.boxHint", keyring: "starter.keyringHint", stand: "starter.standHint" } as const satisfies Record<StarterId, string>;

/** Fork (build 17): three examples to open, change and print, on the home screen. */
export function StarterDesigns({ onStarter }: { onStarter: (id: StarterId) => void }) {
  return (
    <section className="starter-designs" aria-label={t("starter.title")}>
      <div className="starter-designs-heading">
        <strong>{t("starter.title")}</strong>
        <span>{t("starter.hint")}</span>
      </div>
      <div className="starter-designs-list">
        {STARTER_IDS.map((id) => {
          const Icon = ICONS[id];
          return (
            <button key={id} type="button" className="starter-design" data-starter={id} onClick={() => onStarter(id)}>
              <Icon size={26} aria-hidden="true" />
              <span><strong>{t(`starter.${id}`)}</strong><small>{t(HINTS[id])}</small></span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
