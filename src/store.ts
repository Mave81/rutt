// Lokal lagring: dagens orderstatus och sparade mottagarnamn per företag.
import AsyncStorage from '@react-native-async-storage/async-storage';

const dayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

export async function loadJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const v = await AsyncStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch (e) {
    return fallback;
  }
}
export async function saveJSON(key: string, value: any) {
  try { await AsyncStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
}

export const ORDERS_KEY = (demo: boolean) => `rutt.orders.${demo ? 'demo' : 'live'}.${dayKey()}`;
export const NAMES_KEY = 'rutt.names.v1';

// Företagsnyckel för sparade namn: företagsnamn utan skiftläge/extra mellanslag.
export const companyKey = (who: string) => String(who || '').toLowerCase().replace(/\s+/g, ' ').trim();

// Lägg namnet först i listan för företaget, max 8, utan dubbletter.
export function rememberName(all: Record<string, string[]>, who: string, name: string) {
  const k = companyKey(who), n = String(name || '').trim();
  if (!k || n.length < 2) return all;
  const list = [n, ...(all[k] || []).filter(x => x.toLowerCase() !== n.toLowerCase())].slice(0, 8);
  return {...all, [k]: list};
}
