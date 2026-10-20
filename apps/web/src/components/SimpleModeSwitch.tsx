"use client";

import { useEffect, useState } from "react";

/**
 * Fork: Simple mode hides the advanced tools (sketching, patterns, faces,
 * hollowing and the like) for beginners. Remembered in this browser; the
 * stylesheet (fork.css) does the hiding through html[data-simple="on"].
 */
const STORAGE_KEY = "pare3d.simpleMode";

export function readSimpleMode(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

export function applySimpleMode(on: boolean) {
  if (on) document.documentElement.dataset.simple = "on";
  else delete document.documentElement.dataset.simple;
}

export function SimpleModeSwitch() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const stored = readSimpleMode();
    setOn(stored);
    applySimpleMode(stored);
  }, []);
  const toggle = () => {
    const next = !on;
    setOn(next);
    applySimpleMode(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
    } catch {
      // Still applies for this visit.
    }
  };
  return (
    <button
      type="button"
      className={`simple-mode-switch${on ? " active" : ""}`}
      role="switch"
      aria-checked={on}
      title={on ? "Simple mode is on: advanced tools are hidden" : "Hide advanced tools"}
      onClick={toggle}
    >
      <span className="simple-mode-track" aria-hidden="true"><span className="simple-mode-thumb" /></span>
      <span>Simple</span>
    </button>
  );
}
