'use strict';

// Calm, low-pressure email copy for the two manual communications an
// adviser can send from a case (see server/mailer.js and the
// POST /api/admin/cases/:id/send-email route in app.js). Nothing here is
// sent automatically — an adviser always chooses when, and to whom.
//
// Both builders take the same `bundle` shape returned by
// caseData.getFullCase(), plus the recipient's login email/name (the
// `owner` object already included in that bundle covers this).

const { FIRM_NAME } = require('./firm-config');

const SECTION_LABELS = {
  personal: 'Personal details',
  address: 'Address history',
  employment: 'Employment',
  dependants: 'Dependants',
  incomeExpenditure: 'Income & expenditure',
  creditors: 'Creditors',
  property: 'Property',
  vehicles: 'Vehicles',
  bankAccounts: 'Bank accounts',
  insurance: 'Insurance',
  assets: 'Other assets',
};

function firstNameOf(bundle) {
  const p = bundle.personal;
  if (p && p.first_name) return p.first_name;
  const owner = bundle.owner || {};
  if (owner.name) return owner.name.split(' ')[0];
  return 'there';
}

function recipient(bundle) {
  const owner = bundle.owner || {};
  return { toAddress: owner.email, toName: owner.name || null };
}

function incompleteSectionLabels(bundle) {
  const sections = (bundle.completion && bundle.completion.sections) || {};
  return Object.keys(sections).filter((k) => !sections[k]).map((k) => SECTION_LABELS[k] || k);
}

function missingDocumentLabels(bundle) {
  const required = bundle.requiredDocumentTypes || [];
  const uploaded = new Set((bundle.completion && bundle.completion.uploadedDocTypes) || []);
  return required.filter((d) => !uploaded.has(d.key)).map((d) => d.label);
}

function buildThankYouEmail(bundle) {
  const name = firstNameOf(bundle);
  const reference = bundle.case ? bundle.case.reference : '';
  const subject = `Thanks for the update on your case, ${name}`;
  const text = [
    `Hi ${name},`,
    '',
    `Just a quick note to say thank you — we can see you've been adding information to your ${FIRM_NAME} dashboard, and it's really helpful to us.`,
    '',
    `There's no rush on anything else. Whenever you have a few minutes, you can pick up where you left off, and your adviser will be in touch if we need anything further from you.`,
    '',
    `If you have any questions in the meantime, just reply to this email.`,
    '',
    `Best wishes,`,
    `The ${FIRM_NAME} team`,
    '',
    `(Case reference: ${reference})`,
  ].join('\n');
  return { subject, text, ...recipient(bundle) };
}

function buildReminderEmail(bundle) {
  const name = firstNameOf(bundle);
  const reference = bundle.case ? bundle.case.reference : '';
  const incompleteSections = incompleteSectionLabels(bundle);
  const missingDocs = missingDocumentLabels(bundle);
  const stage2Complete = bundle.completion && bundle.completion.stage2Complete;

  const nextSteps = [];
  if (incompleteSections.length) nextSteps.push(`a few sections of your details (${incompleteSections.slice(0, 4).join(', ')}${incompleteSections.length > 4 ? ', and a couple more' : ''})`);
  if (!stage2Complete) nextSteps.push('choosing which solution you\'d like to explore');
  if (missingDocs.length) nextSteps.push(`uploading ${missingDocs.length === 1 ? 'one remaining document' : `${missingDocs.length} remaining documents`} (${missingDocs.slice(0, 3).join(', ')}${missingDocs.length > 3 ? ', and a couple more' : ''})`);

  const nextStepsLine = nextSteps.length
    ? `Whenever it suits you, it would help us move things along if you could finish off ${nextSteps.join(', and ')}.`
    : `It looks like you've completed everything we need for now — thank you.`;

  const subject = `Continuing your case with ${FIRM_NAME}`;
  const text = [
    `Hi ${name},`,
    '',
    `We hope things are going well. We wanted to check in about your case with ${FIRM_NAME} — there's no pressure at all, just a friendly note to let you know we're here whenever you're ready to continue.`,
    '',
    nextStepsLine,
    '',
    `You can log back in to your dashboard at any time, and your information is saved as you go. If anything is unclear or you'd like to talk it through, just reply to this email or give us a call — we're happy to help.`,
    '',
    `Best wishes,`,
    `The ${FIRM_NAME} team`,
    '',
    `(Case reference: ${reference})`,
  ].join('\n');
  return { subject, text, ...recipient(bundle) };
}

const TEMPLATES = {
  thank_you: { label: 'Thank-you email', build: buildThankYouEmail },
  reminder: { label: 'Reminder to continue', build: buildReminderEmail },
};

module.exports = { TEMPLATES, buildThankYouEmail, buildReminderEmail };
