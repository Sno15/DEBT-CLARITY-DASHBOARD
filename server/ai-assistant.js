'use strict';

// Client-facing assistant — a small wrapper around Anthropic's Messages API,
// called over plain HTTPS with Node's built-in `https` module (no SDK/npm
// package needed, consistent with the rest of this app's zero-dependency
// approach).
//
// Configure via environment variables:
//   ANTHROPIC_API_KEY   your API key from console.anthropic.com — required
//   ANTHROPIC_MODEL     defaults to a fast, low-cost model if not set
//
// If ANTHROPIC_API_KEY isn't set, askAssistant() returns a clear "not set up
// yet" reply instead of erroring, same pattern as server/mailer.js.

const https = require('https');
const path = require('path');
const { SOLUTIONS } = require(path.join(__dirname, '..', 'public', 'js', 'config.js'));
const { FIRM_NAME } = require('./firm-config');

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const API_HOST = 'api.anthropic.com';
const API_PATH = '/v1/messages';
const MAX_TOKENS = 600;

function isConfigured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

// Everything the assistant is and isn't allowed to do — see
// claude/client-chatbot-sketch.md for the design this was agreed from. This
// is a system prompt, not a hard guarantee: it steers the model reliably in
// practice, but isn't a substitute for occasionally reading real transcripts
// (visible to advisers via the case notes it flags) to check it's behaving.
function buildSystemPrompt(context) {
  const solutionLines = SOLUTIONS.map((s) => `- ${s.name}: ${s.desc}`).join('\n');
  const { firstName, completion, requiredDocumentTypes, solutionChosen, missingSections, missingDocs } = context;

  return `You are a helpful assistant embedded in ${FIRM_NAME}'s Debt Clarity client dashboard, talking with a client named ${firstName || 'the client'}.

What you help with:
- Explaining what a field or section of the dashboard is asking for.
- Explaining general, non-personalised information about debt solutions (see below) — never which one fits this specific client.
- Telling the client what's still outstanding in their case and how to complete it, using the real status given below.
- Explaining dashboard mechanics (adding items, uploading documents, coming back later, exporting/deleting their data).
- Noticing when a client is stuck, frustrated, or asking something outside what you should answer, and calmly suggesting they contact their adviser.

The four debt solutions, in general terms only:
${solutionLines}

This client's current status (use this to answer "what do I still need to do" accurately):
- Sections still incomplete: ${missingSections.length ? missingSections.join(', ') : 'none — all sections complete'}
- Solution chosen: ${solutionChosen || 'not chosen yet'}
- Documents still needed: ${missingDocs.length ? missingDocs.join(', ') : 'none — all required documents uploaded'}

Hard boundaries — never cross these:
- Never recommend or imply which specific solution this client should pick, or state that they're "eligible" or "not eligible" for one. Explain the general criteria, then say this needs to be confirmed with their adviser.
- Never estimate numbers specific to their case (repayment amounts, debt written off, how long it would take).
- Never discuss any other client's case.
- Never ask the client to give you new sensitive information outside the dashboard's normal fields.
- Never claim to be human or a substitute for their actual adviser.
- If a question strays into personal advice territory, or the client seems distressed or explicitly asks for a person, acknowledge it warmly and suggest contacting their adviser directly, rather than answering around the edge of the boundary.

Keep replies short — a few sentences, plain language, warm but not saccharine. No bullet points or markdown, this is a chat conversation.

After your reply, on a new line, write exactly one of:
FLAG: <a short few-word topic>
FLAG: none
...depending on whether this question is something an adviser should follow up on (anything touching the hard boundaries above, or genuine distress/frustration) or not (routine dashboard/general-info questions). Always include this line, exactly once, after your reply.`;
}

function splitReplyAndFlag(rawText) {
  const lines = rawText.split('\n');
  let flagIndex = -1;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (/^FLAG:/i.test(lines[i].trim())) { flagIndex = i; break; }
  }
  if (flagIndex === -1) {
    return { reply: rawText.trim(), flagged: false, flagTopic: null };
  }
  const flagValue = lines[flagIndex].trim().replace(/^FLAG:/i, '').trim();
  const reply = lines.slice(0, flagIndex).join('\n').trim();
  const flagged = flagValue.length > 0 && !/^none$/i.test(flagValue);
  return { reply: reply || rawText.trim(), flagged, flagTopic: flagged ? flagValue : null };
}

// Pure — builds the exact request Anthropic's API expects, kept separate
// from the actual socket/https.request call below so it can be unit tested
// without a live network call.
function buildRequest({ system, messages }) {
  const body = JSON.stringify({
    model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
    max_tokens: MAX_TOKENS,
    system,
    messages,
  });
  const options = {
    hostname: API_HOST,
    path: API_PATH,
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-length': Buffer.byteLength(body),
    },
    timeout: 20000,
  };
  return { options, body };
}

function callAnthropic({ system, messages }) {
  const { options, body } = buildRequest({ system, messages });

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch (err) {
          return reject(new Error(`Assistant service returned an unreadable response (status ${res.statusCode})`));
        }
        if (res.statusCode !== 200) {
          const message = (parsed && parsed.error && parsed.error.message) || `Assistant service error (status ${res.statusCode})`;
          return reject(new Error(message));
        }
        const textBlock = (parsed.content || []).find((b) => b.type === 'text');
        if (!textBlock) return reject(new Error('Assistant service returned an empty response'));
        resolve(textBlock.text);
      });
    });
    req.on('timeout', () => { req.destroy(new Error('Assistant service request timed out')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// context: { firstName, missingSections: string[], solutionChosen: string|null, missingDocs: string[] }
// history: [{ role: 'user'|'assistant', content: string }, ...] — prior turns in this chat, oldest first
async function askAssistant({ message, history, context }) {
  if (!isConfigured()) {
    return { reply: "This assistant isn't switched on yet — please contact your adviser directly in the meantime.", flagged: false, flagTopic: null, notConfigured: true };
  }
  const system = buildSystemPrompt(context);
  const messages = [...(history || []), { role: 'user', content: message }];
  const rawText = await callAnthropic({ system, messages });
  return splitReplyAndFlag(rawText);
}

module.exports = { askAssistant, isConfigured, buildSystemPrompt, splitReplyAndFlag, buildRequest };
