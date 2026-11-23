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
const PAGE_SIZE = 5;

export function App() {
  const [tabs, setTabs] = useState<TabInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
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

  const toggleRemember = (tab: TabInfo) => {
    const on = !tab.remembered;
    // Aynı siteden açık diğer sekmeler de aynı durumu göstersin.
    const host = hostOf(tab.url);
    setTabs((ts) => ts?.map((t) => (hostOf(t.url) === host ? { ...t, remembered: on } : t)) ?? ts);
    send({ type: 'tm:remember', tabId: tab.id, on }).catch((e) => setError(String(e.message ?? e)));
  };

  const closeTab = (tab: TabInfo) => {
    setTabs((ts) => ts?.filter((t) => t.id !== tab.id) ?? ts);
    send({ type: 'tm:close', tabId: tab.id }).catch((e) => {
      setError(String(e.message ?? e));
      refresh(); // kapanmadıysa listeye geri gelsin
    });
  };

  const setGain = (tab: TabInfo, pct: number) => {
    const gain = Math.round(pct) / 100;
    patchLocal(tab.id, { gain });
    void send({ type: 'tm:set-gain', tabId: tab.id, gain });
  };

  const pageCount = Math.max(1, Math.ceil((tabs?.length ?? 0) / PAGE_SIZE));
  // Sekme kapanıp sayfa sayısı azalırsa boş sayfada kalma.
  const current = Math.min(page, pageCount - 1);
  const visible = tabs?.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

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
        {visible?.map((tab) => {
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
              {tab.remembered !== null && (
                <button
                  class={tab.remembered ? 'icon on' : 'icon dim'}
                  title={
                    tab.remembered
                      ? `${hostOf(tab.url)} için ses seviyesi hatırlanıyor — kapatmak için tıkla`
                      : `${hostOf(tab.url)} için bu ses seviyesini hatırla`
                  }
                  aria-pressed={tab.remembered}
                  onClick={() => toggleRemember(tab)}
                >
                  📌
                </button>
              )}
              <button
                class={tab.muted ? 'icon on' : 'icon'}
                title={tab.muted ? 'Sesi aç' : 'Sessize al'}
                aria-pressed={tab.muted}
                onClick={() => toggleMute(tab)}
              >
                {tab.muted ? '🔇' : '🔊'}
              </button>
              <button class="icon close" title="Sekmeyi kapat" aria-label={`${tab.title} sekmesini kapat`} onClick={() => closeTab(tab)}>
                ✕
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
      {pageCount > 1 && (
        <nav class="pager" aria-label="Sayfalar">
          {Array.from({ length: pageCount }, (_, i) => (
            <button
              key={i}
              class={i === current ? 'page on' : 'page'}
              aria-current={i === current ? 'page' : undefined}
              title={`${i * PAGE_SIZE + 1}–${Math.min((i + 1) * PAGE_SIZE, tabs!.length)}. sekmeler`}
              onClick={() => setPage(i)}
            >
              {i + 1}
              {/* Bu sayfada şu an ses çalan sekme var mı */}
              {tabs!.slice(i * PAGE_SIZE, (i + 1) * PAGE_SIZE).some((t) => t.audible) && i !== current && (
                <span class="dot" aria-hidden="true" />
              )}
            </button>
          ))}
        </nav>
      )}
      <footer>Tekerlek: ±5% · Yüzdeye tıkla: sıfırla · 📌 siteyi hatırla</footer>
    </main>
  );
}
