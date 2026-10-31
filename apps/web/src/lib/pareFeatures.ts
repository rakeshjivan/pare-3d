/**
 * Build 80: features still in development, built into test builds only. A feature is on when its
 * NEXT_PUBLIC_PARE_<NAME> variable is "on" at build time (the native-preview release branch sets
 * it; the live release leaves it off).
 */

/** Dental Studio's digital wax-up (build 79) and Wax-up Studio (build 94), being developed further in test builds. */
export const WAXUP_ENABLED = process.env.NEXT_PUBLIC_PARE_WAXUP === "on";
/** Build 106: Wax-up Studio and Model Builder in the new studio frame - test builds only until it is signed off. */
export const STUDIO_SHELL = WAXUP_ENABLED;
