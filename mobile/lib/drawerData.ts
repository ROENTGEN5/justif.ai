/** History has a deadline and completes independently of optional profile data. */
export async function loadDrawerData<Chat, Profile>(options: {
  cached: () => Promise<Chat[]>; history: () => Promise<Chat[]>; profile: () => Promise<Profile>;
  onCached: (chats: Chat[]) => void; onHistory: (chats: Chat[]) => void;
  onProfile: (profile: Profile) => void; onError: () => void; onSettled: () => void;
}) {
  let accepting = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  void Promise.resolve().then(options.profile).then(options.onProfile).catch(() => {});
  try {
    await Promise.race([
      (async () => {
        const cached = await options.cached().catch(() => []);
        if (accepting && cached.length) options.onCached(cached);
        const history = await options.history();
        if (accepting) options.onHistory(history);
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("History loading timed out")), 12000);
      }),
    ]);
  } catch {
    options.onError();
  } finally {
    accepting = false;
    clearTimeout(timer);
    options.onSettled();
  }
}
