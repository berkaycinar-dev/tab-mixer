import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { send, type TabInfo } from '@/lib/messages';
import { MAX_GAIN } from '@/lib/engine';

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

const MAX_PCT = MAX_GAIN * 100;

export function App() {
  const [tabs, setTabs] = useState<TabInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Sürüklenen sekme: periyodik yenileme sürgüyü geri zıplatmasın. */
  const editing = useRef<number | null>(null);

  const refresh = useCallback(() => {
    send<TabInfo[]>({ type: 'tm:list' }).then(
      (fresh) =>
        setTabs((old) =>
          fresh.map((t) =>
            t.id === editing.current ? { ...t, gain: old?.find((o) => o.id === t.id)?.gain ?? t.gain } : t,
          ),
        ),
      (e) => setError(String(e.message ?? e)),
    );
  }, []);

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    browser.tabs.onUpdated.addListener(onChange);
    browser.tabs.onRemoved.addListener(onChange);
    const timer = setInterval(refresh, 1500);
    return () => {
      browser.tabs.onUpdated.removeListener(onChange);
      browser.tabs.onRemoved.removeListener(onChange);
      clearInterval(timer);
    };
  }, [refresh]);

  const patchLocal = (id: number, p: Partial<TabInfo>) =>
    setTabs((ts) => ts?.map((t) => (t.id === id ? { ...t, ...p } : t)) ?? ts);

  const toggleMute = (tab: TabInfo) => {
    patchLocal(tab.id, { muted: !tab.muted });
    void send({ type: 'tm:set-muted', tabId: tab.id, muted: !tab.muted });
  };

  const setGain = (tab: TabInfo, pct: number) => {
    const gain = Math.round(pct) / 100;
    patchLocal(tab.id, { gain });
    void send({ type: 'tm:set-gain', tabId: tab.id, gain });
  };

  return (
    <main>
      <header>
        <h1>Tab Mixer</h1>
        <span class="count">{tabs ? `${tabs.length} sekme` : ''}</span>
      </header>
      {error && <p class="error">{error}</p>}
      {tabs && tabs.length === 0 && (
        <p class="empty">
          Şu an ses çalan sekme yok.
          <br />
          Bir sekmede ses başlatınca burada görünecek.
        </p>
      )}
      <ul>
        {tabs?.map((tab) => {
          const pct = Math.round(tab.gain * 100);
          return (
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
              <div class="volume">
                <input
                  type="range"
                  min={0}
                  max={MAX_PCT}
                  step={5}
                  value={pct}
                  aria-label={`${tab.title} ses seviyesi`}
                  class={pct > 100 ? 'boost' : ''}
                  style={{ '--fill': `${(pct / MAX_PCT) * 100}%`, '--unity': `${(100 / MAX_PCT) * 100}%` }}
                  onPointerDown={() => (editing.current = tab.id)}
                  onPointerUp={() => (editing.current = null)}
                  onInput={(e) => setGain(tab, Number(e.currentTarget.value))}
                  onWheel={(e) => {
                    e.preventDefault();
                    setGain(tab, Math.min(MAX_PCT, Math.max(0, pct + (e.deltaY < 0 ? 5 : -5))));
                  }}
                />
                <button
                  class={pct > 100 ? 'pct boost' : 'pct'}
                  title="%100'e sıfırla"
                  onClick={() => setGain(tab, 100)}
                >
                  {pct}%
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <footer>Tekerlek: ±5% · Yüzdeye tıkla: sıfırla</footer>
    </main>
  );
}
