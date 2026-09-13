const path = require('path');
const fs   = require('fs');
const { generate }     = require('../aiProvider');
const { parseAiJson }  = require('../validators');

const PROMPT_PATH = path.join(__dirname, '../prompts/article-to-campaign.txt');
let _prompt;
function getPrompt() {
  if (!_prompt) _prompt = fs.readFileSync(PROMPT_PATH, 'utf8');
  return _prompt;
}

function validateArticleToCampaign(obj) {
  return obj && typeof obj === 'object' &&
    typeof obj.article_subject === 'string' &&
    typeof obj.marketing_opportunity === 'string';
}

async function generateArticleToCampaign({ article = '', title = '', brief = {}, apiKey, model, provider = 'anthropic' }) {
  const parts = [
    '=== ARTICLE TITLE ===',
    title || '(no title)',
    '',
    '=== ARTICLE CONTENT ===',
    article,
    '',
    '=== CAMPAIGN BRIEF (if any) ===',
  ];
  if (brief.instructions) parts.push('Additional instructions: ' + brief.instructions);
  if (brief.language)     parts.push('Output language: ' + brief.language);
  const userMessage = parts.join('\n');

  const raw = await generate({
    provider,
    apiKey,
    systemPrompt: getPrompt(),
    userMessage,
    maxTokens:    2200,
    model:        model || 'claude-sonnet-4-6',
  });

  const result = parseAiJson(raw);
  if (!validateArticleToCampaign(result)) {
    throw new Error('AI returned an invalid article-to-campaign result. Please try again.');
  }
  return result;
}

module.exports = { generateArticleToCampaign };
