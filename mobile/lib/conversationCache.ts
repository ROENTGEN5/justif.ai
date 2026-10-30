import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
const PREFIX = "@justifai_v2:";
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(operation: () => Promise<T>): Promise<T> {
  const next = queue.then(operation, operation); queue = next.catch(() => {}); return next;
}
export async function cacheOwner(): Promise<string | undefined> {
  try { return (await supabase.auth.getSession()).data.session?.user.id; } catch { return undefined; }
}
export async function clearConversationCaches(): Promise<void> {
  await serial(async () => {
    const keys = (await AsyncStorage.getAllKeys()).filter(k => k.startsWith(PREFIX) || k.startsWith("@justifai_cached_"));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  });
}
export async function readCache<T>(key: string, owner?: string): Promise<T[]> {
  const user = owner ?? await cacheOwner();
  if (!user) return [];
  return serial(async () => {
    if (await cacheOwner() !== user) return [];
    const raw = await AsyncStorage.getItem(`${PREFIX}${user}:${key}`);
    try { return raw ? JSON.parse(raw) : []; } catch { return []; }
  });
}
export async function writeCache(key: string, data: unknown[], owner?: string): Promise<void> {
  const user = owner ?? await cacheOwner();
  if (!user) return;
  await serial(async () => {
    if (await cacheOwner() !== user) return;
    try { await AsyncStorage.setItem(`${PREFIX}${user}:${key}`, JSON.stringify(data)); } catch { /* Cache is optional. */ }
  });
}
