const path = require('path');
const fs   = require('fs');
const { generate }       = require('../aiProvider');
const { buildUserMessage } = require('../promptBuilder');
const { parseAiJson, validateTikTokScript } = require('../validators');

const PROMPT_PATH = path.join(__dirname, '../prompts/tiktok.txt');
let _prompt;
function getPrompt() {
  if (!_prompt) _prompt = fs.readFileSync(PROMPT_PATH, 'utf8');
  return _prompt;
}

async function generateTikTokScript({ business = {}, brand = {}, brief = {}, apiKey, model, provider = 'anthropic' }) {
  const raw = await generate({
    provider,
    apiKey,
    systemPrompt: getPrompt(),
    userMessage:  buildUserMessage(business, brand, brief),
    maxTokens:    3000,
    model:        model || 'claude-sonnet-4-6',
  });

  const result = parseAiJson(raw);
  if (!validateTikTokScript(result)) {
    throw new Error('AI returned an invalid response for tiktok. Please try again.');
  }
  return result;
}

module.exports = { generateTikTokScript };
