"use client";

import { Download, X } from "lucide-react";
import { useEffect, useState } from "react";
import { checkPareUpdate, dismissPareUpdate, PARE_BUILD, type PareUpdate } from "@/lib/pareUpdate";

/** Fork: "A new Pare 3D is available" with a download link, until dismissed for that build. */
export function PareUpdateBanner() {
  const [update, setUpdate] = useState<PareUpdate | null>(null);
  useEffect(() => {
    let cancelled = false;
    void checkPareUpdate().then((result) => {
      if (!cancelled) setUpdate(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  if (!update) return null;
  return (
    <div className="pare-update-banner" role="status">
      <Download size={16} aria-hidden="true" />
      <span>
        Pare 3D build {update.build} is available (you have build {PARE_BUILD}).
      </span>
      <a href={update.url} target="_blank" rel="noreferrer">Download</a>
      <button type="button" aria-label="Dismiss" onClick={() => { dismissPareUpdate(update.build); setUpdate(null); }}>
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
