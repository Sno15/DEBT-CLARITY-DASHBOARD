'use strict';

// Small shared bits used by both the proposal generator and the mailer, so
// there's one place to change the firm's display name.
const FIRM_NAME = process.env.DEBT_CLARITY_FIRM_NAME || 'Phoenix Insolvency';

module.exports = { FIRM_NAME };
