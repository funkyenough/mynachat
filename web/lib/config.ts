// Server-side configuration read from env (.env.local). Never import from client components.

/**
 * World ID credentials. 4.0 credentials are verifiable credentials held in World App
 * (issuer schema IDs from IDKit); the *_legacy ones return World ID 3.0 proofs.
 */
export const WORLD_CREDENTIALS = {
  mnc: { v4: true, issuerSchemaId: 9310, label: "My Number Card" },
  proof_of_human: { v4: true, issuerSchemaId: 1, label: "Proof of human (Orb)" },
  passport: { v4: true, issuerSchemaId: 9303, label: "Passport" },
  orb_legacy: { v4: false, issuerSchemaId: null, label: "Orb (World ID 3.0)" },
  device_legacy: { v4: false, issuerSchemaId: null, label: "Device (World ID 3.0)" },
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
};

/** Enrollment sessions expire this long after creation. */
export const SESSION_TTL_MS = 30 * 60 * 1000;

export const joinAction = (groupId: string) => `join-${groupId}`;
