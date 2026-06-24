import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

// AES-256-GCM envelope for a user's Zulip API key. We NEVER store the key in
// plaintext, never log it, and never return it to a client. The key-encryption
// key (KEK) comes from the dedicated env var ZULIP_KEY_SECRET (64 hex chars =
// 32 bytes). A per-record random 16-byte salt derives the actual AES key via
// scrypt, so two encryptions of the same plaintext produce different output.
//
// Stored format: base64( salt(16) || iv(12) || authTag(16) || ciphertext )

const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;

let cachedKek: Buffer | null = null;

/**
 * Resolve and validate the KEK lazily (fail-fast on first use). Throws if the
 * env var is missing or not exactly 64 hex chars.
 */
function getKek(): Buffer {
  if (cachedKek) return cachedKek;
  const raw = process.env.ZULIP_KEY_SECRET;
  if (!raw) {
    throw new Error("ZULIP_KEY_SECRET is not set (need 64 hex chars)");
  }
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error("ZULIP_KEY_SECRET must be exactly 64 hex characters (32 bytes)");
  }
  cachedKek = Buffer.from(raw, "hex");
  return cachedKek;
}

/** Encrypt a Zulip API key string; returns the base64 envelope. */
export function encryptZulipKey(apiKey: string): string {
  const kek = getKek();
  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(IV_LEN);
  const derived = scryptSync(kek, salt, 32);
  const cipher = createCipheriv("aes-256-gcm", derived, iv);
  const ciphertext = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([salt, iv, tag, ciphertext]).toString("base64");
}

/**
 * Decrypt a previously-encrypted Zulip API key. Throws on tamper / wrong key /
 * malformed input — callers should wrap in try/catch and treat any failure as
 * "not linked / re-link required".
 */
export function decryptZulipKey(envelope: string): string {
  const kek = getKek();
  const buf = Buffer.from(envelope, "base64");
  if (buf.length < SALT_LEN + IV_LEN + TAG_LEN) {
    throw new Error("zulip key envelope too short");
  }
  const salt = buf.subarray(0, SALT_LEN);
  const iv = buf.subarray(SALT_LEN, SALT_LEN + IV_LEN);
  const tag = buf.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + TAG_LEN);
  const ciphertext = buf.subarray(SALT_LEN + IV_LEN + TAG_LEN);
  const derived = scryptSync(kek, salt, 32);
  const decipher = createDecipheriv("aes-256-gcm", derived, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
