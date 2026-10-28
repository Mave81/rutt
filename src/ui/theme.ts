// RUTT – färger och små hjälpare som delas av alla vyer.
// Två lägen (Kentas märkesfärger): mörkt = #000/#1B1B1B/#242527, ljust = vitt kort på ljusgrå botten.
// Färg = betydelse: orange = din handling, grönt = live/klart, rött = trasigt/återkallat, blått = människor.
export type Mode = 'dark' | 'light';
export const DARK = {
  mode: 'dark' as Mode,
  // Skarpa färger (3.57): rena och mättade, hårda kanter. Djup = ljus kant upptill + hård skugga nertill, ingen glöd.
  bg: '#0E1116', panel: '#171B22', panel2: '#20252E', edge: '#2A303B',
  ink: '#FFFFFF', dim: '#B3BAC6', faint: '#8C94A2',
  accent: '#FF8A1F', accentInk: '#FF9A3C', accentSoft: '#2E1C0B', onAccent: '#000000',
  accentHi: '#FFB05A', accentLo: '#C85A00',
  accent2: '#22D48A', okSoft: '#0D2A1F', okHi: '#5CF2B0', okLo: '#0B8A57', okLine: '#06603C', okText: '#3BE39B',
  warn: '#FFC933', warnSoft: '#2C2410',
  bad: '#FF4D4D', badSoft: '#331417',
  people: '#2AA8FF', peopleSoft: '#0D2740',
  noteBg: '#20252E', noteInk: '#E6E9EF',
  toast: '#20252E', sigBg: '#FFFFFF', overlay: 'rgba(0,0,0,0.62)',
  bubbleIn: '#20252E', bubbleOut: '#3A2610',
  trkA: '#0B0E13', trkB: '#1A1F27',
};
export const LIGHT: typeof DARK = {
  mode: 'light',
  bg: '#F2F5FA', panel: '#FFFFFF', panel2: '#EEF2F8', edge: '#DCE3EE',
  ink: '#0B1220', dim: '#3E4A5C', faint: '#5B6678',
  accent: '#FF8A1F', accentInk: '#B35300', accentSoft: '#FFF0E0', onAccent: '#000000',
  accentHi: '#FFB05A', accentLo: '#C85A00',
  accent2: '#14B474', okSoft: '#E2F7EE', okHi: '#4BE6A2', okLo: '#0B8A57', okLine: '#06603C', okText: '#0B7A4C',
  warn: '#8F6200', warnSoft: '#FFF4D6',
  bad: '#D92D2D', badSoft: '#FDE8E8',
  people: '#0A84E0', peopleSoft: '#E3F1FD',
  noteBg: '#EEF2F8', noteInk: '#3E4A5C',
  toast: '#FFFFFF', sigBg: '#FFFFFF', overlay: 'rgba(11,18,32,0.45)',
  bubbleIn: '#FFFFFF', bubbleOut: '#FFF0E0',
  trkA: '#DCE3EE', trkB: '#EEF2F8',
};
// C är ett levande objekt: applyTheme() byter värdena och bygger om alla stilar som registrerats via themed().
export const C: typeof DARK = {...DARK};
const builders: Array<() => void> = [];
export function themed<T extends object>(mk: () => T): T {
  const out: any = {};
  const build = () => { const v: any = mk(); for (const k of Object.keys(out)) delete out[k]; Object.assign(out, v); };
  build(); builders.push(build);
  return out as T;
}
export function applyTheme(m: Mode) {
  Object.assign(C, m === 'light' ? LIGHT : DARK);
  builders.forEach(b => b());
}
export const hhmm = (d: Date | null | undefined) =>
  d ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '–';

// ---- Tider som Opter: {hhmm, date:'YYYY-MM-DD', hasDate} → "13:30", "fre 07:00", "fre 16/10" ----
const DAYS = ['sön', 'mån', 'tis', 'ons', 'tors', 'fre', 'lör'];
export const todayYmd = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export function whenText(t: any): string {
  if (!t) return '';
  const today = todayYmd();
  const other = t.date && t.date !== today;
  let day = '';
  if (other) {
    const [y, m, d] = String(t.date).split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const diff = Math.round((dt.getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);
    day = diff === 1 ? 'imorgon' : diff === -1 ? 'igår' : diff > 1 && diff < 7 ? DAYS[dt.getDay()] : `${DAYS[dt.getDay()]} ${d}/${m}`;
  }
  if (t.hhmm) return day ? `${day} ${t.hhmm}` : t.hhmm;
  return day || 'idag';
}
export const isFutureDay = (t: any) => !!(t && t.date && t.date > todayYmd());

// ---- Svenska telefonnummer: 08-518 332 62, 070-413 97 11, 010-445 72 71 ----
export function prettyPhone(n: string): string {
  const d = String(n || '').replace(/[^0-9]/g, '');
  if (!/^0\d{6,10}$/.test(d)) return n;
  const area = d.startsWith('08') ? 2 : 3;
  const a = d.slice(0, area), r = d.slice(area);
  const g = r.length === 8 ? [3, 3, 2] : r.length === 7 ? (area === 2 ? [3, 2, 2] : [3, 2, 2]) : r.length === 6 ? [2, 2, 2] : r.length === 5 ? [3, 2] : [r.length];
  const out: string[] = []; let i = 0;
  for (const k of g) { out.push(r.slice(i, i + k)); i += k; }
  return `${a}-${out.filter(Boolean).join(' ')}`;
}

// Samsung ritar typsnittet en aning bredare än React Native mäter → sista ordet i en bubbla kan hamna på en
// rad som inte syns. Några hårda mellanslag sist ger bubblan marginal (syns inte, bryts inte bort).
export const slack = (t: string) => (t ? t + '\u00A0'.repeat(Math.min(5, 2 + Math.ceil(String(t).length / 14))) : t);

// Typsnitt (registrerade i MainApplication.kt, standard för all text via src/fontpatch.js):
//  cond = Barlow Semi Condensed för namn och rubriker (långa firmanamn får plats), mono = IBM Plex Mono för nummer (0 ≠ O).
export const FONT = {body: 'Barlow', cond: 'BarlowCond', mono: 'PlexMono'};
export const R = 6; // hörnradie för kort, knappar och rader
