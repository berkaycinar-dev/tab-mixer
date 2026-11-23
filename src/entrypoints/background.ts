import { browser, type Browser } from 'wxt/browser';
import { MAX_GAIN } from '@/lib/engine';
import type { ContentMessage, Message, Response, TabInfo } from '@/lib/messages';
import { siteOf, siteStore, tabStore } from '@/lib/state';

async function listTabs(): Promise<TabInfo[]> {
  const [tabs, states, sites] = await Promise.all([browser.tabs.query({}), tabStore.all(), siteStore.all()]);
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
      remembered: ((site) => (site ? site in sites : null))(siteOf(t.url)),
    }))
    .sort((a, b) => Number(b.audible) - Number(a.audible) || a.id - b.id);
}

const clampGain = (gain: number) => Math.min(MAX_GAIN, Math.max(0, Number(gain) || 0));

const BADGE_BOOST = '#e07a1f';
const BADGE_CUT = '#5b5bf0';

/** Seviye %100 değilse sekmeye özel rozet göster (ör. "150"). */
async function updateBadge(tabId: number, gain?: number) {
  gain ??= (await tabStore.get(tabId)).gain;
  const pct = Math.round(gain * 100);
  try {
    await browser.action.setBadgeText({ tabId, text: pct === 100 ? '' : String(pct) });
    if (pct !== 100) {
      await browser.action.setBadgeBackgroundColor({ tabId, color: pct > 100 ? BADGE_BOOST : BADGE_CUT });
      await browser.action.setBadgeTextColor?.({ tabId, color: '#ffffff' });
    }
  } catch {
    // Sekme kapanmış olabilir.
  }
}

/** Sekmeye kazancı uygula (durum + rozet + tüm frame'ler). */
async function applyGain(tabId: number, g: number) {
  await tabStore.patch(tabId, { gain: g });
  void updateBadge(tabId, g);
  const msg: ContentMessage = { type: 'tm:apply-gain', gain: g };
  await browser.tabs.sendMessage(tabId, msg).catch(() => {}); // tüm frame'lere gider
}

async function setGain(tabId: number, gain: number) {
  const g = clampGain(gain);
  await tabStore.patch(tabId, { seen: true });
  await applyGain(tabId, g);
  // Site hatırlanıyorsa kaydı da güncelle.
  const site = siteOf((await browser.tabs.get(tabId)).url);
  if (site && (await siteStore.get(site)) !== undefined) await siteStore.set(site, g);
  return g;
}

async function remember(tabId: number, on: boolean) {
  const site = siteOf((await browser.tabs.get(tabId)).url);
  if (!site) throw new Error('Bu sayfa için ses seviyesi hatırlanamaz');
  await siteStore.set(site, on ? (await tabStore.get(tabId)).gain : null);
  return null;
}

/** İçerik script'i yüklenirken sorduğunda: site kaydı varsa o, yoksa sekmenin mevcut kazancı. */
async function gainForSender(sender: Browser.runtime.MessageSender) {
  const tabId = sender.tab?.id;
  if (tabId == null) return 1;
  const saved = await siteStore.get(siteOf(sender.tab?.url));
  if (saved !== undefined) {
    await tabStore.patch(tabId, { gain: saved });
    void updateBadge(tabId, saved);
    return saved;
  }
  return (await tabStore.get(tabId)).gain;
}

async function handle(msg: Message, sender: Browser.runtime.MessageSender): Promise<unknown> {
  switch (msg.type) {
    case 'tm:list':
      return listTabs();
    case 'tm:set-muted':
      await browser.tabs.update(msg.tabId, { muted: msg.muted });
      return null;
    case 'tm:set-gain':
      return setGain(msg.tabId, msg.gain);
    case 'tm:get-gain':
      return gainForSender(sender);
    case 'tm:remember':
      return remember(msg.tabId, msg.on);
    case 'tm:focus': {
      const tab = await browser.tabs.update(msg.tabId, { active: true });
      if (tab?.windowId != null) await browser.windows.update(tab.windowId, { focused: true });
      return null;
    }
  }
}

const STEP = 0.1;

async function runCommand(command: string, tab?: Browser.tabs.Tab) {
  tab ??= (await browser.tabs.query({ active: true, currentWindow: true }))[0];
  if (tab?.id == null) return;
  const { gain } = await tabStore.get(tab.id);
  switch (command) {
    case 'volume-up':
    case 'volume-down': {
      const next = gain + (command === 'volume-up' ? STEP : -STEP);
      await setGain(tab.id, Math.round(next * 100) / 100); // kayan nokta birikmesini önle
      break;
    }
    case 'reset-volume':
      await setGain(tab.id, 1);
      break;
    case 'toggle-mute':
      await browser.tabs.update(tab.id, { muted: !tab.mutedInfo?.muted });
      break;
  }
}

/** Kurulumdan önce açık olan sekmelere motoru enjekte et (yenilemeye gerek kalmasın). */
async function injectIntoOpenTabs() {
  const tabs = await browser.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  await Promise.all(
    tabs.map(async (t) => {
      if (t.id == null || t.discarded) return;
      const target = { tabId: t.id, allFrames: true };
      try {
        await browser.scripting.executeScript({ target, files: ['/content-scripts/volume-main.js'], world: 'MAIN' });
        await browser.scripting.executeScript({ target, files: ['/content-scripts/volume-bridge.js'] });
      } catch {
        // Kısıtlı sayfa (mağaza, about:, vb.) — yok say.
      }
    }),
  );
}

export default defineBackground(() => {
  // Ses çıkaran sekmeleri hatırla (durdurulsa bile listede kalsın).
  browser.tabs.onUpdated.addListener((tabId, info) => {
    if (info.audible) void tabStore.patch(tabId, { seen: true });
    // Hatırlanan siteye gidildi: içerik script'i sormadan önce de durum doğru olsun
    // (SPA içi gezinmeler ve script'in yüklenemediği durumlar dahil).
    if (info.url) {
      void siteStore.get(siteOf(info.url)).then((g) => {
        if (g !== undefined) return applyGain(tabId, g);
      });
    }
    // Firefox gezinmede sekmeye özel rozeti sıfırlar; yeniden bas.
    if (info.status) void updateBadge(tabId);
  });
  browser.tabs.onRemoved.addListener((tabId) => void tabStore.remove(tabId));
  void browser.tabs.query({ audible: true }).then((tabs) => {
    for (const t of tabs) if (t.id != null) void tabStore.patch(t.id, { seen: true });
  });

  // Firefox manifest'teki content script'leri açık sekmelere kendisi enjekte eder.
  if (!import.meta.env.FIREFOX) {
    browser.runtime.onInstalled.addListener(({ reason }) => {
      if (reason === 'install' || reason === 'update') void injectIntoOpenTabs();
    });
  }

  browser.commands.onCommand.addListener((command, tab) => void runCommand(command, tab));

  browser.runtime.onMessage.addListener((msg: Message, sender, sendResponse) => {
    handle(msg, sender).then(
      (data) => sendResponse({ ok: true, data } satisfies Response<unknown>),
      (e) => sendResponse({ ok: false, error: String(e?.message ?? e) } satisfies Response<unknown>),
    );
    return true; // asenkron yanıt
  });
});
