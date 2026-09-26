// Discoverable-credential login: the browser offers the passkeys it has for this site.
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { randomId } from "@/lib/auth";
import { config } from "@/lib/config";
import { json } from "@/lib/http";
import { saveChallenge } from "@/lib/signups";

export async function POST() {
  const options = await generateAuthenticationOptions({ rpID: config.webauthnRpId, userVerification: "preferred" });
  const challengeId = randomId();
  await saveChallenge(challengeId, "login", options.challenge, {});
  return json({ challengeId, options });
}
