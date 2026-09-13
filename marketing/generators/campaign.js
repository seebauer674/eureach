const path = require('path');
const fs   = require('fs');
const { generate }         = require('../aiProvider');
const { buildUserMessage }  = require('../promptBuilder');
const { parseAiJson, validateCampaignStrategy } = require('../validators');

const PROMPT_PATH = path.join(__dirname, '../prompts/campaign.txt');
let _prompt;
function getPrompt() {
  if (!_prompt) _prompt = fs.readFileSync(PROMPT_PATH, 'utf8');
  return _prompt;
}

async function generateCampaignStrategy({ business = {}, brand = {}, brief = {}, apiKey, model, provider = 'anthropic' }) {
  const raw = await generate({
    provider,
    apiKey,
    systemPrompt: getPrompt(),
    userMessage:  buildUserMessage(business, brand, brief),
    maxTokens:    2500,
    model:        model || 'claude-sonnet-4-6',
  });

  const result = parseAiJson(raw);
  if (!validateCampaignStrategy(result)) {
    throw new Error('AI returned an invalid campaign strategy. Please try again.');
  }
  return result;
}

module.exports = { generateCampaignStrategy };
