"use strict";

const crypto = require("crypto");

// AES-256-GCM — authenticated encryption (upgrade from CBC used for WP/SMTP)
// Key loaded from env var; falls back to same secret as encryptStr for consistency
const RAW_SECRET = process.env.WP_ENCRYPT_SECRET || "eureach-wp-secret-2026";
const KEY = crypto.createHash("sha256").update(RAW_SECRET).digest(); // 32 bytes

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a single base64 string: iv(12B) + tag(16B) + ciphertext, all concatenated.
 */
function encryptField(plaintext) {
  if (plaintext === null || plaintext === undefined) return null;
  const iv     = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const enc    = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag    = cipher.getAuthTag();
  // Format: base64( iv[12] | tag[16] | ciphertext )
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

/**
 * Decrypt a value produced by encryptField.
 * Returns the original plaintext string, or null on failure.
 */
function decryptField(stored) {
  if (!stored) return null;
  try {
    const buf      = Buffer.from(stored, "base64");
    const iv       = buf.slice(0, 12);
    const tag      = buf.slice(12, 28);
    const enc      = buf.slice(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
    decipher.setAuthTag(tag);
    return decipher.update(enc) + decipher.final("utf8");
  } catch {
    return null;
  }
}

module.exports = { encryptField, decryptField };
