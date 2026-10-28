/**
 * Utseendeval som Kenta kan prova i bilen (Inställningar → Utseende).
 * plan: A = ett kort per stopp, B = nästa stort + två rader, C = en rad per stopp.
 * slide: A = Cel 3D, B = Fartlinjer, C = Smäll. Standard A + A (Kentas val 28 okt).
 */
import {useEffect, useState} from 'react';
import {loadJSON, saveJSON} from '../store';

export type Look = {plan: 'A' | 'B' | 'C'; slide: 'A' | 'B' | 'C'};
const KEY = 'rutt.look';
let cur: Look = {plan: 'A', slide: 'A'};
const subs = new Set<(l: Look) => void>();
let loaded = false;

export function getLook(): Look { return cur; }
export function setLook(p: Partial<Look>) {
  cur = {...cur, ...p};
  saveJSON(KEY, cur);
  subs.forEach(f => f(cur));
}
export function useLook(): Look {
  const [l, setL] = useState<Look>(cur);
  useEffect(() => {
    subs.add(setL);
    if (!loaded) {
      loaded = true;
      loadJSON(KEY, cur).then((v: any) => {
        const ok = (x: any) => (x === 'A' || x === 'B' || x === 'C' ? x : 'A');
        if (v && typeof v === 'object') { cur = {plan: ok(v.plan), slide: ok(v.slide)}; subs.forEach(f => f(cur)); }
      }).catch(() => {});
    }
    return () => { subs.delete(setL); };
  }, []);
  return l;
}
