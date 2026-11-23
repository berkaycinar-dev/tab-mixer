import { browser, type Browser } from 'wxt/browser';
import type { Message, Response, TabInfo } from '@/lib/messages';
import { tabStore } from '@/lib/state';

async function listTabs(): Promise<TabInfo[]> {
  const [tabs, states] = await Promise.all([browser.tabs.query({}), tabStore.all()]);
  return tabs
    .filter((t) => {
      if (t.id == null) return false;
      const s = states[t.id];
      return t.audible || s?.seen || (s && s.gain !== 1);
    })
    .map((t) => ({
      id: t.id!,
      windowId: t.windowId,
      title: t.title || t.url || 'Adsız sekme',
      url: t.url ?? '',
      favIconUrl: t.favIconUrl,
      audible: !!t.audible,
      muted: !!t.mutedInfo?.muted,
      active: t.active,
      gain: states[t.id!]?.gain ?? 1,
    }))
    .sort((a, b) => Number(b.audible) - Number(a.audible) || a.id - b.id);
}

async function handle(msg: Message, _sender: Browser.runtime.MessageSender): Promise<unknown> {
  switch (msg.type) {
    case 'tm:list':
      return listTabs();
    case 'tm:set-muted':
      await browser.tabs.update(msg.tabId, { muted: msg.muted });
      return null;
    case 'tm:focus': {
      const tab = await browser.tabs.update(msg.tabId, { active: true });
      if (tab?.windowId != null) await browser.windows.update(tab.windowId, { focused: true });
      return null;
    }
  }
}

export default defineBackground(() => {
  // Ses çıkaran sekmeleri hatırla (durdurulsa bile listede kalsın).
  browser.tabs.onUpdated.addListener((tabId, info) => {
    if (info.audible) void tabStore.patch(tabId, { seen: true });
  });
  browser.tabs.onRemoved.addListener((tabId) => void tabStore.remove(tabId));
  void browser.tabs.query({ audible: true }).then((tabs) => {
    for (const t of tabs) if (t.id != null) void tabStore.patch(t.id, { seen: true });
  });

  browser.runtime.onMessage.addListener((msg: Message, sender, sendResponse) => {
    handle(msg, sender).then(
      (data) => sendResponse({ ok: true, data } satisfies Response<unknown>),
      (e) => sendResponse({ ok: false, error: String(e?.message ?? e) } satisfies Response<unknown>),
    );
    return true; // asenkron yanıt
  });
});
