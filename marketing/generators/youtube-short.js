const path = require('path');
const fs   = require('fs');
const { generate }       = require('../aiProvider');
const { buildUserMessage } = require('../promptBuilder');
const { parseAiJson, validateYouTubeShort } = require('../validators');

const PROMPT_PATH = path.join(__dirname, '../prompts/youtube-short.txt');
let _prompt;
function getPrompt() {
  if (!_prompt) _prompt = fs.readFileSync(PROMPT_PATH, 'utf8');
  return _prompt;
}

async function generateYouTubeShort({ business = {}, brand = {}, brief = {}, apiKey, model, provider = 'anthropic' }) {
  const raw = await generate({
    provider,
    apiKey,
    systemPrompt: getPrompt(),
    userMessage:  buildUserMessage(business, brand, brief),
    maxTokens:    3000,
    model:        model || 'claude-sonnet-4-6',
  });

  const result = parseAiJson(raw);
  if (!validateYouTubeShort(result)) {
    throw new Error('AI returned an invalid response for youtube_short. Please try again.');
  }
  return result;
}

module.exports = { generateYouTubeShort };
