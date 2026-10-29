'use strict';
const fs   = require('fs');
const path = require('path');

const LIMIT_FILE  = path.join(__dirname, '..', 'data', 'email-daily-count.json');
const DAILY_LIMIT = parseInt(process.env.DAILY_EMAIL_LIMIT || '50');

function today() {
  return new Date().toISOString().slice(0, 10);
}

function readState() {
  try {
    const s = JSON.parse(fs.readFileSync(LIMIT_FILE, 'utf8'));
    if (s.date === today()) return s;
  } catch {}
  return { date: today(), count: 0 };
}

function writeState(state) {
  fs.writeFileSync(LIMIT_FILE, JSON.stringify(state));
}

function checkAndIncrement() {
  const state = readState();
  if (state.count >= DAILY_LIMIT) {
    console.warn('[email-limit] Daily limit of ' + DAILY_LIMIT + ' reached (' + state.count + ' sent today). Email blocked.');
    return false;
  }
  state.count++;
  writeState(state);
  return true;
}

function todayCount() {
  return readState().count;
}

module.exports = { checkAndIncrement, todayCount, DAILY_LIMIT };
