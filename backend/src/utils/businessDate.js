import { requireContext } from '../core/context/requestContext.js';
import { Organisation } from '../modules/organisations/organisation.model.js';

const formatters = new Map();

export function businessDateFor(date, timeZone = 'Asia/Kolkata') {
  if (!formatters.has(timeZone)) {
    formatters.set(timeZone, new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }));
  }
  return formatters.get(timeZone).format(date);
}

export function financialYearLabel(businessDate, fyStartMonth = 4) {
  const [year, month] = businessDate.split('-').map(Number);
  const start = month >= fyStartMonth ? year : year - 1;
  return fyStartMonth === 1 ? String(start) : `${String(start).slice(2)}-${String(start + 1).slice(2)}`;
}

export async function getOrgProfile() {
  const { organisationId } = requireContext();
  const org = await Organisation.findById(organisationId).select('timezone fyStartMonth').lean();
  return { timezone: org?.timezone ?? 'Asia/Kolkata', fyStartMonth: org?.fyStartMonth ?? 4 };
}

export async function todayContext(now = new Date()) {
  const profile = await getOrgProfile();
  const businessDate = businessDateFor(now, profile.timezone);
  return { ...profile, now, businessDate, financialYear: financialYearLabel(businessDate, profile.fyStartMonth) };
}

export function dayRange(from, to, timeZone) {
  const offset = timeZoneOffsetMinutes(timeZone);
  const start = (d) => new Date(Date.parse(`${d}T00:00:00Z`) - offset * 60000);
  return {
    ...(from && { $gte: start(from) }),
    ...(to && { $lt: new Date(start(to).getTime() + 86400000) }),
  };
}

function timeZoneOffsetMinutes(timeZone, at = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' }).formatToParts(at);
  const match = /GMT([+-])(\d{2}):?(\d{2})?/.exec(parts.find((p) => p.type === 'timeZoneName')?.value ?? '');
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3] ?? 0);
  return match[1] === '-' ? -minutes : minutes;
}
