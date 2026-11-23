import { browser } from 'wxt/browser';

/** Sekme başına oturum durumu (tarayıcı kapanınca silinir). */
export interface TabState {
  gain: number;
  /** Bu oturumda en az bir kez ses çıkardı mı */
  seen: boolean;
}

type StateMap = Record<string, TabState>;
const KEY = 'tabStates';
const DEFAULT: TabState = { gain: 1, seen: false };

// Yazmaları sıraya koy: sürgü hızlı değişince kayıp güncelleme olmasın.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => {});
  return next;
}

async function all(): Promise<StateMap> {
  const r = await browser.storage.session.get(KEY);
  return (r[KEY] as StateMap | undefined) ?? {};
}

/** http(s) sayfalarının host'u; diğerleri için null (site hatırlama uygulanmaz). */
export function siteOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.hostname : null;
  } catch {
    return null;
  }
}

/** Site başına kalıcı kazanç (tarayıcı kapansa da kalır). */
const SITE_KEY = 'siteGains';
type SiteMap = Record<string, number>;

async function allSites(): Promise<SiteMap> {
  const r = await browser.storage.local.get(SITE_KEY);
  return (r[SITE_KEY] as SiteMap | undefined) ?? {};
}

export const siteStore = {
  all: allSites,
  async get(site: string | null): Promise<number | undefined> {
    return site ? (await allSites())[site] : undefined;
  },
  set(site: string, gain: number | null) {
    return serial(async () => {
      const map = await allSites();
      if (gain == null) delete map[site];
      else map[site] = gain;
      await browser.storage.local.set({ [SITE_KEY]: map });
    });
  },
};

export const tabStore = {
  all,
  async get(tabId: number): Promise<TabState> {
    return { ...DEFAULT, ...(await all())[tabId] };
  },
  patch(tabId: number, p: Partial<TabState>) {
    return serial(async () => {
      const map = await all();
      map[tabId] = { ...DEFAULT, ...map[tabId], ...p };
      await browser.storage.session.set({ [KEY]: map });
      return map[tabId];
    });
  },
  remove(tabId: number) {
    return serial(async () => {
      const map = await all();
      delete map[tabId];
      await browser.storage.session.set({ [KEY]: map });
    });
  },
};
