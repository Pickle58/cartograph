import {
  createPrivateKey,
  createPublicKey,
  createSign,
  createVerify,
  type KeyObject,
} from "node:crypto";

// Ten minutes. Long enough for a question's tool calls, short enough that a
// leaked token stops working while the conversation is still the point.
export const CREDENTIAL_LIFETIME_SECONDS = 10 * 60;

const CLOCK_SKEW_SECONDS = 30;
const MAX_TOKEN_LENGTH = 4096;

const ANALYSIS_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORGANIZATION_ID = /^org_[A-Za-z0-9]+$/;

export type AnalysisCredential = {
  analysisId: string;
  organizationId: string;
};

export type SigningKey = {
  kid: string;
  privateKey: KeyObject;
  publicKey: KeyObject;
};

// The private key stays on this server. Supabase verifies tokens signed with
// it, and row-level security limits each token to one analysis. The key could
// sign a broader token; this module never does.
export function signingKeyFromJwk(jwkJson: string): SigningKey {
  const parsed: unknown = JSON.parse(jwkJson);
  if (!isRecord(parsed)) {
    throw new Error("ANALYSIS_SIGNING_JWK is not a JSON object.");
  }
  const kid = parsed.kid;
  const kty = parsed.kty;
  const crv = parsed.crv;
  const d = parsed.d;
  const x = parsed.x;
  const y = parsed.y;
  if (
    kty !== "EC" ||
    crv !== "P-256" ||
    typeof kid !== "string" ||
    !ANALYSIS_ID.test(kid) ||
    typeof d !== "string" ||
    typeof x !== "string" ||
    typeof y !== "string"
  ) {
    throw new Error("ANALYSIS_SIGNING_JWK must be a P-256 private key with a UUID kid.");
  }
  if (parsed.alg !== undefined && parsed.alg !== "ES256") {
    throw new Error("ANALYSIS_SIGNING_JWK alg must be ES256.");
  }

  // Node's JWK type and the DOM JWK type disagree on `kid`. The object is the
  // private key we just validated.
  const jwk = { kty: "EC", crv: "P-256", kid, d, x, y, alg: "ES256" };
  const privateKey = createPrivateKey({ format: "jwk", key: jwk });
  return { kid, privateKey, publicKey: createPublicKey(privateKey) };
}

export function signAnalysisCredential(
  key: SigningKey,
  credential: AnalysisCredential,
  nowSeconds: number,
): string {
  if (!ANALYSIS_ID.test(credential.analysisId) || !ORGANIZATION_ID.test(credential.organizationId)) {
    throw new Error("Analysis credential claims are not valid.");
  }
  const issuedAt = Math.floor(nowSeconds);
  const header = base64url(JSON.stringify({ alg: "ES256", kid: key.kid, typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      role: "authenticated",
      iat: issuedAt,
      exp: issuedAt + CREDENTIAL_LIFETIME_SECONDS,
      analysis_id: credential.analysisId,
      o: { id: credential.organizationId },
    }),
  );
  const signingInput = `${header}.${payload}`;
  const signature = createSign("SHA256").update(signingInput).sign({
    key: key.privateKey,
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${base64url(signature)}`;
}

export function verifyAnalysisCredential(
  key: SigningKey,
  token: string,
  nowSeconds: number,
): AnalysisCredential | null {
  if (token.length === 0 || token.length > MAX_TOKEN_LENGTH) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  if (
    encodedHeader === undefined ||
    encodedPayload === undefined ||
    encodedSignature === undefined ||
    encodedHeader.length === 0 ||
    encodedPayload.length === 0 ||
    encodedSignature.length === 0
  ) {
    return null;
  }

  let header: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8"));
    if (!isRecord(parsed)) return null;
    header = parsed;
  } catch {
    return null;
  }
  // The algorithm comes from the header, which the signer controls. Only
  // ES256 with this server's key is accepted, so `none` and HMAC cannot pass.
  if (header.alg !== "ES256" || header.kid !== key.kid || header.typ !== "JWT") return null;

  const signingInput = `${encodedHeader}.${encodedPayload}`;
  let signature: Buffer;
  try {
    signature = Buffer.from(encodedSignature, "base64url");
  } catch {
    return null;
  }
  const valid = createVerify("SHA256").update(signingInput).verify(
    { key: key.publicKey, dsaEncoding: "ieee-p1363" },
    signature,
  );
  if (!valid) return null;

  let payload: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    if (!isRecord(parsed)) return null;
    payload = parsed;
  } catch {
    return null;
  }
  if (payload.role !== "authenticated") return null;
  if (typeof payload.analysis_id !== "string" || !ANALYSIS_ID.test(payload.analysis_id)) return null;
  if (!isRecord(payload.o) || typeof payload.o.id !== "string" || !ORGANIZATION_ID.test(payload.o.id)) {
    return null;
  }
  if (typeof payload.iat !== "number" || typeof payload.exp !== "number") return null;
  if (!Number.isInteger(payload.iat) || !Number.isInteger(payload.exp)) return null;

  const now = Math.floor(nowSeconds);
  if (payload.iat > now + CLOCK_SKEW_SECONDS) return null;
  if (payload.exp <= now - CLOCK_SKEW_SECONDS) return null;
  if (payload.exp - payload.iat > CREDENTIAL_LIFETIME_SECONDS + CLOCK_SKEW_SECONDS) return null;
  if (typeof payload.nbf === "number" && payload.nbf > now + CLOCK_SKEW_SECONDS) return null;

  return { analysisId: payload.analysis_id, organizationId: payload.o.id };
}

function base64url(value: string | Buffer): string {
  const buffer = typeof value === "string" ? Buffer.from(value) : value;
  return buffer.toString("base64url");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
