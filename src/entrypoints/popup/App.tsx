import { useCallback, useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { send, type TabInfo } from '@/lib/messages';

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function App() {
  const [tabs, setTabs] = useState<TabInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    send<TabInfo[]>({ type: 'tm:list' }).then(setTabs, (e) => setError(String(e.message ?? e)));
  }, []);

  useEffect(() => {
    refresh();
    const onUpdated = () => refresh();
    browser.tabs.onUpdated.addListener(onUpdated);
    browser.tabs.onRemoved.addListener(onUpdated);
    const timer = setInterval(refresh, 1500);
    return () => {
      browser.tabs.onUpdated.removeListener(onUpdated);
      browser.tabs.onRemoved.removeListener(onUpdated);
      clearInterval(timer);
    };
  }, [refresh]);

  const toggleMute = async (tab: TabInfo) => {
    setTabs((ts) => ts?.map((t) => (t.id === tab.id ? { ...t, muted: !t.muted } : t)) ?? ts);
    await send({ type: 'tm:set-muted', tabId: tab.id, muted: !tab.muted });
  };

  return (
    <main>
      <header>
        <h1>Tab Mixer</h1>
        <span class="count">{tabs ? `${tabs.length} sekme` : ''}</span>
      </header>
      {error && <p class="error">{error}</p>}
      {tabs && tabs.length === 0 && (
        <p class="empty">Şu an ses çalan sekme yok.<br />Bir sekmede ses başlatınca burada görünecek.</p>
      )}
      <ul>
        {tabs?.map((tab) => (
          <li key={tab.id} class={tab.audible ? 'tab audible' : 'tab'}>
            <button class="focus" title="Sekmeye git" onClick={() => send({ type: 'tm:focus', tabId: tab.id })}>
              {tab.favIconUrl ? <img src={tab.favIconUrl} alt="" /> : <span class="noicon" />}
              <span class="meta">
                <span class="title">{tab.title}</span>
                <span class="host">{hostOf(tab.url)}</span>
              </span>
            </button>
            <button
              class={tab.muted ? 'mute on' : 'mute'}
              title={tab.muted ? 'Sesi aç' : 'Sessize al'}
              aria-pressed={tab.muted}
              onClick={() => toggleMute(tab)}
            >
              {tab.muted ? '🔇' : '🔊'}
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
