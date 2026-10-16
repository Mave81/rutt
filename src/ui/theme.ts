// RUTT – färger och små hjälpare som delas av alla vyer.
// Två lägen (Kentas märkesfärger): mörkt = #000/#1B1B1B/#242527, ljust = vitt kort på ljusgrå botten.
// Färg = betydelse: orange = din handling, grönt = live/klart, rött = trasigt/återkallat, blått = människor.
export type Mode = 'dark' | 'light';
export const DARK = {
  mode: 'dark' as Mode,
  bg: '#121212', panel: '#1B1B1B', panel2: '#242527', edge: '#2a2b2e',
  ink: '#FFFFFF', dim: '#a8a9ad', faint: '#6e6f73',
  accent: '#FF9117', accentInk: '#FF9117', accentSoft: '#2b1d0c', onAccent: '#000000',
  accent2: '#2d9c72', okSoft: '#0f2a20',
  bad: '#ff5a4a', badSoft: '#2e1210',
  people: '#2796f2', peopleSoft: '#0e2236',
  noteBg: '#242527', noteInk: '#e4e4e6',
  toast: '#242527', sigBg: '#242527', overlay: 'rgba(0,0,0,0.6)',
  bubbleIn: '#242527', bubbleOut: '#3a2610',
};
export const LIGHT: typeof DARK = {
  mode: 'light',
  bg: '#f0f2f5', panel: '#FFFFFF', panel2: '#f5f6f8', edge: '#e4e7eb',
  ink: '#0b0f14', dim: '#465361', faint: '#7e8794',
  accent: '#FF9117', accentInk: '#a35700', accentSoft: '#fff1e2', onAccent: '#000000',
  accent2: '#1aa64b', okSoft: '#e5f6ea',
  bad: '#d93a2b', badSoft: '#fdeceb',
  people: '#1f7fd1', peopleSoft: '#e6f1fb',
  noteBg: '#f5f6f8', noteInk: '#465361',
  toast: '#FFFFFF', sigBg: '#f5f6f8', overlay: 'rgba(11,15,20,0.45)',
  bubbleIn: '#FFFFFF', bubbleOut: '#fff1e2',
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
