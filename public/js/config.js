// Static configuration: option lists and field layouts for Debt Clarity.
// Kept separate from app.js so the section field definitions are easy to
// extend without touching the app logic.

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const YEARS = (() => { const arr = []; const now = new Date().getFullYear(); for (let y = now; y >= now - 100; y--) arr.push(String(y)); return arr; })();

const TITLES = ['Mr','Mrs','Miss','Ms','Mx','Dr'];
const GENDERS = ['Male','Female','Other','Prefer not to say'];
const MARITAL_STATUSES = ['Single','Married','Civil Partnership','Divorced','Widowed','Separated'];
const LIVING_STATUSES = ['Renting (Private)','Renting (Council/Housing Association)','Owner Occupier (Mortgage)','Owner Occupier (Outright)','Living with Family or Friends','Other'];
const EMPLOYMENT_STATUSES = ['Employed','Self-Employed','Unemployed','Retired','Student','Unable to Work'];
const EMPLOYMENT_TYPES = ['Full-time','Part-time','Zero-hours','Casual/Seasonal'];
const DEPENDANT_RELATIONSHIPS = ['Son','Daughter','Grandchild','Other'];
const CREDITOR_TYPES = ['Credit Card','Personal Loan','Overdraft','Consolidated Debt','Budget Account','Catalogue','Store Card','Utility Arrears','Council Tax Arrears','HMRC / Tax Debt','Payday Loan','Other'];
const PROPERTY_TYPES = ['House','Flat / Apartment','Bungalow','Maisonette','Other'];
const OWNERSHIP_TYPES = ['Sole Owner','Joint Owner'];
const ACCOUNT_OWNERSHIP = ['Me only','Joint'];
const ACCOUNT_TYPES = ['Current Account','Savings Account','Basic Bank Account','Credit Union Account'];
const INSURANCE_TYPES = ['Life Insurance','Health Insurance','Home / Contents Insurance','Payment Protection Insurance','Pet Insurance','Other'];

const INCOME_GROUPS = [
  { group: 'Employment', items: [
    { key: 'salary', label: 'Salary / Wages (take home)' },
    { key: 'partner_income', label: "Partner's Income" },
    { key: 'self_employed_income', label: 'Self-Employed Income' },
    { key: 'overtime_bonus', label: 'Overtime / Bonus' },
  ]},
  { group: 'Benefits', items: [
    { key: 'universal_credit', label: 'Universal Credit' },
    { key: 'child_benefit', label: 'Child Benefit' },
    { key: 'tax_credits', label: 'Tax Credits' },
    { key: 'pip_dla', label: 'PIP / DLA / Attendance Allowance' },
    { key: 'housing_benefit', label: 'Housing Benefit' },
    { key: 'other_benefits', label: 'Other Benefits' },
  ]},
  { group: 'Other Income', items: [
    { key: 'pension', label: 'Pension Income' },
    { key: 'maintenance_received', label: 'Maintenance Received' },
    { key: 'rental_income', label: 'Rental Income' },
    { key: 'other_income', label: 'Other Income' },
  ]},
];

const EXPENDITURE_GROUPS = [
  { group: 'Essential', items: [
    { key: 'rent', label: 'Rent' },
    { key: 'ground_rent', label: 'Ground Rent' },
    { key: 'service_charge', label: 'Service Charge' },
    { key: 'mortgage', label: 'Mortgage' },
    { key: 'other_secured_loans', label: 'Other Secured Loans' },
    { key: 'mortgage_endowment_ppi', label: 'Mortgage Endowment or PPI' },
    { key: 'buildings_contents_insurance', label: 'Building and/or Contents Insurance' },
    { key: 'pension_life_insurance', label: 'Pension and/or Life Insurance' },
    { key: 'council_tax', label: 'Council Tax' },
    { key: 'gas', label: 'Gas' },
    { key: 'electricity', label: 'Electricity' },
    { key: 'water', label: 'Water' },
    { key: 'other_utilities', label: 'Other Utilities' },
    { key: 'tv_licence', label: 'TV Licence' },
    { key: 'court_fines', label: 'Magistrates or Sheriff Court Fines' },
    { key: 'child_maintenance', label: 'Child Maintenance' },
    { key: 'hire_purchase', label: 'Hire Purchase or Vehicle Lease Payments' },
    { key: 'childcare', label: 'Childcare' },
    { key: 'adult_care', label: 'Adult Care' },
    { key: 'other_essential', label: 'Other Essential' },
  ]},
  { group: 'Phone', items: [
    { key: 'home_phone', label: 'Home Phone' },
    { key: 'mobile_phone', label: 'Mobile Phone' },
    { key: 'other_phone', label: 'Other Phone' },
  ]},
  { group: 'Travel', items: [
    { key: 'public_transport', label: 'Public Transport' },
    { key: 'fuel', label: 'Fuel' },
    { key: 'vehicle_insurance', label: 'Vehicle Insurance' },
    { key: 'vehicle_tax', label: 'Vehicle Tax' },
    { key: 'vehicle_maintenance', label: 'Vehicle Maintenance / Breakdown Cover' },
    { key: 'parking', label: 'Parking' },
  ]},
  { group: 'Food & Housekeeping', items: [
    { key: 'food_housekeeping', label: 'Food & Housekeeping' },
    { key: 'clothing', label: 'Clothing' },
    { key: 'laundry', label: 'Laundry / Dry Cleaning' },
  ]},
  { group: 'Health', items: [
    { key: 'prescriptions', label: 'Prescriptions' },
    { key: 'dental', label: 'Dental' },
    { key: 'optical', label: 'Optical' },
  ]},
  { group: 'Leisure & Other', items: [
    { key: 'internet', label: 'Internet / Broadband' },
    { key: 'subscriptions', label: 'TV / Streaming Subscriptions' },
    { key: 'leisure', label: 'Leisure & Entertainment' },
    { key: 'other_non_essential', label: 'Other Non-Essential' },
  ]},
];

const REQUIRED_DOCUMENTS = [
  { key: 'mobile_bills', label: "Last 3 months' mobile phone bills", desc: "Please upload your last 3 months' mobile phone statements so we can verify your phone costs." },
  { key: 'photo_id', label: 'Photo ID', desc: 'A picture of your Photo ID such as a passport, driving licence or a picture of your birth certificate.' },
  { key: 'bank_statements', label: 'Bank statements', desc: 'Your last three full months bank statements in PDF format, for all accounts you have.' },
];

const SOLUTIONS = [
  { key: 'iva', name: 'Individual Voluntary Arrangement (IVA)', desc: 'A formal agreement to repay some or all of your debts over a fixed period, typically 5-6 years, based on what you can afford.' },
  { key: 'dmp', name: 'Debt Management Plan (DMP)', desc: 'An informal, flexible arrangement to repay your debts in full at a reduced monthly rate.' },
  { key: 'dro', name: 'Debt Relief Order (DRO)', desc: 'A low-cost route for people with low income and few assets to have their qualifying debts written off.' },
  { key: 'bankruptcy', name: 'Bankruptcy', desc: 'A formal insolvency process that can clear most debts, subject to conditions on assets and income.' },
];

const SECTION_ORDER = [
  { key: 'personal', label: 'Personal', icon: 'PE' },
  { key: 'address', label: 'Address', icon: 'AD' },
  { key: 'employment', label: 'Employment', icon: 'EM' },
  { key: 'dependants', label: 'Dependants', icon: 'DE' },
  { key: 'income-spending', label: 'Income & Spending', icon: 'IS' },
  { key: 'creditors', label: 'Creditors', icon: 'CR' },
  { key: 'property', label: 'Property', icon: 'PR' },
  { key: 'vehicles', label: 'Vehicles', icon: 'VE' },
  { key: 'bank-accounts', label: 'Bank Accounts', icon: 'BA' },
  { key: 'insurance', label: 'Insurance', icon: 'IN' },
  { key: 'assets', label: 'Assets', icon: 'AS' },
];

const COMPLETION_KEY = {
  personal: 'personal', address: 'address', employment: 'employment', dependants: 'dependants',
  'income-spending': 'incomeExpenditure', creditors: 'creditors', property: 'property',
  vehicles: 'vehicles', 'bank-accounts': 'bankAccounts', insurance: 'insurance', assets: 'assets',
};

function currency(n) {
  const num = Number(n) || 0;
  return '£' + num.toLocaleString('en-GB', { minimumFractionDigits: num % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 });
}
