"use strict";

const fs   = require("fs");
const path = require("path");

const LOG_FILE   = path.join(__dirname, "../data/security_log.json");
const AUDIT_FILE = path.join(__dirname, "../data/audit_log.json");
const MAX_ENTRIES = 5000;

function appendLog(file, entry) {
  try {
    let arr = [];
    try { arr = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
    if (!Array.isArray(arr)) arr = [];
    arr.push({ ...entry, ts: new Date().toISOString() });
    if (arr.length > MAX_ENTRIES) arr = arr.slice(-MAX_ENTRIES);
    fs.writeFileSync(file, JSON.stringify(arr, null, 2), "utf8");
  } catch {}
}

function logEvent(type, detail, ip) {
  appendLog(LOG_FILE, { type, detail, ip: ip || "unknown" });
}

function logAudit(userId, action, detail) {
  appendLog(AUDIT_FILE, { userId, action, detail });
}

function getIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

// Returns true and logs if the path looks like a traversal attempt
function checkPathTraversal(urlPath, ip) {
  if (urlPath.includes("..") || urlPath.includes("%2e") || urlPath.includes("%2f")) {
    logEvent("path_traversal", urlPath, ip);
    return true;
  }
  return false;
}

module.exports = { logEvent, logAudit, getIp, checkPathTraversal };
