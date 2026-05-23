"use strict";

// Strip null bytes and HTML tags; truncate to maxLen
function sanitizeString(val, maxLen = 500) {
  if (typeof val !== "string") return "";
  return val.replace(/\0/g, "").replace(/<[^>]*>/g, "").slice(0, maxLen).trim();
}

// Normalize email, strip CR/LF (prevents SMTP header injection), enforce length
function sanitizeEmail(val, maxLen = 254) {
  if (typeof val !== "string") return "";
  return val.replace(/[\r\n\0]/g, "").slice(0, maxLen).trim().toLowerCase();
}

// Ensure URL starts with http(s) and is parseable; strip credentials
function sanitizeUrl(val, maxLen = 2000) {
  if (typeof val !== "string") return "";
  const trimmed = val.slice(0, maxLen).trim();
  try {
    const u = new URL(trimmed.startsWith("http") ? trimmed : "https://" + trimmed);
    u.username = "";
    u.password = "";
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    return u.toString();
  } catch {
    return "";
  }
}

function sanitizeInteger(val, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = parseInt(val, 10);
  if (isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

// Returns true if hostname resolves to a private/loopback range
// Used to block SSRF in WP connect and SMTP connect
function isPrivateHost(hostname) {
  // Strip port if present
  const host = hostname.split(":")[0].toLowerCase().trim();

  // Block loopback / localhost
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;

  // Block link-local, RFC1918, APIPA, metadata services
  const privateRanges = [
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^169\.254\./,        // AWS/GCP metadata link-local
    /^100\.64\./,         // CGNAT
    /^0\./,
    /^127\./,
    /^::1$/,
    /^fc00:/i,
    /^fe80:/i,
  ];
  return privateRanges.some(re => re.test(host));
}

module.exports = { sanitizeString, sanitizeEmail, sanitizeUrl, sanitizeInteger, isPrivateHost };
