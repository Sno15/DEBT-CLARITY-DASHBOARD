'use strict';

// Unit tests for server/ai-assistant.js's pure logic — the FLAG-line parsing
// (the part most likely to break silently and mis-flag/mis-hide adviser
// follow-ups) and the outgoing request shape. Does not call the real
// Anthropic API — that needs a real key and costs real money, so it's not
// something to exercise automatically. See README for how to test the full
// chat flow manually once a real API key is configured.

process.env.ANTHROPIC_API_KEY = 'test-key-123';
delete require.cache[require.resolve('../server/ai-assistant')];
const assistant = require('../server/ai-assistant');

const checks = [];
const check = (name, cond) => checks.push({ name, pass: !!cond });

// --- splitReplyAndFlag ---
{
  const r = assistant.splitReplyAndFlag('Here is a normal reply.\nFLAG: none');
  check('flag:none is not flagged', r.flagged === false);
  check('flag:none has null topic', r.flagTopic === null);
  check('reply text excludes the FLAG line', r.reply === 'Here is a normal reply.');
}

{
  const r = assistant.splitReplyAndFlag('I cannot say which solution fits you.\nFLAG: eligibility question');
  check('flagged case sets flagged true', r.flagged === true);
  check('flagged case captures topic', r.flagTopic === 'eligibility question');
  check('flagged case strips FLAG line from reply', r.reply === 'I cannot say which solution fits you.');
}

{
  // Multi-line reply, flag on its own line at the end
  const r = assistant.splitReplyAndFlag('Line one.\nLine two.\n\nFLAG: distressed client');
  check('multi-line reply preserved', r.reply === 'Line one.\nLine two.');
  check('multi-line reply flagged correctly', r.flagged === true && r.flagTopic === 'distressed client');
}

{
  // Model forgot the FLAG line entirely — should fail safe (not flagged, full text kept)
  const r = assistant.splitReplyAndFlag('Just a plain reply with no flag line at all.');
  check('missing FLAG line does not crash', r.flagged === false && r.flagTopic === null);
  check('missing FLAG line keeps full reply text', r.reply === 'Just a plain reply with no flag line at all.');
}

{
  // Case-insensitivity and extra whitespace
  const r = assistant.splitReplyAndFlag('Reply text.\n  flag:   Needs Adviser Input  ');
  check('flag is case-insensitive and trims whitespace', r.flagged === true && r.flagTopic === 'Needs Adviser Input');
}

// --- buildRequest ---
{
  const { options, body } = assistant.buildRequest({
    system: 'system prompt text',
    messages: [{ role: 'user', content: 'hello' }],
  });
  const parsedBody = JSON.parse(body);
  check('request targets api.anthropic.com', options.hostname === 'api.anthropic.com');
  check('request targets /v1/messages', options.path === '/v1/messages');
  check('request is a POST', options.method === 'POST');
  check('request carries x-api-key header', options.headers['x-api-key'] === 'test-key-123');
  check('request carries anthropic-version header', options.headers['anthropic-version'] === '2023-06-01');
  check('request body includes the system prompt', parsedBody.system === 'system prompt text');
  check('request body includes the messages array', Array.isArray(parsedBody.messages) && parsedBody.messages[0].content === 'hello');
  check('request body defaults to the configured model', typeof parsedBody.model === 'string' && parsedBody.model.length > 0);
}

// --- isConfigured / not-configured fallback ---
{
  check('isConfigured() true when ANTHROPIC_API_KEY set', assistant.isConfigured() === true);
}

let allPass = true;
for (const c of checks) {
  console.log(`${c.pass ? 'PASS' : 'FAIL'} - ${c.name}`);
  if (!c.pass) allPass = false;
}

(async () => {
  // Not-configured fallback — exercise the real askAssistant() path without a key.
  delete process.env.ANTHROPIC_API_KEY;
  delete require.cache[require.resolve('../server/ai-assistant')];
  const unconfigured = require('../server/ai-assistant');
  const result = await unconfigured.askAssistant({ message: 'hi', history: [], context: { firstName: 'Jane', missingSections: [], solutionChosen: null, missingDocs: [] } });
  const ok = result.notConfigured === true && typeof result.reply === 'string' && result.reply.length > 0;
  console.log(`${ok ? 'PASS' : 'FAIL'} - askAssistant() fails gracefully with no API key configured`);
  if (!ok) allPass = false;

  if (!allPass) {
    console.error('\nSome ai-assistant.js tests FAILED');
    process.exit(1);
  }
  console.log('\nAll ai-assistant.js tests passed.');
})();
