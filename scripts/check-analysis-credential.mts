import { createSign, generateKeyPairSync, randomUUID } from "node:crypto";

import {
  CREDENTIAL_LIFETIME_SECONDS,
  signAnalysisCredential,
  signingKeyFromJwk,
  verifyAnalysisCredential,
  type SigningKey,
} from "../lib/analysis-jwt.ts";

const analysisId = "7f3a9c2e-4b18-4d6a-9c0e-1a2b3c4d5e6f";
const organizationId = "org_2abcDEF";
const now = 1_700_000_000;

const key = signingKeyFromJwk(privateJwk());
const token = signAnalysisCredential(key, { analysisId, organizationId }, now);
const opened = verifyAnalysisCredential(key, token, now + 30);
assert(opened?.analysisId === analysisId && opened.organizationId === organizationId, "round trip");

assert(verifyAnalysisCredential(key, token, now + CREDENTIAL_LIFETIME_SECONDS + 31) === null, "expired");
assert(verifyAnalysisCredential(key, token, now - 31) === null, "issued in the future");
assert(verifyAnalysisCredential(signingKeyFromJwk(privateJwk()), token, now) === null, "wrong key");
assert(verifyAnalysisCredential(key, token.slice(0, -4) + "aaaa", now) === null, "bad signature");
assert(verifyAnalysisCredential(key, "", now) === null, "empty");

const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");
const header = parseJson(encodedHeader);
if (!isRecord(header)) throw new Error("header was not an object");
header.alg = "none";
const noneToken = `${Buffer.from(JSON.stringify(header)).toString("base64url")}.${encodedPayload}.${encodedSignature}`;
assert(verifyAnalysisCredential(key, noneToken, now) === null, "alg none");

const payload = parseJson(encodedPayload);
if (!isRecord(payload)) throw new Error("payload was not an object");
payload.role = "service_role";
assert(verifyAnalysisCredential(key, resign(key, payload), now) === null, "service role");

payload.role = "authenticated";
payload.exp = now + CREDENTIAL_LIFETIME_SECONDS * 10;
assert(verifyAnalysisCredential(key, resign(key, payload), now) === null, "long lifetime");

console.log("ok");

function resign(signingKey: SigningKey, body: Record<string, unknown>): string {
  const mintedHeader = signAnalysisCredential(
    signingKey,
    { analysisId, organizationId },
    now,
  ).split(".")[0];
  const encoded = Buffer.from(JSON.stringify(body)).toString("base64url");
  const signingInput = `${mintedHeader}.${encoded}`;
  const signature = createSign("SHA256").update(signingInput).sign({
    key: signingKey.privateKey,
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${signature.toString("base64url")}`;
}

function privateJwk(): string {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = privateKey.export({ format: "jwk" });
  jwk.kid = randomUUID();
  jwk.alg = "ES256";
  return JSON.stringify(jwk);
}

function parseJson(encoded: string | undefined): unknown {
  return JSON.parse(Buffer.from(encoded ?? "", "base64url").toString("utf8"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assert(condition: boolean, label: string): void {
  if (!condition) throw new Error(`check failed: ${label}`);
}
