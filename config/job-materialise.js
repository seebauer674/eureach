'use strict';
const crypto = require('crypto');

function generateId() {
  return crypto.randomBytes(12).toString('hex');
}

function isoWeek(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

function jobFiresOn(job, date) {
  const dow = date.getDay() || 7; // JS: 0=Sun, convert to 1=Mon..7=Sun
  if (dow !== job.weekday) return false;
  if (job.frequency === 'weekly') return true;
  if (job.frequency === 'biweekly') return isoWeek(date) % 2 === 0;
  if (job.frequency === 'monthly') return date.getDate() <= 7;
  return false;
}

function dateStr(d) {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function materialiseDays(userId, days, sitesData, recurringData, instancesData) {
  const userSiteIds = new Set(
    sitesData
      .filter(s => s.user_id === userId && !s.archived_at)
      .map(s => s.id)
  );
  const activeJobs = recurringData.filter(j => userSiteIds.has(j.site_id) && j.active !== false);
  const existingKeys = new Set(
    instancesData
      .filter(i => i.recurring_job_id)
      .map(i => `${i.recurring_job_id}|${i.due_date}`)
  );

  const toInsert = [];
  for (const day of days) {
    const ds = dateStr(day);
    for (const job of activeJobs) {
      if (!jobFiresOn(job, day)) continue;
      const key = `${job.id}|${ds}`;
      if (existingKeys.has(key)) continue;
      existingKeys.add(key); // prevent duplicates within this call
      toInsert.push({
        id: generateId(),
        user_id: userId,
        site_id: job.site_id,
        recurring_job_id: job.id,
        due_date: ds,
        title: job.title,
        channel: job.channel,
        job_type: job.job_type,
        est_minutes: job.est_minutes || 30,
        status: 'pending',
        completed_at: null,
        notes: null,
        action_payload: null,
        created_at: new Date().toISOString(),
      });
    }
  }
  return toInsert;
}

module.exports = { isoWeek, jobFiresOn, materialiseDays, dateStr };
