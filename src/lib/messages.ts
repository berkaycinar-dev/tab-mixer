export interface TabInfo {
  id: number;
  windowId: number;
  title: string;
  url: string;
  favIconUrl?: string;
  audible: boolean;
  muted: boolean;
  active: boolean;
  /** 1 = %100 */
  gain: number;
}

export type Message =
  | { type: 'tm:list' }
  | { type: 'tm:set-muted'; tabId: number; muted: boolean }
  | { type: 'tm:focus'; tabId: number };

export type Response<T> = { ok: true; data: T } | { ok: false; error: string };

export async function send<T>(msg: Message): Promise<T> {
  const { browser } = await import('wxt/browser');
  const res = (await browser.runtime.sendMessage(msg)) as Response<T>;
  if (!res?.ok) throw new Error(res?.error ?? 'Yanıt yok');
  return res.data;
}
