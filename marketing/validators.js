function parseAiJson(text) {
  if (!text) return null;
  let s = text.trim();
  s = s.replace(/^```json\s*/m, '').replace(/^```\s*/m, '').replace(/```\s*$/m, '').trim();
  try { return JSON.parse(s); } catch {}
  const m = s.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (m) { try { return JSON.parse(m[1]); } catch {} }
  return null;
}

function validateFacebookPost(obj) {
  return obj && typeof obj === 'object' &&
    typeof obj.hook === 'string' &&
    typeof obj.primary_text === 'string';
}

function validateInstagramPost(obj) {
  return obj && typeof obj === 'object' &&
    typeof obj.caption === 'string';
}

function validateTikTokScript(obj) {
  return obj && typeof obj === 'object' &&
    (typeof obj.hook === 'string' || typeof obj.title === 'string');
}

function validateLinkedInPost(obj) {
  return obj && typeof obj === 'object' &&
    (typeof obj.hook === 'string' || typeof obj.body === 'string' || typeof obj.caption === 'string');
}

function validateMetaAd(obj) {
  return obj && typeof obj === 'object' &&
    (Array.isArray(obj.primary_texts) || Array.isArray(obj.hooks) || typeof obj.primary_text === 'string');
}

function validateGoogleAd(obj) {
  return obj && typeof obj === 'object' &&
    (Array.isArray(obj.headlines) || Array.isArray(obj.descriptions));
}

function validateYouTubeShort(obj) {
  return obj && typeof obj === 'object' &&
    (typeof obj.hook === 'string' || typeof obj.title === 'string');
}

function validateVideoScript(obj) {
  return obj && typeof obj === 'object' &&
    (typeof obj.hook === 'string' || typeof obj.cta === 'string');
}

function validateImageConcept(obj) {
  return obj && typeof obj === 'object' &&
    (Array.isArray(obj.concepts) || typeof obj.description === 'string' || typeof obj.ai_prompt === 'string');
}

function validateCampaignStrategy(obj) {
  return obj && typeof obj === 'object' &&
    typeof obj.campaign_name === 'string';
}

module.exports = {
  parseAiJson,
  validateFacebookPost,
  validateInstagramPost,
  validateTikTokScript,
  validateLinkedInPost,
  validateMetaAd,
  validateGoogleAd,
  validateYouTubeShort,
  validateVideoScript,
  validateImageConcept,
  validateCampaignStrategy,
};
