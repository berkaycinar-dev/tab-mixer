import { browser } from 'wxt/browser';

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

/** Popup / content → background */
export type Message =
  | { type: 'tm:list' }
  | { type: 'tm:set-muted'; tabId: number; muted: boolean }
  | { type: 'tm:set-gain'; tabId: number; gain: number }
  | { type: 'tm:get-gain' }
  | { type: 'tm:focus'; tabId: number };

/** Background → content */
export type ContentMessage = { type: 'tm:apply-gain'; gain: number };

export type Response<T> = { ok: true; data: T } | { ok: false; error: string };

export async function send<T>(msg: Message): Promise<T> {
  const res = (await browser.runtime.sendMessage(msg)) as Response<T>;
  if (!res?.ok) throw new Error(res?.error ?? 'Yanıt yok');
  return res.data;
}
