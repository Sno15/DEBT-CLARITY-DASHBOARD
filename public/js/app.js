'use strict';

/* ============================== State ============================== */
const STATE = { user: null, bundle: null, route: 'overview', ieTab: 'income' };

const BUNDLE_KEY = {
  dependants: 'dependants', creditors: 'creditors', properties: 'properties',
  vehicles: 'vehicles', 'bank-accounts': 'bankAccounts', 'insurance-policies': 'insurance',
  assets: 'assets', employment: 'employment', addresses: 'addresses',
};

/* ============================== API helpers ============================== */
async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

async function apiUpload(path, formData) {
  const res = await fetch(path, { method: 'POST', body: formData, credentials: 'same-origin' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data;
}

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove('show'), 2200);
}

async function refreshBundle() {
  STATE.bundle = await api('/api/case');
}

/* ============================== Init / Routing ============================== */
function currentRoute() {
  const isAdmin = STATE.user && STATE.user.role === 'admin';
  return (location.hash || (isAdmin ? '#admin-cases' : '#overview')).slice(1);
}

window.addEventListener('hashchange', () => {
  STATE.route = currentRoute();
  if (STATE.user && STATE.user.role === 'admin') renderAdminApp();
  else renderApp();
});

async function init() {
  try {
    STATE.user = await api('/api/me');
    if (STATE.user.role === 'admin') {
      STATE.route = currentRoute();
      await renderAdminApp();
      return;
    }
    await refreshBundle();
    STATE.route = currentRoute();
    renderApp();
  } catch {
    STATE.user = null;
    renderAuth('login');
  }
}

/* ============================== Auth screens ============================== */
function renderAuth(mode, errorMsg) {
  const app = document.getElementById('app');
  const isLogin = mode === 'login';
  app.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-card">
        <div class="auth-brand">
          <div class="logo-mark">DC</div>
          <div class="logo-text">Debt Clarity</div>
        </div>
        <h1>${isLogin ? 'Welcome back' : 'Create your account'}</h1>
        <p class="sub">${isLogin ? 'Log in to continue your case.' : 'Set up your secure case to get started.'}</p>
        ${errorMsg ? `<div class="auth-error">${escapeHtml(errorMsg)}</div>` : ''}
        <form id="auth-form">
          ${!isLogin ? `<div class="field"><label>Full name</label><input type="text" id="f-name" placeholder="Jane Smith" /></div>` : ''}
          <div class="field"><label>Email address <span class="req">*</span></label><input type="email" id="f-email" required /></div>
          <div class="field">
            <label>Password <span class="req">*</span></label>
            <input type="password" id="f-password" required minlength="8" />
            ${!isLogin ? '<div class="hint">At least 8 characters.</div>' : ''}
          </div>
          <button type="submit" class="btn btn-primary btn-block">${isLogin ? 'Log in' : 'Create account'}</button>
        </form>
        <div class="auth-switch">
          ${isLogin
            ? `Don't have an account? <button id="switch-mode">Sign up</button>`
            : `Already have an account? <button id="switch-mode">Log in</button>`}
        </div>
      </div>
    </div>
  `;
  document.getElementById('switch-mode').addEventListener('click', () => renderAuth(isLogin ? 'register' : 'login'));
  document.getElementById('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('f-email').value.trim();
    const password = document.getElementById('f-password').value;
    const name = !isLogin ? document.getElementById('f-name').value.trim() : undefined;
    try {
      await api(isLogin ? '/api/login' : '/api/register', { method: 'POST', body: isLogin ? { email, password } : { name, email, password } });
      STATE.user = await api('/api/me');
      if (STATE.user.role === 'admin') {
        location.hash = '#admin-cases';
        STATE.route = 'admin-cases';
        await renderAdminApp();
        return;
      }
      await refreshBundle();
      location.hash = '#overview';
      STATE.route = 'overview';
      renderApp();
    } catch (err) {
      renderAuth(mode, err.message);
    }
  });
}

async function logout() {
  await api('/api/logout', { method: 'POST' });
  STATE.user = null;
  STATE.bundle = null;
  location.hash = '';
  renderAuth('login');
}

/* ============================== Shell ============================== */
function renderApp() {
  if (!STATE.user) { renderAuth('login'); return; }
  const app = document.getElementById('app');
  const completion = STATE.bundle.completion;

  const navSections = SECTION_ORDER.map((s) => {
    const done = completion.sections[COMPLETION_KEY[s.key]];
    const active = STATE.route === s.key;
    return `<a class="nav-item ${active ? 'active' : ''}" href="#${s.key}">
      <span class="nav-icon">${s.icon}</span>${s.label}
      ${done ? '<span class="nav-check">✓</span>' : ''}
    </a>`;
  }).join('');

  app.innerHTML = `
    <div class="shell">
      <div class="sidebar">
        <div class="sidebar-brand"><div class="logo-mark">DC</div><div class="logo-text">Debt Clarity</div></div>
        <div class="nav-scroll">
          <a class="nav-item ${STATE.route === 'overview' ? 'active' : ''}" href="#overview"><span class="nav-icon">OV</span>Overview</a>
          <div class="nav-group-label">Stage 1 — Your Information</div>
          ${navSections}
          <div class="nav-group-label">Stage 2 — Your Solution</div>
          <a class="nav-item ${STATE.route === 'choose-solution' ? 'active' : ''}" href="#choose-solution">
            <span class="nav-icon">CS</span>Choose Solution ${completion.stage2Complete ? '<span class="nav-check">✓</span>' : ''}
          </a>
          <div class="nav-group-label">Stage 3 — Documents</div>
          <a class="nav-item ${STATE.route === 'documents' ? 'active' : ''}" href="#documents">
            <span class="nav-icon">DO</span>Upload Documents ${completion.stage3Complete ? '<span class="nav-check">✓</span>' : ''}
          </a>
          <div class="nav-group-label">Your Data</div>
          <a class="nav-item ${STATE.route === 'privacy' ? 'active' : ''}" href="#privacy"><span class="nav-icon">PR</span>Privacy &amp; Data</a>
        </div>
        <div class="sidebar-footer">
          Case: ${escapeHtml(STATE.bundle.case.reference)}
          <button id="logout-btn">Log out</button>
        </div>
      </div>
      <div class="main">
        <div class="topbar">Welcome, ${escapeHtml(STATE.user.name || STATE.user.email)}</div>
        <div class="content" id="content"></div>
      </div>
    </div>
  `;
  document.getElementById('logout-btn').addEventListener('click', logout);
  renderRoute();
}

function stepper(activeKey) {
  return `<div class="stepper">
    ${SECTION_ORDER.map((s) => {
      const done = STATE.bundle.completion.sections[COMPLETION_KEY[s.key]];
      const isActive = s.key === activeKey;
      return `<a class="step-pill ${isActive ? 'current' : ''}" href="#${s.key}">${done ? '<span class="tick">✓</span>' : ''}${isActive ? '→ ' : ''}${s.label}</a>`;
    }).join('')}
  </div>`;
}

function sectionNav(activeKey) {
  const idx = SECTION_ORDER.findIndex((s) => s.key === activeKey);
  const prev = idx > 0 ? SECTION_ORDER[idx - 1] : null;
  const next = idx < SECTION_ORDER.length - 1 ? SECTION_ORDER[idx + 1] : { key: 'choose-solution', label: 'Choose Solution' };
  return `<div class="actions-row">
    ${prev ? `<a class="btn btn-secondary" href="#${prev.key}">← ${prev.label}</a>` : '<span></span>'}
    <a class="btn btn-primary" href="#${next.key}">Next: ${next.label} →</a>
  </div>`;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderRoute() {
  const content = document.getElementById('content');
  const routers = {
    overview: renderOverview,
    personal: renderPersonal,
    address: renderAddress,
    employment: renderEmployment,
    dependants: renderDependants,
    'income-spending': renderIncomeSpending,
    creditors: renderCreditors,
    property: renderProperty,
    vehicles: renderVehicles,
    'bank-accounts': renderBankAccounts,
    insurance: renderInsurance,
    assets: renderAssets,
    'choose-solution': renderChooseSolution,
    documents: renderDocuments,
    privacy: renderPrivacy,
  };
  const fn = routers[STATE.route] || renderOverview;
  content.innerHTML = fn();
  wireRouteEvents(STATE.route);
}

async function reRender() {
  await refreshBundle();
  renderApp();
}

/* ============================== Overview ============================== */
function renderOverview() {
  const c = STATE.bundle.completion;
  const stages = [
    { n: 1, title: 'Your Information', desc: `Personal details, address, employment, income, debts, property, vehicles and more. ${c.completedCount} of ${c.sectionCount} sections complete.`, done: c.stage1Complete, href: '#personal' },
    { n: 2, title: 'Choose Your Solution', desc: "We'll match you with debt solutions based on your situation.", done: c.stage2Complete, href: '#choose-solution' },
    { n: 3, title: 'Your Documents', desc: 'Upload the documents needed for your chosen solution.', done: c.stage3Complete, href: '#documents' },
  ];
  const doneCount = stages.filter((s) => s.done).length;
  const nextStage = stages.find((s) => !s.done);

  return `
    <h1 class="page-title">Your case overview</h1>
    <p class="page-sub">Follow each stage to complete your case.</p>
    ${stages.map((s) => `
      <div class="overview-card">
        <div class="stage-num ${s.done ? 'done' : ''}">${s.done ? '✓' : s.n}</div>
        <div class="stage-body">
          <h3>${s.title}</h3>
          <p>${s.desc}</p>
          <span class="status-chip ${s.done ? 'complete' : (s.n === 1 && c.completedCount > 0) ? 'in-progress' : 'not-started'}">
            ${s.done ? 'COMPLETE' : (s.n === 1 && c.completedCount > 0) ? 'IN PROGRESS' : 'NOT STARTED'}
          </span>
        </div>
        <a class="btn btn-secondary" href="${s.href}">${s.done ? 'View' : 'Start'} →</a>
      </div>
    `).join('')}
    <div class="card">
      <div style="margin-bottom:8px;font-weight:600;">${doneCount} of ${stages.length} stages complete</div>
      <div class="progress-track"><div class="progress-fill" style="width:${(doneCount / stages.length) * 100}%"></div></div>
    </div>
    ${nextStage ? `
    <div class="pill-banner">
      <div><strong>Your next step</strong><br>${nextStage.n === 1 ? 'Complete your information to move on to choosing a solution.' : nextStage.n === 2 ? 'Choose the debt solution that best matches your situation.' : 'Upload the required documents to complete your case.'}</div>
      <a class="btn btn-primary" href="${nextStage.href}">Continue</a>
    </div>` : `<div class="pill-banner"><div><strong>All done!</strong><br>Your case is complete. Your advisor will be in touch.</div></div>`}
    <p class="footer-note">Your information is stored securely and only shared with your advisor.</p>
  `;
}

/* ============================== Personal ============================== */
function renderPersonal() {
  const p = STATE.bundle.personal || {};
  return `
    ${stepper('personal')}
    <h1 class="page-title">Personal details</h1>
    <p class="page-sub">We'll need some basic information about you.</p>
    <div class="card">
      <div class="grid-2">
        <div class="field"><label>Title</label>${selectHtml('p-title', TITLES, p.title)}</div>
        <div class="field"><label>Gender</label>${selectHtml('p-gender', GENDERS, p.gender)}</div>
      </div>
      <div class="grid-3">
        <div class="field"><label>First name <span class="req">*</span></label><input id="p-first" type="text" value="${escapeHtml(p.first_name)}" /></div>
        <div class="field"><label>Middle name</label><input id="p-middle" type="text" value="${escapeHtml(p.middle_name)}" /></div>
        <div class="field"><label>Last name <span class="req">*</span></label><input id="p-last" type="text" value="${escapeHtml(p.last_name)}" /></div>
      </div>
      <div class="checkbox-row"><input type="checkbox" id="p-used-diff" ${p.used_different_name ? 'checked' : ''} /><label for="p-used-diff" style="margin:0;">Have you ever used a different name?</label></div>
      <div id="prev-name-fields" style="${p.used_different_name ? '' : 'display:none;'}" class="grid-2">
        <div class="field"><label>Previous first name</label><input id="p-prev-first" type="text" value="${escapeHtml(p.previous_first_name)}" /></div>
        <div class="field"><label>Previous last name</label><input id="p-prev-last" type="text" value="${escapeHtml(p.previous_last_name)}" /></div>
      </div>
      <div class="field">
        <label>Date of birth <span class="req">*</span></label>
        <div class="grid-3">
          <input id="p-dob-day" type="text" placeholder="DD" maxlength="2" value="${escapeHtml(p.dob_day)}" />
          <input id="p-dob-month" type="text" placeholder="MM" maxlength="2" value="${escapeHtml(p.dob_month)}" />
          <input id="p-dob-year" type="text" placeholder="YYYY" maxlength="4" value="${escapeHtml(p.dob_year)}" />
        </div>
      </div>
      <div class="field"><label>Marital status <span class="req">*</span></label>${selectHtml('p-marital', MARITAL_STATUSES, p.marital_status)}</div>
      <div class="field">
        <label>National Insurance number <span class="req">*</span></label>
        <input id="p-ni" type="text" value="${escapeHtml(p.ni_number)}" />
        <div class="hint">Format: XX 99 99 99 X</div>
      </div>
    </div>
    <div class="card">
      <div class="section-heading">Contact details</div>
      <div class="grid-2">
        <div class="field"><label>Mobile number <span class="req">*</span></label><input id="p-mobile" type="tel" value="${escapeHtml(p.mobile)}" /></div>
        <div class="field"><label>Landline</label><input id="p-landline" type="tel" value="${escapeHtml(p.landline)}" /></div>
      </div>
      <div class="field">
        <label>Email address</label>
        <input type="email" value="${escapeHtml(STATE.user.email)}" disabled />
        <div class="hint">Your email is used to log in and cannot be changed here.</div>
      </div>
    </div>
    ${sectionNav('personal')}
  `;
}

function selectHtml(id, options, value) {
  return `<select id="${id}"><option value="">Select…</option>${options.map((o) => `<option value="${escapeHtml(o)}" ${o === value ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('')}</select>`;
}

async function savePersonal() {
  const usedDiff = document.getElementById('p-used-diff').checked;
  const body = {
    title: val('p-title'), gender: val('p-gender'), first_name: val('p-first'), middle_name: val('p-middle'),
    last_name: val('p-last'), used_different_name: usedDiff,
    previous_first_name: usedDiff ? val('p-prev-first') : null, previous_last_name: usedDiff ? val('p-prev-last') : null,
    dob_day: val('p-dob-day'), dob_month: val('p-dob-month'), dob_year: val('p-dob-year'),
    marital_status: val('p-marital'), ni_number: val('p-ni'), mobile: val('p-mobile'), landline: val('p-landline'),
  };
  await api('/api/case/personal', { method: 'PUT', body });
  await refreshBundle();
  renderSidebarChecksOnly();
  showToast('Saved');
}

function val(id) { const el = document.getElementById(id); return el ? el.value : null; }

/* ============================== Address ============================== */
function renderAddress() {
  const addresses = STATE.bundle.addresses || [];
  const current = addresses.find((a) => a.is_current) || {};
  const previous = addresses.filter((a) => !a.is_current).sort((a, b) => (b.year_moved_in || 0) - (a.year_moved_in || 0));
  const years = STATE.bundle.completion.addressYearsCovered;
  const covered5 = years >= 5;

  const timeline = [current, ...previous].filter((a) => a && a.address_line1).map((a) => `
    <div class="timeline-entry">
      <span class="tick">✓</span>
      <div>
        <div style="font-weight:700;">${escapeHtml(a.address_line1)}, ${escapeHtml(a.town_city)}</div>
        <div style="color:var(--ink-soft);font-size:13px;">${escapeHtml(a.month_moved_in)} ${escapeHtml(a.year_moved_in)} → ${a.is_current ? 'Now' : `${escapeHtml(a.end_month || '')} ${escapeHtml(a.end_year || '')}`}</div>
      </div>
    </div>
  `).join('');

  return `
    ${stepper('address')}
    <h1 class="page-title">Your address</h1>
    <p class="page-sub">Where do you currently live?</p>
    <div class="card">
      <div class="grid-2">
        <div class="field"><label>Postcode <span class="req">*</span></label>
          <div style="display:flex;gap:8px;">
            <input id="a-postcode" type="text" style="flex:1;" value="${escapeHtml(current.postcode)}" />
            <button type="button" class="btn btn-secondary" id="find-address-btn">Find address</button>
          </div>
        </div>
        <div class="field"><label>Building number / name</label><input id="a-building" type="text" value="${escapeHtml(current.building_number)}" /></div>
      </div>
      <div class="grid-2">
        <div class="field"><label>Address line 1 <span class="req">*</span></label><input id="a-line1" type="text" value="${escapeHtml(current.address_line1)}" /></div>
        <div class="field"><label>Address line 2</label><input id="a-line2" type="text" value="${escapeHtml(current.address_line2)}" /></div>
      </div>
      <div class="grid-2">
        <div class="field"><label>Town / City <span class="req">*</span></label><input id="a-city" type="text" value="${escapeHtml(current.town_city)}" /></div>
        <div class="field"><label>County</label><input id="a-county" type="text" value="${escapeHtml(current.county)}" /></div>
      </div>
      <div class="field"><label>Living status <span class="req">*</span></label>${selectHtml('a-living', LIVING_STATUSES, current.living_status)}</div>
      <div class="field">
        <label>Month moved in <span class="req">*</span> / Year <span class="req">*</span></label>
        <div class="grid-2">
          ${selectHtml('a-month', MONTHS, current.month_moved_in)}
          <input id="a-year" type="text" placeholder="YYYY" maxlength="4" value="${escapeHtml(current.year_moved_in)}" />
        </div>
      </div>
      <div class="field">
        <label>Address history timeline</label>
        ${timeline || '<div class="empty-state">No address history yet.</div>'}
        <div class="timeline-note ${covered5 ? 'ok' : 'warn'}">${covered5 ? '✓' : '!'} ${years.toFixed(1)} years of address history covered ${covered5 ? '✓' : '(need 5 years — add a previous address below)'}</div>
      </div>
      ${!covered5 ? `<button type="button" class="add-row-btn" id="add-prev-address-btn">+ Add previous address</button>` : ''}
    </div>
    ${sectionNav('address')}
  `;
}

async function saveCurrentAddress() {
  const body = {
    postcode: val('a-postcode'), building_number: val('a-building'), address_line1: val('a-line1'),
    address_line2: val('a-line2'), town_city: val('a-city'), county: val('a-county'),
    living_status: val('a-living'), month_moved_in: val('a-month'), year_moved_in: val('a-year'), is_current: true,
  };
  const current = (STATE.bundle.addresses || []).find((a) => a.is_current);
  if (current) await api(`/api/case/addresses/${current.id}`, { method: 'PUT', body });
  else await api('/api/case/addresses', { method: 'POST', body });
  await refreshBundle();
  renderSidebarChecksOnly();
  showToast('Address saved');
}

function openPreviousAddressModal() {
  openModal({
    title: 'Add previous address',
    fields: [
      { key: 'address_line1', label: 'Address line 1', required: true },
      { key: 'address_line2', label: 'Address line 2' },
      { key: 'town_city', label: 'Town / City', required: true },
      { key: 'postcode', label: 'Postcode' },
      { key: 'month_moved_in', label: 'Month moved in', type: 'select', options: MONTHS, half: true },
      { key: 'year_moved_in', label: 'Year moved in', half: true },
      { key: 'end_month', label: 'Month moved out', type: 'select', options: MONTHS, half: true },
      { key: 'end_year', label: 'Year moved out', half: true },
    ],
    initial: {},
    submitLabel: 'Add address',
    onSubmit: async (values) => {
      await api('/api/case/addresses', { method: 'POST', body: { ...values, is_current: false } });
      await reRender();
      showToast('Previous address added');
    },
  });
}

/* ============================== Employment ============================== */
function renderEmployment() {
  const flags = STATE.bundle.flags;
  const employment = STATE.bundle.employment || [];
  const years = STATE.bundle.completion.employmentYearsCovered;
  const showHistory = ['Employed', 'Self-Employed'].includes(flags.employment_status);

  const list = employment.map((e) => `
    <div class="list-item">
      <div class="item-icon">EM</div>
      <div class="item-body">
        <div class="item-title">${escapeHtml(e.employer_name || 'Untitled')}</div>
        <div class="item-detail">${escapeHtml(e.job_title || '')}${e.job_title ? ' · ' : ''}${escapeHtml(e.employment_type || '')}</div>
        <div class="item-detail">${escapeHtml(e.start_month)} ${escapeHtml(e.start_year)} — ${e.is_current ? 'Present' : `${escapeHtml(e.end_month || '')} ${escapeHtml(e.end_year || '')}`}</div>
      </div>
      <div class="item-actions">
        <button class="btn-icon edit-emp" data-id="${e.id}" title="Edit">✎</button>
        <button class="btn-icon delete-emp" data-id="${e.id}" title="Delete">🗑</button>
      </div>
    </div>
  `).join('');

  return `
    ${stepper('employment')}
    <h1 class="page-title">Employment</h1>
    <p class="page-sub">Tell us about your current employment situation.</p>
    <div class="card">
      <div class="field"><label>Employment status <span class="req">*</span></label>${selectHtml('e-status', EMPLOYMENT_STATUSES, flags.employment_status)}</div>
      ${showHistory ? `
      <div class="section-heading">Employment history <span style="color:${years >= 2 ? 'var(--success)' : 'var(--ink-soft)'};font-weight:600;font-size:13px;">${years >= 2 ? '✓' : ''} ${years.toFixed(1)} years covered</span></div>
      ${list || '<div class="empty-state">No employment history added yet.</div>'}
      <button type="button" class="add-row-btn" id="add-employment-btn">+ Add employment</button>
      ` : '<div class="empty-state">Employment history isn\'t required for this status.</div>'}
    </div>
    ${sectionNav('employment')}
  `;
}

async function saveEmploymentStatus() {
  await api('/api/case/flags', { method: 'PUT', body: { employment_status: val('e-status') } });
  await reRender();
}

function employmentModal(existing) {
  openModal({
    title: existing ? 'Edit employment' : 'Add employment',
    fields: [
      { key: 'employer_name', label: 'Employer / Business name', required: true },
      { key: 'job_title', label: 'Job title' },
      { key: 'employment_type', label: 'Employment type', type: 'select', options: EMPLOYMENT_TYPES },
      { key: 'start_month', label: 'Start month', type: 'select', options: MONTHS, half: true },
      { key: 'start_year', label: 'Start year', half: true },
      { key: 'is_current', label: 'I currently work here', type: 'checkbox' },
      { key: 'end_month', label: 'End month', type: 'select', options: MONTHS, half: true, hideIf: (v) => v.is_current },
      { key: 'end_year', label: 'End year', half: true, hideIf: (v) => v.is_current },
    ],
    initial: existing || { is_current: true },
    submitLabel: existing ? 'Save changes' : 'Add employment',
    onSubmit: async (values) => {
      if (existing) await api(`/api/case/employment/${existing.id}`, { method: 'PUT', body: values });
      else await api('/api/case/employment', { method: 'POST', body: values });
      await reRender();
      showToast('Employment saved');
    },
  });
}

/* ============================== Generic list-resource sections ============================== */
const RESOURCE_CONFIGS = {
  dependants: {
    key: 'dependants', title: 'Dependants', subtitle: 'Do you have any dependants living with you?',
    noneFlag: 'no_dependants', noneLabel: 'I have no dependants', addLabel: '+ Add a dependant',
    fields: [
      { key: 'name', label: 'Full name', required: true },
      { key: 'dob', label: 'Date of birth', placeholder: 'DD/MM/YYYY' },
      { key: 'relationship', label: 'Relationship', type: 'select', options: DEPENDANT_RELATIONSHIPS },
    ],
    item: (d) => ({ icon: 'DE', title: d.name || 'Dependant', tag: d.relationship, detail: d.dob ? `Born ${d.dob}` : '' }),
  },
  creditors: {
    key: 'creditors', title: 'Your creditors', subtitle: 'Add all the debts you want included in your solution. Include credit cards, loans, overdrafts and any other debts.',
    addLabel: '+ Add a creditor',
    fields: [
      { key: 'name', label: 'Creditor name', required: true },
      { key: 'type', label: 'Debt type', type: 'select', options: CREDITOR_TYPES },
      { key: 'balance', label: 'Outstanding balance (£)', type: 'number', half: true },
      { key: 'monthly_repayment', label: 'Current monthly repayment (£)', type: 'number', half: true },
    ],
    item: (c) => ({ icon: 'CR', title: c.name || 'Creditor', tag: c.type, detail: `Balance: ${currency(c.balance)} · Repayment: ${currency(c.monthly_repayment)}/mo` }),
    summary: (items) => {
      const total = items.reduce((s, i) => s + (Number(i.balance) || 0), 0);
      const repay = items.reduce((s, i) => s + (Number(i.monthly_repayment) || 0), 0);
      return `<div class="pill-banner"><div>Total debt: ${currency(total)}</div><div>${items.length} creditor(s)</div><div>Total monthly repayments: ${currency(repay)}/mo</div></div>`;
    },
  },
  properties: {
    key: 'properties', urlKey: 'properties', title: 'Property', subtitle: 'Do you own or have a financial interest in any property?',
    noneFlag: 'no_property', noneLabel: 'I have no property', addLabel: '+ Add a property',
    fields: [
      { key: 'address', label: 'Property address', required: true },
      { key: 'property_type', label: 'Property type', type: 'select', options: PROPERTY_TYPES },
      { key: 'ownership', label: 'Ownership', type: 'select', options: OWNERSHIP_TYPES },
      { key: 'value', label: 'Estimated value (£)', type: 'number', half: true },
      { key: 'mortgage_balance', label: 'Mortgage balance (£)', type: 'number', half: true },
    ],
    item: (p) => ({ icon: 'PR', title: p.address || 'Property', tag: p.property_type, detail: `Value: ${currency(p.value)} · Mortgage: ${currency(p.mortgage_balance)}` }),
  },
  vehicles: {
    key: 'vehicles', title: 'Vehicles', subtitle: 'Do you own or have use of a vehicle?',
    noneFlag: 'no_vehicles', noneLabel: 'I have no vehicles', addLabel: '+ Add a vehicle',
    fields: [
      { key: 'make', label: 'Make', required: true, half: true },
      { key: 'model', label: 'Model', half: true },
      { key: 'year', label: 'Year', half: true },
      { key: 'value', label: 'Estimated value (£)', type: 'number', half: true },
      { key: 'finance_balance', label: 'Outstanding finance (£)', type: 'number' },
    ],
    item: (v) => ({ icon: 'VE', title: `${v.make || ''} ${v.model || ''}`.trim() || 'Vehicle', tag: v.year, detail: `Value: ${currency(v.value)} · Finance: ${currency(v.finance_balance)}` }),
  },
  'bank-accounts': {
    key: 'bank-accounts', title: 'Bank Accounts', subtitle: 'Please add all bank accounts you hold, including current accounts, savings accounts and basic bank accounts.',
    addLabel: '+ Add a bank account',
    fields: [
      { key: 'bank_name', label: 'Bank name', required: true },
      { key: 'account_type', label: 'Account type', type: 'select', options: ACCOUNT_TYPES },
      { key: 'sort_code', label: 'Sort code', half: true },
      { key: 'account_number', label: 'Account number', half: true },
      { key: 'balance', label: 'Current balance (£)', type: 'number', half: true },
      { key: 'ownership', label: 'Ownership', type: 'select', options: ACCOUNT_OWNERSHIP, half: true },
    ],
    item: (b) => ({ icon: 'BA', title: b.bank_name || 'Bank account', tag: b.account_type, detail: `${escapeHtml(b.sort_code || '')} · ${maskAccountNumber(b.account_number)}<br>Balance: ${currency(b.balance)} · ${escapeHtml(b.ownership || '')}` }),
  },
  'insurance-policies': {
    key: 'insurance-policies', title: 'Insurance', subtitle: 'Please add any insurance policies you currently hold.',
    noneFlag: 'no_insurance', noneLabel: "I don't have any insurance policies", addLabel: '+ Add insurance',
    fields: [
      { key: 'provider', label: 'Provider', required: true },
      { key: 'policy_type', label: 'Policy type', type: 'select', options: INSURANCE_TYPES },
      { key: 'monthly_premium', label: 'Monthly premium (£)', type: 'number' },
    ],
    item: (i) => ({ icon: 'IN', title: i.provider || 'Insurance', tag: i.policy_type, detail: `${currency(i.monthly_premium)}/mo` }),
  },
  assets: {
    key: 'assets', title: 'Assets', subtitle: 'Please add any other significant assets you own, such as pensions, investments or savings.',
    noneFlag: 'no_assets', noneLabel: 'I have no additional assets', addLabel: '+ Add an asset',
    fields: [
      { key: 'description', label: 'Description', required: true },
      { key: 'estimated_value', label: 'Estimated value (£)', type: 'number' },
    ],
    item: (a) => ({ icon: 'AS', title: a.description || 'Asset', tag: null, detail: `Value: ${currency(a.estimated_value)}` }),
  },
};

function maskAccountNumber(num) {
  if (!num) return '';
  const s = String(num);
  if (s.length <= 4) return `****${s}`;
  return `****${s.slice(-4)}`;
}

function renderResourceSection(resourceKey, stepKey) {
  const cfg = RESOURCE_CONFIGS[resourceKey];
  const items = STATE.bundle[BUNDLE_KEY[resourceKey]] || [];
  const flags = STATE.bundle.flags;
  const noneChecked = cfg.noneFlag ? !!flags[cfg.noneFlag] : false;

  const listHtml = items.map((item) => {
    const d = cfg.item(item);
    return `
      <div class="list-item">
        <div class="item-icon">${d.icon}</div>
        <div class="item-body">
          <div class="item-title">${escapeHtml(d.title)}</div>
          ${d.tag ? `<div class="item-tag">${escapeHtml(d.tag)}</div>` : ''}
          <div class="item-detail">${d.detail}</div>
        </div>
        <div class="item-actions">
          <button class="btn-icon res-edit" data-resource="${resourceKey}" data-id="${item.id}" title="Edit">✎</button>
          <button class="btn-icon res-delete" data-resource="${resourceKey}" data-id="${item.id}" title="Delete">🗑</button>
        </div>
      </div>
    `;
  }).join('');

  return `
    ${stepper(stepKey)}
    <h1 class="page-title">${cfg.title}</h1>
    <p class="page-sub">${cfg.subtitle}</p>
    ${cfg.summary ? cfg.summary(items) : ''}
    ${(!noneChecked || items.length > 0) ? (listHtml || (cfg.noneFlag ? '' : '<div class="empty-state">Nothing added yet.</div>')) : ''}
    ${!noneChecked ? `<button type="button" class="add-row-btn res-add" data-resource="${resourceKey}">${cfg.addLabel}</button>` : ''}
    ${cfg.noneFlag ? `<div class="checkbox-row"><input type="checkbox" id="none-flag-${resourceKey}" ${noneChecked ? 'checked' : ''} /><label for="none-flag-${resourceKey}" style="margin:0;">${cfg.noneLabel}</label></div>` : ''}
    ${sectionNav(stepKey)}
  `;
}

function renderDependants() { return renderResourceSection('dependants', 'dependants'); }
function renderCreditors() { return renderResourceSection('creditors', 'creditors'); }
function renderProperty() { return renderResourceSection('properties', 'property'); }
function renderVehicles() { return renderResourceSection('vehicles', 'vehicles'); }
function renderBankAccounts() { return renderResourceSection('bank-accounts', 'bank-accounts'); }
function renderInsurance() { return renderResourceSection('insurance-policies', 'insurance'); }
function renderAssets() { return renderResourceSection('assets', 'assets'); }

function resourceUrlKey(resourceKey) {
  return resourceKey === 'properties' ? 'properties' : resourceKey;
}

function openResourceModal(resourceKey, existing) {
  const cfg = RESOURCE_CONFIGS[resourceKey];
  openModal({
    title: existing ? `Edit ${cfg.title.toLowerCase()}` : cfg.addLabel.replace('+ ', ''),
    fields: cfg.fields,
    initial: existing || {},
    submitLabel: existing ? 'Save changes' : 'Add',
    onSubmit: async (values) => {
      if (existing) await api(`/api/case/${resourceKey}/${existing.id}`, { method: 'PUT', body: values });
      else await api(`/api/case/${resourceKey}`, { method: 'POST', body: values });
      await reRender();
      showToast('Saved');
    },
  });
}

async function deleteResourceItem(resourceKey, id) {
  await api(`/api/case/${resourceKey}/${id}`, { method: 'DELETE' });
  await reRender();
  showToast('Removed');
}

async function toggleNoneFlag(resourceKey, checked) {
  const cfg = RESOURCE_CONFIGS[resourceKey];
  await api('/api/case/flags', { method: 'PUT', body: { [cfg.noneFlag]: checked } });
  await reRender();
}

/* ============================== Income & Spending ============================== */
function renderIncomeSpending() {
  const income = STATE.bundle.incomeData || {};
  const expenditure = STATE.bundle.expenditureData || {};
  const incomeTotal = Object.values(income).reduce((s, v) => s + (Number(v) || 0), 0);
  const expenditureTotal = Object.values(expenditure).reduce((s, v) => s + (Number(v) || 0), 0);
  const left = incomeTotal - expenditureTotal;
  const tab = STATE.ieTab;

  function groupBlock(groups, data, prefix) {
    return groups.map((g) => {
      const groupTotal = g.items.reduce((s, it) => s + (Number(data[it.key]) || 0), 0);
      return `
        <div class="section-heading"><span>${escapeHtml(g.group)}</span><span>${currency(groupTotal)}</span></div>
        <div class="grid-3">
          ${g.items.map((it) => `
            <div class="field">
              <label>${escapeHtml(it.label)}</label>
              <input type="number" step="0.01" min="0" class="ie-input" data-prefix="${prefix}" data-key="${it.key}" value="${data[it.key] || ''}" placeholder="0.00" />
            </div>
          `).join('')}
        </div>
      `;
    }).join('');
  }

  return `
    ${stepper('income-spending')}
    <h1 class="page-title">Income & Expenditure</h1>
    <p class="page-sub">All amounts should be per month in £.</p>
    <div class="summary-bar">
      <div class="stat"><div class="label">Monthly income</div><div class="value" id="ie-income-total">${currency(incomeTotal)}</div></div>
      <div class="stat"><div class="label">Monthly expenses</div><div class="value" id="ie-expense-total">${currency(expenditureTotal)}</div></div>
      <div class="stat"><div class="label">Left each month</div><div class="value ${left >= 0 ? 'positive' : 'negative'}" id="ie-left-total">${currency(left)}</div></div>
    </div>
    <div class="tabs">
      <button class="tab-btn ${tab === 'income' ? 'active' : ''}" id="tab-income">Income</button>
      <button class="tab-btn ${tab === 'expenses' ? 'active' : ''}" id="tab-expenses">Expenses</button>
    </div>
    <div class="card">
      ${tab === 'income' ? groupBlock(INCOME_GROUPS, income, 'income') : groupBlock(EXPENDITURE_GROUPS, expenditure, 'expenditure')}
    </div>
    ${sectionNav('income-spending')}
  `;
}

function collectIeValues(prefix) {
  const data = {};
  document.querySelectorAll(`.ie-input[data-prefix="${prefix}"]`).forEach((el) => {
    const v = parseFloat(el.value);
    if (!isNaN(v) && v !== 0) data[el.dataset.key] = v;
  });
  return data;
}

async function saveIncomeExpenditure() {
  const incomeData = { ...STATE.bundle.incomeData, ...collectIeValues('income') };
  const expenditureData = { ...STATE.bundle.expenditureData, ...collectIeValues('expenditure') };
  // Remove zero/empty keys that were cleared
  document.querySelectorAll('.ie-input').forEach((el) => {
    const v = parseFloat(el.value);
    const target = el.dataset.prefix === 'income' ? incomeData : expenditureData;
    if (isNaN(v) || v === 0) delete target[el.dataset.key];
  });
  const result = await api('/api/case/income-expenditure', { method: 'PUT', body: { incomeData, expenditureData } });
  STATE.bundle.incomeData = result.incomeData;
  STATE.bundle.expenditureData = result.expenditureData;
  STATE.bundle.completion = result.completion;
  updateIeSummary();
  renderSidebarChecksOnly();
}

function updateIeSummary() {
  const incomeTotal = Object.values(STATE.bundle.incomeData || {}).reduce((s, v) => s + (Number(v) || 0), 0);
  const expenditureTotal = Object.values(STATE.bundle.expenditureData || {}).reduce((s, v) => s + (Number(v) || 0), 0);
  const left = incomeTotal - expenditureTotal;
  const it = document.getElementById('ie-income-total');
  const et = document.getElementById('ie-expense-total');
  const lt = document.getElementById('ie-left-total');
  if (it) it.textContent = currency(incomeTotal);
  if (et) et.textContent = currency(expenditureTotal);
  if (lt) { lt.textContent = currency(left); lt.className = 'value ' + (left >= 0 ? 'positive' : 'negative'); }
}

/* ============================== Choose Solution ============================== */
function renderChooseSolution() {
  const chosen = STATE.bundle.solution ? STATE.bundle.solution.solutionType : null;
  const matches = STATE.bundle.solutionMatches || { hasEnoughData: false };
  return `
    <h1 class="page-title">Choose your solution</h1>
    <p class="page-sub">Here are the main debt solutions. You can pick any of them — the ones marked "May be worth discussing" are just a general pointer based on typical qualifying guidelines for your total debt and monthly budget, not a decision.</p>
    ${matches.hasEnoughData ? `
      <div class="solution-note">
        These highlights are a general guide only, based on standard published qualifying criteria (your total debt, monthly disposable income, and any assets/property) — they are <strong>not</strong> a formal eligibility check or advice. Your case adviser will confirm what's actually right for you before anything is agreed.
      </div>
    ` : `
      <div class="solution-note">
        Once you've added your creditors and income &amp; spending figures, this page will highlight which solutions are typically worth discussing based on your numbers.
      </div>
    `}
    ${SOLUTIONS.map((s) => `
      <div class="solution-card ${chosen === s.key ? 'selected' : ''}" data-solution="${s.key}">
        <div class="solution-card-head">
          <h4>${escapeHtml(s.name)} ${chosen === s.key ? '✓' : ''}</h4>
          ${matches[s.key] ? '<span class="badge-match">May be worth discussing</span>' : ''}
        </div>
        <p>${escapeHtml(s.desc)}</p>
      </div>
    `).join('')}
    ${chosen ? `<div class="pill-banner"><div>You've selected <strong>${escapeHtml(SOLUTIONS.find((s) => s.key === chosen).name)}</strong>.</div><a class="btn btn-primary" href="#documents">Continue to documents →</a></div>` : ''}
  `;
}

async function chooseSolution(key) {
  const result = await api('/api/case/solution', { method: 'PUT', body: { solutionType: key } });
  STATE.bundle.solution = result.solution;
  STATE.bundle.completion = result.completion;
  content_rerenderRoute();
  renderSidebarChecksOnly();
  showToast('Solution selected');
}

function content_rerenderRoute() {
  const content = document.getElementById('content');
  content.innerHTML = renderChooseSolution();
  wireRouteEvents('choose-solution');
}

/* ============================== Documents ============================== */
function renderDocuments() {
  const docs = STATE.bundle.documents || [];
  const uploadedCount = REQUIRED_DOCUMENTS.filter((r) => docs.some((d) => d.doc_type === r.key)).length;
  return `
    <h1 class="page-title">Your documents</h1>
    <p class="page-sub">Upload the documents we need to process your case. All files are stored securely.</p>
    <div class="card">
      <div style="font-weight:600;">${uploadedCount} of ${REQUIRED_DOCUMENTS.length} documents uploaded</div>
      <div class="progress-track"><div class="progress-fill" style="width:${(uploadedCount / REQUIRED_DOCUMENTS.length) * 100}%"></div></div>
    </div>
    ${REQUIRED_DOCUMENTS.map((rd) => {
      const doc = docs.find((d) => d.doc_type === rd.key);
      return `
      <div class="card doc-card">
        <div class="doc-card-head">
          <div>
            <div style="font-weight:700;font-size:16px;">${escapeHtml(rd.label)}</div>
            <p style="color:var(--ink-soft);font-size:13px;margin:4px 0 0;">${escapeHtml(rd.desc)}</p>
          </div>
          <span class="${doc ? 'badge-done' : 'badge-required'}">${doc ? 'Uploaded' : 'Required'}</span>
        </div>
        ${doc ? `
          <div class="uploaded-file-row">
            <span>📄 ${escapeHtml(doc.original_name)} (${Math.round(doc.size / 1024)} KB)</span>
            <button class="btn-icon delete-doc" data-id="${doc.id}" title="Remove">🗑</button>
          </div>
        ` : `
          <div class="upload-box" data-doctype="${rd.key}">
            <div class="icon">⬆</div>
            <div class="primary">Drag &amp; drop or tap to select</div>
            <div>PDF, JPG, PNG, HEIC — max 10MB</div>
          </div>
          <input type="file" class="doc-file-input" data-doctype="${rd.key}" accept=".pdf,.jpg,.jpeg,.png,.heic" style="display:none;" />
        `}
      </div>
    `;
    }).join('')}
  `;
}

async function uploadDocument(docType, file) {
  if (file.size > 10 * 1024 * 1024) { showToast('File is too large (max 10MB)'); return; }
  const fd = new FormData();
  fd.append('doc_type', docType);
  fd.append('file', file);
  try {
    const result = await apiUpload('/api/case/documents', fd);
    STATE.bundle.completion = result.completion;
    await refreshBundle();
    renderApp();
    showToast('Document uploaded');
  } catch (err) {
    showToast(err.message);
  }
}

async function deleteDocument(id) {
  await api(`/api/case/documents/${id}`, { method: 'DELETE' });
  await reRender();
  showToast('Document removed');
}

/* ============================== Privacy & Data (GDPR self-service) ============================== */
function renderPrivacy() {
  return `
    <h1 class="page-title">Privacy &amp; Data</h1>
    <p class="page-sub">Your case data is stored securely and is only visible to you and your advisor.</p>

    <div class="card">
      <div class="section-heading">Download your data</div>
      <p style="color:var(--ink-soft);font-size:14px;margin-top:0;">Download everything you've entered as a JSON file — your personal details, address, employment, income &amp; expenditure, creditors, and every other section. Your uploaded documents can be downloaded individually from the <a href="#documents">Documents</a> page.</p>
      <a class="btn btn-secondary" href="/api/case/export" download>⬇ Download my data (JSON)</a>
    </div>

    <div class="card">
      <div class="section-heading" style="color:var(--danger);">Delete your account &amp; data</div>
      <p style="color:var(--ink-soft);font-size:14px;margin-top:0;">This permanently deletes your account, every piece of information you've entered, and every document you've uploaded. This cannot be undone, and there is no way for us to recover it afterwards.</p>
      <button type="button" class="btn btn-danger" id="open-erase-modal">Delete my account &amp; all data</button>
    </div>
  `;
}

function openEraseAccountModal() {
  openModal({
    title: 'Delete your account & all data',
    fields: [
      { key: 'confirmText', label: 'Type DELETE to confirm', required: true },
      { key: 'password', label: 'Enter your current password to confirm it\'s you', type: 'password', required: true },
    ],
    initial: {},
    submitLabel: 'Permanently delete everything',
    onSubmit: async (values) => {
      if (values.confirmText !== 'DELETE') throw new Error('Type DELETE (all capitals) to confirm.');
      await api('/api/case/erase', { method: 'POST', body: { password: values.password } });
      STATE.user = null;
      STATE.bundle = null;
      location.hash = '';
      renderAuth('login');
    },
  });
}

/* ============================== Modal ============================== */
function openModal({ title, fields, initial, onSubmit, submitLabel }) {
  const values = { ...initial };
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal-card">
      <h3>${escapeHtml(title)}</h3>
      <form id="modal-form">
        <div class="grid-2" id="modal-fields"></div>
        <div id="modal-error" class="field-error" style="display:none;"></div>
        <div class="actions-row" style="margin-top:18px;">
          <button type="button" class="btn btn-secondary" id="modal-cancel">Cancel</button>
          <button type="submit" class="btn btn-primary">${escapeHtml(submitLabel || 'Save')}</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(backdrop);

  function renderFields() {
    const container = backdrop.querySelector('#modal-fields');
    container.innerHTML = fields.filter((f) => !f.hideIf || !f.hideIf(values)).map((f) => {
      const wide = !f.half ? 'style="grid-column: 1 / -1;"' : '';
      if (f.type === 'checkbox') {
        return `<div class="checkbox-row" ${wide}><input type="checkbox" id="mf-${f.key}" ${values[f.key] ? 'checked' : ''} /><label for="mf-${f.key}" style="margin:0;">${escapeHtml(f.label)}</label></div>`;
      }
      if (f.type === 'select') {
        return `<div class="field" ${wide}><label>${escapeHtml(f.label)}${f.required ? ' <span class="req">*</span>' : ''}</label>${selectHtmlModal(`mf-${f.key}`, f.options, values[f.key])}</div>`;
      }
      const inputType = f.type === 'number' ? 'number' : (f.type === 'password' ? 'password' : 'text');
      return `<div class="field" ${wide}><label>${escapeHtml(f.label)}${f.required ? ' <span class="req">*</span>' : ''}</label><input id="mf-${f.key}" type="${inputType}" ${f.type === 'number' ? 'step="0.01"' : ''} placeholder="${escapeHtml(f.placeholder || '')}" value="${f.type === 'password' ? '' : escapeHtml(values[f.key])}" /></div>`;
    }).join('');

    fields.forEach((f) => {
      const el = backdrop.querySelector(`#mf-${f.key}`);
      if (!el) return;
      const evt = f.type === 'checkbox' || f.type === 'select' ? 'change' : 'input';
      el.addEventListener(evt, () => {
        values[f.key] = f.type === 'checkbox' ? el.checked : el.value;
        if (fields.some((ff) => ff.hideIf)) renderFields();
      });
    });
  }
  renderFields();

  backdrop.querySelector('#modal-cancel').addEventListener('click', () => backdrop.remove());
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
  backdrop.querySelector('#modal-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const missing = fields.filter((f) => f.required && (!f.hideIf || !f.hideIf(values)) && !values[f.key]);
    const errEl = backdrop.querySelector('#modal-error');
    if (missing.length) {
      errEl.style.display = 'block';
      errEl.textContent = `Please fill in: ${missing.map((f) => f.label).join(', ')}`;
      return;
    }
    try {
      await onSubmit(values);
      backdrop.remove();
    } catch (err) {
      errEl.style.display = 'block';
      errEl.textContent = err.message;
    }
  });
}

function selectHtmlModal(id, options, value) {
  return `<select id="${id}"><option value="">Select…</option>${options.map((o) => `<option value="${escapeHtml(o)}" ${o === value ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('')}</select>`;
}

/* ============================== Sidebar-only refresh (avoid full page jump on autosave) ============================== */
function renderSidebarChecksOnly() {
  // Cheap way to keep the sidebar/stepper ticks in sync without losing focus mid-typing:
  // only touch nav-check spans and step-pill ticks.
  const completion = STATE.bundle.completion;
  document.querySelectorAll('.nav-item').forEach((el) => {
    const href = el.getAttribute('href');
    if (!href) return;
    const key = href.slice(1);
    const compKey = COMPLETION_KEY[key];
    if (!compKey) return;
    const done = completion.sections[compKey];
    let check = el.querySelector('.nav-check');
    if (done && !check) { el.insertAdjacentHTML('beforeend', '<span class="nav-check">✓</span>'); }
    if (!done && check) check.remove();
  });
}

/* ============================== Event wiring per route ============================== */
function wireRouteEvents(route) {
  const content = document.getElementById('content');

  if (route === 'personal') {
    ['p-title','p-gender','p-first','p-middle','p-last','p-dob-day','p-dob-month','p-dob-year','p-marital','p-ni','p-mobile','p-landline'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'blur', savePersonal);
    });
    const usedDiff = document.getElementById('p-used-diff');
    usedDiff.addEventListener('change', () => {
      document.getElementById('prev-name-fields').style.display = usedDiff.checked ? '' : 'none';
      savePersonal();
    });
    document.getElementById('p-prev-first').addEventListener('blur', savePersonal);
    document.getElementById('p-prev-last').addEventListener('blur', savePersonal);
  }

  if (route === 'address') {
    ['a-postcode','a-building','a-line1','a-line2','a-city','a-county','a-living','a-month','a-year'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'blur', saveCurrentAddress);
    });
    document.getElementById('find-address-btn').addEventListener('click', () => {
      showToast('Address lookup isn\'t available in this demo — please enter your address manually.');
    });
    const addPrev = document.getElementById('add-prev-address-btn');
    if (addPrev) addPrev.addEventListener('click', openPreviousAddressModal);
  }

  if (route === 'employment') {
    document.getElementById('e-status').addEventListener('change', saveEmploymentStatus);
    const addBtn = document.getElementById('add-employment-btn');
    if (addBtn) addBtn.addEventListener('click', () => employmentModal(null));
    content.querySelectorAll('.edit-emp').forEach((btn) => btn.addEventListener('click', () => {
      const item = STATE.bundle.employment.find((e) => e.id === btn.dataset.id);
      employmentModal(item);
    }));
    content.querySelectorAll('.delete-emp').forEach((btn) => btn.addEventListener('click', async () => {
      await api(`/api/case/employment/${btn.dataset.id}`, { method: 'DELETE' });
      await reRender();
    }));
  }

  if (['dependants','creditors','property','vehicles','bank-accounts','insurance','assets'].includes(route)) {
    const resourceKeyMap = { dependants: 'dependants', creditors: 'creditors', property: 'properties', vehicles: 'vehicles', 'bank-accounts': 'bank-accounts', insurance: 'insurance-policies', assets: 'assets' };
    const resourceKey = resourceKeyMap[route];
    const addBtn = content.querySelector('.res-add');
    if (addBtn) addBtn.addEventListener('click', () => openResourceModal(resourceKey, null));
    content.querySelectorAll('.res-edit').forEach((btn) => btn.addEventListener('click', () => {
      const items = STATE.bundle[BUNDLE_KEY[resourceKey]] || [];
      const item = items.find((i) => i.id === btn.dataset.id);
      openResourceModal(resourceKey, item);
    }));
    content.querySelectorAll('.res-delete').forEach((btn) => btn.addEventListener('click', () => deleteResourceItem(resourceKey, btn.dataset.id)));
    const noneCb = document.getElementById(`none-flag-${resourceKey}`);
    if (noneCb) noneCb.addEventListener('change', () => toggleNoneFlag(resourceKey, noneCb.checked));
  }

  if (route === 'income-spending') {
    document.getElementById('tab-income').addEventListener('click', () => { STATE.ieTab = 'income'; renderRoute(); });
    document.getElementById('tab-expenses').addEventListener('click', () => { STATE.ieTab = 'expenses'; renderRoute(); });
    content.querySelectorAll('.ie-input').forEach((el) => {
      el.addEventListener('input', updateIeSummary);
      el.addEventListener('blur', saveIncomeExpenditure);
    });
  }

  if (route === 'choose-solution') {
    content.querySelectorAll('.solution-card').forEach((card) => {
      card.addEventListener('click', () => chooseSolution(card.dataset.solution));
    });
  }

  if (route === 'documents') {
    content.querySelectorAll('.upload-box').forEach((box) => {
      const docType = box.dataset.doctype;
      const input = content.querySelector(`.doc-file-input[data-doctype="${docType}"]`);
      box.addEventListener('click', () => input.click());
      box.addEventListener('dragover', (e) => { e.preventDefault(); box.style.background = '#f6f4ee'; });
      box.addEventListener('dragleave', () => { box.style.background = ''; });
      box.addEventListener('drop', (e) => {
        e.preventDefault();
        box.style.background = '';
        if (e.dataTransfer.files[0]) uploadDocument(docType, e.dataTransfer.files[0]);
      });
      input.addEventListener('change', () => { if (input.files[0]) uploadDocument(docType, input.files[0]); });
    });
    content.querySelectorAll('.delete-doc').forEach((btn) => btn.addEventListener('click', () => deleteDocument(btn.dataset.id)));
  }

  if (route === 'privacy') {
    const eraseBtn = document.getElementById('open-erase-modal');
    if (eraseBtn) eraseBtn.addEventListener('click', openEraseAccountModal);
  }
}

/* ============================== Admin (advisor) view ============================== */
function adminShellHtml(contentHtml) {
  return `
    <div class="shell">
      <div class="sidebar">
        <div class="sidebar-brand"><div class="logo-mark">DC</div><div class="logo-text">Debt Clarity</div></div>
        <div class="nav-scroll">
          <a class="nav-item ${STATE.route === 'admin-cases' ? 'active' : ''}" href="#admin-cases"><span class="nav-icon">AC</span>All Cases</a>
          <a class="nav-item ${STATE.route === 'admin-audit' ? 'active' : ''}" href="#admin-audit"><span class="nav-icon">AL</span>Activity Log</a>
        </div>
        <div class="sidebar-footer">
          Signed in as ${escapeHtml(STATE.user.name || STATE.user.email)}
          <button id="logout-btn">Log out</button>
        </div>
      </div>
      <div class="main">
        <div class="topbar">Advisor view</div>
        <div class="content" id="content">${contentHtml}</div>
      </div>
    </div>
  `;
}

async function renderAdminApp() {
  const app = document.getElementById('app');
  const route = STATE.route;
  const caseDetailMatch = route.match(/^admin-case\/(.+)$/);

  if (caseDetailMatch) {
    const caseId = caseDetailMatch[1];
    try {
      const [bundle, notesResult, emailsResult] = await Promise.all([
        api(`/api/admin/cases/${caseId}`),
        api(`/api/admin/cases/${caseId}/notes`),
        api(`/api/admin/cases/${caseId}/emails`),
      ]);
      app.innerHTML = adminShellHtml(renderAdminCaseDetail(bundle, notesResult.notes, emailsResult));
      wireAdminCaseDetailEvents(bundle, notesResult.notes, emailsResult);
    } catch (err) {
      app.innerHTML = adminShellHtml(`<a class="back-link" href="#admin-cases">← Back to all cases</a><div class="card" style="margin-top:14px;">Couldn't load that case: ${escapeHtml(err.message)}</div>`);
    }
    document.getElementById('logout-btn').addEventListener('click', logout);
    return;
  }

  if (route === 'admin-audit') {
    const { entries } = await api('/api/admin/audit-log');
    app.innerHTML = adminShellHtml(renderAdminAuditLog(entries));
    document.getElementById('logout-btn').addEventListener('click', logout);
    return;
  }

  const { cases } = await api('/api/admin/cases');
  STATE.adminCases = cases;
  app.innerHTML = adminShellHtml(renderAdminCasesList(cases));
  document.getElementById('logout-btn').addEventListener('click', logout);
  wireAdminCasesListEvents();
}

function renderAdminAuditLog(entries) {
  if (!entries.length) {
    return `<h1 class="page-title">Activity Log</h1><p class="page-sub">Nothing recorded yet.</p>`;
  }
  const rows = entries.map((e) => `
    <div class="kv-row">
      <span class="kv-label">${new Date(e.created_at).toLocaleString('en-GB')}</span>
      <span class="kv-value" style="text-align:left;">${escapeHtml(e.action)} — ${escapeHtml(e.actor_email || 'unknown')}${e.case_id ? ` <span style="color:var(--ink-soft);">(case ${escapeHtml(e.case_id.slice(0, 8))}…)</span>` : ''}${e.detail ? ` <span style="color:var(--ink-soft);">· ${escapeHtml(e.detail)}</span>` : ''}</span>
    </div>
  `).join('');
  return `
    <h1 class="page-title">Activity Log</h1>
    <p class="page-sub">Most recent ${entries.length} events — logins, document views, case access and data changes. This is a plain audit trail for your own compliance records.</p>
    <div class="card">${rows}</div>
  `;
}

function renderAdminCasesList(cases) {
  if (!cases.length) {
    return `<h1 class="page-title">All Cases</h1><p class="page-sub">No client cases yet. Once clients sign up and start their case, they'll show up here.</p>`;
  }
  const filter = STATE.adminStatusFilter || 'all';
  const visible = filter === 'all' ? cases : cases.filter((c) => (c.status || 'new') === filter);
  const filterOptions = ['<option value="all">All statuses</option>']
    .concat(CASE_STATUSES.map((s) => `<option value="${s.key}" ${filter === s.key ? 'selected' : ''}>${escapeHtml(s.label)}</option>`))
    .join('');
  const rows = visible.map((c) => {
    const allDone = c.completion.stage1Complete && c.completion.stage2Complete && c.completion.stage3Complete;
    const initials = (c.ownerName || c.ownerEmail || '?').trim().slice(0, 2).toUpperCase();
    return `
      <div class="list-item admin-case-row" data-case-id="${c.caseId}">
        <div class="item-icon">${escapeHtml(initials)}</div>
        <div class="item-body">
          <div class="item-title">${escapeHtml(c.ownerName || '(no name given)')} <span style="color:var(--ink-soft);font-weight:400;">— ${escapeHtml(c.reference)}</span></div>
          <div class="item-detail">${escapeHtml(c.ownerEmail)}</div>
          <div class="item-detail">Information: ${c.completion.completedCount}/${c.completion.sectionCount} · Solution: ${c.completion.stage2Complete ? 'Chosen' : 'Not chosen'} · Documents: ${c.completion.stage3Complete ? 'Complete' : 'Incomplete'}</div>
        </div>
        <div class="item-actions" style="flex-direction:column;align-items:flex-end;gap:6px;">
          <span class="status-chip workflow-${escapeHtml(c.status || 'new')}">${escapeHtml(caseStatusLabel(c.status || 'new'))}</span>
          <span class="status-chip ${allDone ? 'complete' : 'in-progress'}">${allDone ? 'COMPLETE' : 'IN PROGRESS'}</span>
        </div>
      </div>
    `;
  }).join('');
  return `
    <h1 class="page-title">All Cases</h1>
    <p class="page-sub">${cases.length} client case${cases.length === 1 ? '' : 's'}. Click a case to view its full details and documents.</p>
    <div style="margin-bottom:14px;">
      <select id="admin-status-filter" style="padding:8px 12px;border-radius:8px;border:1px solid var(--border);font-size:14px;">${filterOptions}</select>
    </div>
    <div id="admin-case-rows">${rows || '<div class="empty-state">No cases match that status.</div>'}</div>
  `;
}

function wireAdminCasesListEvents() {
  document.querySelectorAll('.admin-case-row').forEach((row) => {
    row.addEventListener('click', () => { location.hash = `#admin-case/${row.dataset.caseId}`; });
  });
  const filterSelect = document.getElementById('admin-status-filter');
  if (filterSelect) {
    filterSelect.addEventListener('change', () => {
      STATE.adminStatusFilter = filterSelect.value;
      const app = document.getElementById('app');
      app.innerHTML = adminShellHtml(renderAdminCasesList(STATE.adminCases));
      document.getElementById('logout-btn').addEventListener('click', logout);
      wireAdminCasesListEvents();
    });
  }
}

function kvRow(label, value) {
  const display = (value === null || value === undefined || value === '') ? '<span style="color:var(--ink-soft);">—</span>' : escapeHtml(value);
  return `<div class="kv-row"><span class="kv-label">${escapeHtml(label)}</span><span class="kv-value">${display}</span></div>`;
}

// Like kvRow, but `html` is inserted as-is (caller is responsible for escaping
// any user-controlled text within it). Used for the documents list, where the
// value needs to be a clickable link rather than plain text.
function kvRowHtml(label, html) {
  return `<div class="kv-row"><span class="kv-label">${escapeHtml(label)}</span><span class="kv-value">${html}</span></div>`;
}

function adminListSection(title, resourceKey, items, noneFlag) {
  const cfg = RESOURCE_CONFIGS[resourceKey];
  let body;
  if (noneFlag) body = '<div class="empty-state">Client indicated they have none.</div>';
  else if (!items.length) body = '<div class="empty-state">Nothing added yet.</div>';
  else {
    body = items.map((it) => {
      const d = cfg.item(it);
      return `
        <div class="list-item">
          <div class="item-icon">${d.icon}</div>
          <div class="item-body">
            <div class="item-title">${escapeHtml(d.title)}</div>
            ${d.tag ? `<div class="item-tag">${escapeHtml(d.tag)}</div>` : ''}
            <div class="item-detail">${d.detail}</div>
          </div>
        </div>
      `;
    }).join('');
  }
  return `<div class="section-heading">${escapeHtml(title)}</div>${body}`;
}

function renderAdminCaseDetail(bundle, notes, emailsResult) {
  const owner = bundle.owner || {};
  const c = bundle.completion;
  const p = bundle.personal || {};
  const addresses = bundle.addresses || [];
  const currentAddress = addresses.find((a) => a.is_current) || {};
  const prevAddresses = addresses.filter((a) => !a.is_current);
  const employment = bundle.employment || [];
  notes = notes || [];

  const incomeRows = INCOME_GROUPS.flatMap((g) => g.items.filter((it) => bundle.incomeData[it.key]).map((it) => ({ label: it.label, val: bundle.incomeData[it.key] })));
  const expenditureRows = EXPENDITURE_GROUPS.flatMap((g) => g.items.filter((it) => bundle.expenditureData[it.key]).map((it) => ({ label: it.label, val: bundle.expenditureData[it.key] })));

  const solutionName = bundle.solution ? (SOLUTIONS.find((s) => s.key === bundle.solution.solutionType) || {}).name || bundle.solution.solutionType : null;
  const statusOptions = CASE_STATUSES.map((s) => `<option value="${s.key}" ${bundle.case.status === s.key ? 'selected' : ''}>${escapeHtml(s.label)}</option>`).join('');

  return `
    <a class="back-link" href="#admin-cases">← Back to all cases</a>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;">
      <div>
        <h1 class="page-title" style="margin-top:10px;">${escapeHtml(owner.name || 'Client')}</h1>
        <p class="page-sub">${escapeHtml(owner.email || '')} · Case ${escapeHtml(bundle.case.reference)} · Created ${new Date(bundle.case.created_at).toLocaleDateString('en-GB')}</p>
      </div>
      <div style="display:flex;gap:8px;flex-shrink:0;align-items:center;flex-wrap:wrap;">
        <select id="admin-status-select" style="padding:9px 12px;border-radius:8px;border:1px solid var(--border);font-size:14px;font-weight:600;">${statusOptions}</select>
        <a class="btn btn-secondary" href="/api/admin/cases/${encodeURIComponent(bundle.case.id)}/proposal" target="_blank" rel="noopener">📄 Case Summary</a>
        <a class="btn btn-secondary" href="/api/admin/cases/${encodeURIComponent(bundle.case.id)}/export" download>⬇ Export (JSON)</a>
        <button type="button" class="btn btn-danger" id="admin-delete-case-btn">Delete case</button>
      </div>
    </div>

    <div class="pill-banner">
      <div>Information: ${c.completedCount}/${c.sectionCount} sections</div>
      <div>Solution: ${solutionName || 'Not chosen'}</div>
      <div>Documents: ${bundle.documents.length}/${bundle.requiredDocumentTypes.length} uploaded</div>
    </div>

    <div class="card">
      <div class="section-heading">Personal details</div>
      ${kvRow('Full name', [p.title, p.first_name, p.middle_name, p.last_name].filter(Boolean).join(' '))}
      ${kvRow('Date of birth', (p.dob_day && p.dob_month && p.dob_year) ? `${p.dob_day}/${p.dob_month}/${p.dob_year}` : '')}
      ${kvRow('Gender', p.gender)}
      ${kvRow('Marital status', p.marital_status)}
      ${kvRow('National Insurance number', p.ni_number)}
      ${kvRow('Mobile', p.mobile)}
      ${kvRow('Landline', p.landline)}
      ${kvRow('Login email', owner.email)}
    </div>

    <div class="card">
      <div class="section-heading">Address <span style="font-weight:400;font-size:13px;color:var(--ink-soft);">${c.addressYearsCovered.toFixed(1)} yrs history</span></div>
      ${kvRow('Current address', [currentAddress.address_line1, currentAddress.address_line2, currentAddress.town_city, currentAddress.county, currentAddress.postcode].filter(Boolean).join(', '))}
      ${kvRow('Living status', currentAddress.living_status)}
      ${kvRow('Moved in', (currentAddress.month_moved_in && currentAddress.year_moved_in) ? `${currentAddress.month_moved_in} ${currentAddress.year_moved_in}` : '')}
      ${prevAddresses.map((a) => kvRow('Previous address', `${[a.address_line1, a.town_city].filter(Boolean).join(', ')} (${a.month_moved_in || ''} ${a.year_moved_in || ''} – ${a.end_month || ''} ${a.end_year || ''})`)).join('')}
    </div>

    <div class="card">
      <div class="section-heading">Employment <span style="font-weight:400;font-size:13px;color:var(--ink-soft);">${c.employmentYearsCovered.toFixed(1)} yrs covered</span></div>
      ${kvRow('Status', bundle.flags.employment_status)}
      ${employment.length ? employment.map((e) => kvRow(e.is_current ? 'Current employer' : 'Previous employer', `${e.employer_name || ''}${e.job_title ? ` — ${e.job_title}` : ''} (${e.start_month || ''} ${e.start_year || ''} – ${e.is_current ? 'Present' : `${e.end_month || ''} ${e.end_year || ''}`})`)).join('') : ''}
    </div>

    <div class="card">${adminListSection('Dependants', 'dependants', bundle.dependants, bundle.flags.no_dependants)}</div>

    <div class="card">
      <div class="section-heading">Income &amp; Expenditure</div>
      <div class="summary-bar" style="box-shadow:none;border:none;padding:0 0 16px;margin-bottom:16px;border-bottom:1px solid var(--border);border-radius:0;">
        <div class="stat"><div class="label">Monthly income</div><div class="value">${currency(c.incomeTotal)}</div></div>
        <div class="stat"><div class="label">Monthly expenses</div><div class="value">${currency(c.expenditureTotal)}</div></div>
        <div class="stat"><div class="label">Left each month</div><div class="value ${c.netMonthly >= 0 ? 'positive' : 'negative'}">${currency(c.netMonthly)}</div></div>
      </div>
      ${incomeRows.length ? incomeRows.map((r) => kvRow(r.label, currency(r.val))).join('') : '<div class="empty-state">No income entered.</div>'}
      ${expenditureRows.length ? expenditureRows.map((r) => kvRow(r.label, currency(r.val))).join('') : '<div class="empty-state">No expenditure entered.</div>'}
    </div>

    <div class="card">
      ${adminListSection('Creditors', 'creditors', bundle.creditors, false)}
      ${bundle.creditors.length ? kvRow('Total debt', currency(c.totalDebt)) + kvRow('Total monthly repayments', currency(c.totalMonthlyRepayments)) : ''}
    </div>

    <div class="card">${adminListSection('Property', 'properties', bundle.properties, bundle.flags.no_property)}</div>
    <div class="card">${adminListSection('Vehicles', 'vehicles', bundle.vehicles, bundle.flags.no_vehicles)}</div>
    <div class="card">${adminListSection('Bank Accounts', 'bank-accounts', bundle.bankAccounts, false)}</div>
    <div class="card">${adminListSection('Insurance', 'insurance-policies', bundle.insurance, bundle.flags.no_insurance)}</div>
    <div class="card">${adminListSection('Assets', 'assets', bundle.assets, bundle.flags.no_assets)}</div>

    <div class="card">
      <div class="section-heading">Documents</div>
      ${bundle.requiredDocumentTypes.map((rd) => {
        const doc = bundle.documents.find((d) => d.doc_type === rd.key);
        const html = doc
          ? `<a href="/api/admin/cases/${encodeURIComponent(bundle.case.id)}/documents/${encodeURIComponent(doc.id)}/file" target="_blank" rel="noopener">${escapeHtml(doc.original_name)} ↗</a>`
          : '<span style="color:var(--danger);">Not uploaded</span>';
        return kvRowHtml(rd.label, html);
      }).join('')}
    </div>

    <div class="card">
      <div class="section-heading">Case Notes <span style="font-weight:400;font-size:13px;color:var(--ink-soft);">Internal — never shown to the client</span></div>
      <textarea id="admin-note-text" rows="3" placeholder="Add a note for other advisers on this case…" style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-family:inherit;font-size:14px;resize:vertical;"></textarea>
      <div style="margin-top:8px;"><button type="button" class="btn btn-primary" id="admin-add-note-btn">Add note</button></div>
      ${renderCaseNotesList(notes)}
    </div>

    <div class="card">
      <div class="section-heading">Client Communication <span style="font-weight:400;font-size:13px;color:var(--ink-soft);">Sent manually — nothing goes out automatically</span></div>
      ${!owner.email ? '<div class="empty-state">This client has no email address on file.</div>' : `
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button type="button" class="btn btn-secondary" id="admin-send-thankyou-btn">✉ Send thank-you email</button>
          <button type="button" class="btn btn-secondary" id="admin-send-reminder-btn">✉ Send reminder to continue</button>
        </div>
      `}
      ${renderCaseEmailsList(emailsResult)}
    </div>
  `;
}

function renderCaseEmailsList(emailsResult) {
  const emails = (emailsResult && emailsResult.emails) || [];
  const smtpConfigured = emailsResult ? emailsResult.smtpConfigured : true;
  const warning = smtpConfigured ? '' : `
    <div class="empty-state" style="margin-top:12px;">Email sending isn't set up on this server yet — see the README for how to connect Brevo. Attempts will still be logged below.</div>
  `;
  const labels = { thank_you: 'Thank-you email', reminder: 'Reminder to continue' };
  const list = emails.length ? emails.map((e) => `
    <div class="kv-row">
      <span class="kv-label">${new Date(e.created_at).toLocaleString('en-GB')}</span>
      <span class="kv-value" style="text-align:left;">${escapeHtml(labels[e.template] || e.template)} to ${escapeHtml(e.to_address)} — ${e.sentOk ? '<span style="color:var(--success, #1a7f4e);">Sent</span>' : `<span style="color:var(--danger);">Failed${e.error ? `: ${escapeHtml(e.error)}` : ''}</span>`}${e.sent_by_name ? ` <span style="color:var(--ink-soft);">· by ${escapeHtml(e.sent_by_name)}</span>` : ''}</span>
    </div>
  `).join('') : '<div class="empty-state">No emails sent yet.</div>';
  return `<div id="admin-emails-section" style="margin-top:16px;">${list}${warning}</div>`;
}

function wireAdminCaseDetailEvents(bundle, notes, emailsResult) {
  const deleteBtn = document.getElementById('admin-delete-case-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      openModal({
        title: `Delete case ${bundle.case.reference}`,
        fields: [
          { key: 'confirmReference', label: `Type the case reference (${bundle.case.reference}) to confirm`, required: true },
        ],
        initial: {},
        submitLabel: 'Permanently delete this case',
        onSubmit: async (values) => {
          if (values.confirmReference !== bundle.case.reference) throw new Error('That reference doesn\'t match. Nothing was deleted.');
          await api(`/api/admin/cases/${bundle.case.id}`, { method: 'DELETE', body: { confirmReference: values.confirmReference } });
          location.hash = '#admin-cases';
          STATE.route = 'admin-cases';
          await renderAdminApp();
          showToast('Case permanently deleted');
        },
      });
    });
  }

  const statusSelect = document.getElementById('admin-status-select');
  if (statusSelect) {
    statusSelect.addEventListener('change', async () => {
      const previous = bundle.case.status;
      try {
        await api(`/api/admin/cases/${bundle.case.id}/status`, { method: 'PUT', body: { status: statusSelect.value } });
        bundle.case.status = statusSelect.value;
        showToast('Case status updated');
      } catch (err) {
        statusSelect.value = previous;
        showToast(err.message || 'Could not update status');
      }
    });
  }

  const addNoteBtn = document.getElementById('admin-add-note-btn');
  if (addNoteBtn) {
    addNoteBtn.addEventListener('click', async () => {
      const textarea = document.getElementById('admin-note-text');
      const text = textarea.value.trim();
      if (!text) return;
      addNoteBtn.disabled = true;
      try {
        await api(`/api/admin/cases/${bundle.case.id}/notes`, { method: 'POST', body: { text } });
        const fresh = await api(`/api/admin/cases/${bundle.case.id}/notes`);
        const list = document.getElementById('admin-notes-list');
        list.outerHTML = renderCaseNotesList(fresh.notes);
        wireCaseNotesEvents(bundle);
        textarea.value = '';
        showToast('Note added');
      } catch (err) {
        showToast(err.message || 'Could not add note');
      } finally {
        addNoteBtn.disabled = false;
      }
    });
  }

  wireCaseNotesEvents(bundle);

  async function sendCaseEmail(template, btn) {
    btn.disabled = true;
    try {
      await api(`/api/admin/cases/${bundle.case.id}/send-email`, { method: 'POST', body: { template } });
      showToast('Email sent');
    } catch (err) {
      showToast(err.message || 'Could not send email');
    } finally {
      btn.disabled = false;
      try {
        const fresh = await api(`/api/admin/cases/${bundle.case.id}/emails`);
        const section = document.getElementById('admin-emails-section');
        if (section) section.outerHTML = renderCaseEmailsList(fresh);
      } catch (e) { /* history refresh is best-effort */ }
    }
  }

  const thankYouBtn = document.getElementById('admin-send-thankyou-btn');
  if (thankYouBtn) thankYouBtn.addEventListener('click', () => sendCaseEmail('thank_you', thankYouBtn));

  const reminderBtn = document.getElementById('admin-send-reminder-btn');
  if (reminderBtn) reminderBtn.addEventListener('click', () => sendCaseEmail('reminder', reminderBtn));
}

function renderCaseNotesList(notes) {
  notes = notes || [];
  return `
    <div id="admin-notes-list" style="margin-top:16px;">
      ${notes.length ? notes.map((n) => `
        <div class="list-item" data-note-id="${n.id}">
          <div class="item-body">
            <div class="item-detail" style="margin-bottom:4px;"><strong>${escapeHtml(n.author_name || 'Adviser')}</strong> · ${new Date(n.created_at).toLocaleString('en-GB')}</div>
            <div>${escapeHtml(n.body).replace(/\n/g, '<br>')}</div>
          </div>
          <div class="item-actions"><button type="button" class="btn-icon admin-delete-note-btn" data-note-id="${n.id}" title="Delete note">🗑</button></div>
        </div>
      `).join('') : '<div class="empty-state">No notes yet.</div>'}
    </div>
  `;
}

function wireCaseNotesEvents(bundle) {
  document.querySelectorAll('.admin-delete-note-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const noteId = btn.dataset.noteId;
      await api(`/api/admin/cases/${bundle.case.id}/notes/${noteId}`, { method: 'DELETE' });
      const fresh = await api(`/api/admin/cases/${bundle.case.id}/notes`);
      const list = document.getElementById('admin-notes-list');
      list.outerHTML = renderCaseNotesList(fresh.notes);
      wireCaseNotesEvents(bundle);
      showToast('Note deleted');
    });
  });
}

/* ============================== Boot ============================== */
init();
