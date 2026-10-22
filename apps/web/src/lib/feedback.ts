/**
 * Fork (build 37): "Report a problem or suggest something". The form is sent through Web3Forms,
 * which forwards it by email to the address the access key was made for - that address is never
 * in the app or its code, only the key, and the key can do nothing but send such messages.
 */
import { PARE_BUILD } from "@/lib/pareUpdate";

const WEB3FORMS_ENDPOINT = "https://api.web3forms.com/submit";
const WEB3FORMS_ACCESS_KEY = "812ae5c6-1ca9-4fb0-bef6-cdd10ba91979";

export const OPEN_FEEDBACK_EVENT = "pare3d:feedback";

export type FeedbackKind = "broken" | "suggestion" | "other";

export type FeedbackRequest = {
  kind?: FeedbackKind;
  tool?: string;
  /** An error message the person saw, sent along with the report. */
  error?: string;
};

/** Opens the feedback form, filled in as far as `request` goes. */
export function openFeedback(request: FeedbackRequest = {}) {
  window.dispatchEvent(new CustomEvent<FeedbackRequest>(OPEN_FEEDBACK_EVENT, { detail: request }));
}

/** What the editor can say about the design without sending any of it: counts, never contents. */
type FeedbackContext = () => Record<string, string | number>;
let contextSource: FeedbackContext | null = null;
export function setFeedbackContext(source: FeedbackContext | null) {
  contextSource = source;
}

/** The app, its build and the system it runs on. */
export function feedbackEnvironment(): Record<string, string> {
  const nav = typeof navigator === "undefined" ? null : navigator;
  const ua = nav?.userAgent ?? "";
  const system = /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : "unknown";
  const host = typeof window === "undefined" ? "" : window.location.hostname;
  const app = ["localhost", "127.0.0.1", "[::1]"].includes(host) ? "desktop app" : "web";
  return {
    build: String(PARE_BUILD || "dev"),
    system,
    app,
    screen: typeof window === "undefined" ? "" : `${window.innerWidth}x${window.innerHeight}`,
    browser: ua.slice(0, 200),
  };
}

const KIND_LABEL: Record<FeedbackKind, string> = { broken: "Broken tool", suggestion: "Suggestion", other: "Other" };

export type FeedbackForm = { kind: FeedbackKind; tool: string; message: string; email: string; error?: string };

/** Sends the form; resolves when Web3Forms has taken it, throws with a short reason otherwise. */
export async function sendFeedback(form: FeedbackForm, fetcher: typeof fetch = fetch): Promise<void> {
  const environment = feedbackEnvironment();
  let design: Record<string, string | number> = {};
  try {
    design = contextSource?.() ?? {};
  } catch {
    design = {};
  }
  const subject = `Pare 3D ${KIND_LABEL[form.kind]}${form.tool ? `: ${form.tool}` : ""} (build ${environment.build})`;
  const body: Record<string, string> = {
    access_key: WEB3FORMS_ACCESS_KEY,
    subject,
    from_name: "Pare 3D feedback",
    Type: KIND_LABEL[form.kind],
    Tool: form.tool || "-",
    Message: form.message,
    ...(form.error ? { "Error shown": form.error } : {}),
    "Reply to": form.email || "(no email given)",
    Build: environment.build,
    System: `${environment.system}, ${environment.app}, ${environment.screen}`,
    Browser: environment.browser,
    ...Object.fromEntries(Object.entries(design).map(([key, value]) => [`Design: ${key}`, String(value)])),
    // Web3Forms' spam trap: a real person leaves it empty.
    botcheck: "",
  };
  // Web3Forms sends replies to the "email" field when there is one.
  if (form.email) body.email = form.email;
  let response: Response;
  try {
    response = await fetcher(WEB3FORMS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("offline");
  }
  const answer = (await response.json().catch(() => ({}))) as { success?: boolean; message?: string };
  if (!response.ok || answer.success === false) throw new Error(answer.message || `status ${response.status}`);
}
