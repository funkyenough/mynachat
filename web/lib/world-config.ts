import type { WorldCredential } from "./config";

/** The World ID settings client components need; built on the server from `config`. */
export type WorldConfig = {
  appId: `app_${string}`;
  environment: "production" | "staging";
  credential: WorldCredential;
};
