// RUTT – färger och små hjälpare som delas av alla vyer.
export const C = {
  bg: '#1f1d1a', panel: '#272420', panel2: '#2f2b26', edge: '#3a352f',
  ink: '#efe9e0', dim: '#b3a89a', faint: '#857b70',
  accent: '#e8a24c', accent2: '#7fb08a', bad: '#d2766a',
  onAccent: '#2a1d0c',
  noteBg: '#3a2f20', noteInk: '#f0d3a6',
};
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
