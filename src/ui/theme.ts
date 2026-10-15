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
