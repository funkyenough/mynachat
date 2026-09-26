// Server-side configuration read from env (.env.local). Never import from client components.

/**
 * World ID 4.0 credentials: verifiable credentials held in World App (issuer schema IDs
 * from IDKit).
 */
export const WORLD_CREDENTIALS = {
  mnc: { issuerSchemaId: 9310, label: "My Number Card" },
  proof_of_human: { issuerSchemaId: 1, label: "Proof of human (Orb)" },
  passport: { issuerSchemaId: 9303, label: "Passport" },
} as const;
export type WorldCredential = keyof typeof WORLD_CREDENTIALS;

function worldCredential(v: string | undefined): WorldCredential {
  return v && v in WORLD_CREDENTIALS ? (v as WorldCredential) : "mnc";
}

export const config = {
  appId: (process.env.WLD_APP_ID ?? "app_974a393b0e993fea57c82f67e67ab8fd") as `app_${string}`,
  rpId: process.env.WLD_RP_ID ?? "rp_4e87aa1d9faa8961",
  environment: (process.env.WLD_ENVIRONMENT ?? "staging") as "production" | "staging",
  /** World ID credential to require; see WORLD_CREDENTIALS. */
  credential: worldCredential(process.env.WLD_CREDENTIAL),
  verifierUrl: process.env.VERIFIER_URL ?? "ws://localhost:7047",
  devFakeMyna: process.env.DEV_FAKE_MYNA === "1",
  /** WebAuthn relying party: the site's domain and exact origin (scheme + host + port). */
  webauthnRpId: process.env.WEBAUTHN_RP_ID ?? "localhost",
  webauthnOrigin: process.env.WEBAUTHN_ORIGIN ?? "http://localhost:3000",
};

/** Enrollment sessions expire this long after creation. */
export const SESSION_TTL_MS = 30 * 60 * 1000;

/** Signup challenges (World ID step, passkey step) expire this long after creation. */
export const CHALLENGE_TTL_MS = 10 * 60 * 1000;

/** World ID actions. "account" gives one account per human; each poll gets its own action. */
// Uniqueness proofs are one-time per person and action, and actions are shared by every
// deployment on the same World ID app/RP. Prefix them per deployment (WLD_ACTION_PREFIX,
// e.g. "prod-" / "dev-") so local testing never spends a production proof.
const ACTION_PREFIX = process.env.WLD_ACTION_PREFIX ?? "";
export const ACCOUNT_ACTION = `${ACTION_PREFIX}account`;
export const pollAction = (pollId: number) => `${ACTION_PREFIX}poll-${pollId}`;

/** World ID settings passed to client components. */
export const worldConfig = {
  appId: config.appId,
  environment: config.environment,
  credential: config.credential,
  debug: process.env.WLD_DEBUG === "1",
};
