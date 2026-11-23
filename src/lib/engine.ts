/**
 * Sayfa bağlamında (MAIN world) çalışan ses motoru.
 * Tarayıcı API'si kullanmaz; köprü content script'ten CustomEvent ile kazanç alır.
 *
 * - Web Audio: destination'a giden her bağlantı, bağlam başına bir master GainNode'dan geçer.
 * - <audio>/<video>: `volume` sarmalanır; site kendi değerini görür, gerçek ses = site × min(kazanç, 1).
 * - Kazanç > 1: CORS/DRM açısından güvenli elementler Web Audio üzerinden güçlendirilir.
 */
export const GAIN_EVENT = 'tab-mixer:gain';
export const READY_EVENT = 'tab-mixer:ready';
export const MAX_GAIN = 6;

const INSTALLED = Symbol.for('tab-mixer.engine');

export function installEngine() {
  const g = globalThis as any;
  if (g[INSTALLED]) return;
  g[INSTALLED] = true;

  let gain = 1;
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

  function ramp(param: AudioParam, ctx: BaseAudioContext, value: number) {
    try {
      param.cancelScheduledValues(ctx.currentTime);
      param.setTargetAtTime(value, ctx.currentTime, 0.015);
    } catch {
      param.value = value;
    }
  }

  // ---------------------------------------------------------------- Web Audio
  const hasWebAudio = typeof AudioNode !== 'undefined' && typeof AudioContext !== 'undefined';
  const AN = hasWebAudio ? AudioNode.prototype : null;
  const origConnect = AN?.connect as ((...a: any[]) => any) | undefined;
  const origDisconnect = AN?.disconnect as ((...a: any[]) => any) | undefined;
  const masterMap = new WeakMap<BaseAudioContext, GainNode>();
  const masters = new Set<WeakRef<GainNode>>();
  /** Sayfanın kendi Web Audio grafiğine bağladığı elementler (master zaten ölçekliyor). */
  const pageRouted = new WeakSet<HTMLMediaElement>();
  const rawCreateMES = hasWebAudio ? AudioContext.prototype.createMediaElementSource : null;

  function masterFor(dest: AudioDestinationNode): AudioNode {
    const ctx = dest.context;
    if (typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext) return dest;
    let m = masterMap.get(ctx);
    if (!m) {
      m = ctx.createGain();
      m.gain.value = gain;
      origConnect!.call(m, dest);
      masterMap.set(ctx, m);
      masters.add(new WeakRef(m));
    }
    return m;
  }

  if (AN && origConnect && origDisconnect) {
    AN.connect = function (this: AudioNode, dest: any, ...rest: any[]) {
      if (dest instanceof AudioDestinationNode && this !== masterMap.get(dest.context)) {
        origConnect.call(this, masterFor(dest), ...rest);
        return dest; // zincirleme semantiğini koru
      }
      return origConnect.call(this, dest, ...rest);
    } as typeof AN.connect;

    AN.disconnect = function (this: AudioNode, ...args: any[]) {
      if (args[0] instanceof AudioDestinationNode) {
        const m = masterMap.get(args[0].context);
        if (m && this !== m) args[0] = m;
      }
      return origDisconnect.apply(this, args);
    } as typeof AN.disconnect;

    AudioContext.prototype.createMediaElementSource = function (el: HTMLMediaElement) {
      const node = rawCreateMES!.call(this, el);
      pageRouted.add(el);
      apply(el);
      return node;
    };
  }

  // ------------------------------------------------------------ Media element
  const MP = HTMLMediaElement.prototype;
  const volDesc = Object.getOwnPropertyDescriptor(MP, 'volume')!;
  const origGetVol = volDesc.get!;
  const origSetVol = volDesc.set!;
  const siteVol = new WeakMap<HTMLMediaElement, number>();
  const trackedSet = new WeakSet<HTMLMediaElement>();
  const tracked = new Set<WeakRef<HTMLMediaElement>>();
  /** Bizim güçlendirme için Web Audio'ya aldığımız elementler. */
  const ourRouted = new WeakMap<HTMLMediaElement, GainNode>();
  let ownCtx: AudioContext | null = null;

  function track(el: HTMLMediaElement) {
    if (trackedSet.has(el)) return;
    trackedSet.add(el);
    tracked.add(new WeakRef(el));
    if (!siteVol.has(el)) siteVol.set(el, origGetVol.call(el));
  }

  function setReal(el: HTMLMediaElement, v: number) {
    v = clamp01(v);
    if (Math.abs(origGetVol.call(el) - v) > 1e-4) origSetVol.call(el, v);
  }

  function canRoute(el: HTMLMediaElement): boolean {
    if (!hasWebAudio || (el as any).mediaKeys) return false; // DRM içerik Web Audio'da sessizleşir
    const src = el.currentSrc || el.src;
    if (!src) return false;
    if (src.startsWith('blob:') || src.startsWith('data:')) return true;
    try {
      if (new URL(src, location.href).origin === location.origin) return true;
    } catch {
      return false;
    }
    return el.crossOrigin != null; // CORS istenmiş; aksi halde çıkış sessiz olurdu
  }

  function route(el: HTMLMediaElement): boolean {
    try {
      ownCtx ??= new AudioContext();
      if (ownCtx.state !== 'running') {
        // Otomatik oynatma politikası: çalışmıyorsa yönlendirme (sessizlik riski), açılınca tekrar dene.
        ownCtx.resume().then(applyAll, () => {});
        return false;
      }
      const src = rawCreateMES!.call(ownCtx, el);
      const node = ownCtx.createGain();
      node.gain.value = gain;
      origConnect!.call(src, node);
      origConnect!.call(node, ownCtx.destination);
      ourRouted.set(el, node);
      return true;
    } catch {
      return false;
    }
  }

  function apply(el: HTMLMediaElement) {
    track(el);
    const sv = siteVol.get(el)!;
    const node = ourRouted.get(el);
    if (node) {
      ramp(node.gain, node.context, gain);
      setReal(el, sv);
    } else if (pageRouted.has(el)) {
      setReal(el, sv);
    } else if (gain > 1 && canRoute(el) && route(el)) {
      setReal(el, sv);
    } else {
      setReal(el, sv * Math.min(gain, 1));
    }
  }

  function applyAll() {
    for (const m of masters) {
      const node = m.deref();
      if (node) ramp(node.gain, node.context, gain);
      else masters.delete(m);
    }
    for (const r of tracked) {
      const el = r.deref();
      if (el) apply(el);
      else tracked.delete(r);
    }
    document.querySelectorAll('audio, video').forEach((el) => apply(el as HTMLMediaElement));
  }

  Object.defineProperty(MP, 'volume', {
    configurable: true,
    enumerable: volDesc.enumerable,
    get(this: HTMLMediaElement) {
      return siteVol.has(this) ? siteVol.get(this)! : origGetVol.call(this);
    },
    set(this: HTMLMediaElement, value: number) {
      const v = Number(value);
      if (!Number.isFinite(v)) throw new TypeError("Failed to set the 'volume' property: The provided double value is non-finite.");
      if (v < 0 || v > 1) throw new DOMException(`The volume provided (${v}) is outside the range [0, 1].`, 'IndexSizeError');
      track(this);
      siteVol.set(this, v);
      apply(this);
    },
  });

  const origPlay = MP.play;
  MP.play = function (this: HTMLMediaElement, ...args: []) {
    try {
      apply(this);
    } catch {}
    return origPlay.apply(this, args);
  };

  for (const type of ['loadstart', 'play']) {
    document.addEventListener(
      type,
      (e) => {
        if (e.target instanceof HTMLMediaElement) apply(e.target);
      },
      true,
    );
  }

  // ------------------------------------------------------------- Köprü bağlantısı
  window.addEventListener(GAIN_EVENT, (e) => {
    const v = (e as CustomEvent).detail;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > MAX_GAIN || v === gain) return;
    gain = v;
    applyAll();
  });
  window.dispatchEvent(new CustomEvent(READY_EVENT));
}
