// Server-side configuration read from env (.env.local). Never import from client components.

export const config = {
  appId: (process.env.WLD_APP_ID ?? "app_974a393b0e993fea57c82f67e67ab8fd") as `app_${string}`,
  rpId: process.env.WLD_RP_ID ?? "rp_4e87aa1d9faa8961",
  environment: (process.env.WLD_ENVIRONMENT ?? "staging") as "production" | "staging",
  /** World ID level: "orb" (Orb-verified) or "device" (World App on a phone, no Orb needed). */
  verification: (process.env.WLD_VERIFICATION === "device" ? "device" : "orb") as "orb" | "device",
  verifierUrl: process.env.VERIFIER_URL ?? "ws://localhost:7047",
  devFakeMyna: process.env.DEV_FAKE_MYNA === "1",
};

/** Enrollment sessions expire this long after creation. */
export const SESSION_TTL_MS = 30 * 60 * 1000;

export const joinAction = (groupId: string) => `join-${groupId}`;
