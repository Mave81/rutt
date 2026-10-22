/*
 * Notisljud per händelse. RUTT:s egna ljud ligger i android/app/src/main/res/raw/rutt_*.wav.
 * Android låser ljudet på en notiskanal, så varje ljud har en egen kanal ("RUTT · Pling" osv.) – se RuttTools.kt.
 */
import {NativeModules} from 'react-native';
import {loadJSON, saveJSON} from './store';

export type SoundEvent = 'order' | 'revoked' | 'chat' | 'reminder';
export const SOUND_EVENTS: {k: SoundEvent; label: string; sub: string}[] = [
  {k: 'order', label: 'Ny order', sub: 'När kontoret skickar ett uppdrag'},
  {k: 'revoked', label: 'Återkallad order', sub: 'När kontoret drar tillbaka en order'},
  {k: 'chat', label: 'Chatt från kontoret', sub: 'Nytt meddelande i Opter-chatten'},
  {k: 'reminder', label: 'Påminnelse', sub: 'Order som inte bekräftats, var 15:e min'},
];
export const SOUNDS: {k: string; label: string}[] = [
  {k: 'dubbel', label: 'Dubbelpip'}, {k: 'pling', label: 'Pling'}, {k: 'retro', label: 'Retro-chatt'},
  {k: 'tuta', label: 'Tuta'}, {k: 'klocka', label: 'Klocka'}, {k: 'varning', label: 'Varning'},
  {k: 'standard', label: 'Telefonens standard'}, {k: 'tyst', label: 'Tyst (bara vibration)'},
];
export const DEFAULT_SOUNDS: Record<SoundEvent, string> = {order: 'dubbel', revoked: 'varning', chat: 'retro', reminder: 'pling'};
const KEY = 'rutt.sounds.v1';
let cur: Record<string, string> = {...DEFAULT_SOUNDS};
let names: Record<string, string> = {}; // custom:<uri> → titel
loadJSON(KEY, null).then((v: any) => { if (v && typeof v === 'object') { cur = {...DEFAULT_SOUNDS, ...(v.sel || {})}; names = v.names || {}; } });

export const soundOf = (e: SoundEvent) => cur[e] || DEFAULT_SOUNDS[e];
export const soundLabel = (k: string) => (k.startsWith('custom:') ? names[k] || 'Eget ljud' : (SOUNDS.find(s => s.k === k) || {label: k}).label);
export function setSound(e: SoundEvent, k: string, title?: string) {
  cur = {...cur, [e]: k};
  if (title && k.startsWith('custom:')) names = {...names, [k]: title};
  saveJSON(KEY, {sel: cur, names});
}
export function allSounds() { return {...cur}; }
export function playSound(k: string) {
  const T: any = NativeModules.RuttTools;
  if (T && T.playSound) T.playSound(k).catch(() => {});
}
export async function pickCustom(e: SoundEvent): Promise<string | null> {
  const T: any = NativeModules.RuttTools;
  if (!T || !T.pickSound) return null;
  const r: any = await T.pickSound(soundOf(e)).catch(() => null);
  if (!r || !r.uri) return null;
  const k = 'custom:' + r.uri;
  setSound(e, k, r.title || 'Eget ljud');
  return k;
}
/** Notis med händelsens ljud. Faller tillbaka på den gamla notisen om RuttTools saknas. */
export function notifyWith(e: SoundEvent, id: number, title: string, text: string): Promise<boolean> {
  const T: any = NativeModules.RuttTools, RL: any = NativeModules.RuttLocation;
  if (T && T.notify) return T.notify(id, title, text, soundOf(e));
  if (RL && RL.notify) return RL.notify(id, title, text);
  return Promise.resolve(false);
}
export function copyText(t: string): Promise<boolean> {
  const T: any = NativeModules.RuttTools;
  return T && T.copy ? T.copy(t) : Promise.resolve(false);
}
export function addContact(name: string, phone: string, note = ''): Promise<boolean> {
  const T: any = NativeModules.RuttTools;
  return T && T.addContact ? T.addContact(name, phone, note) : Promise.resolve(false);
}
