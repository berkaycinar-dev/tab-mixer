import { browser } from 'wxt/browser';
import { GAIN_EVENT, READY_EVENT } from '@/lib/engine';
import type { ContentMessage, Response } from '@/lib/messages';

// İzole bağlamda çalışır: arka plan ile sayfa motoru arasında köprü.
export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  allFrames: true,
  matchAboutBlank: true,
  main() {
    let gain = 1;
    const push = () => window.dispatchEvent(new CustomEvent(GAIN_EVENT, { detail: gain }));

    window.addEventListener(READY_EVENT, push);
    browser.runtime.onMessage.addListener((msg: ContentMessage) => {
      if (msg?.type === 'tm:apply-gain') {
        gain = msg.gain;
        push();
      }
    });
    browser.runtime
      .sendMessage({ type: 'tm:get-gain' })
      .then((res: Response<number>) => {
        if (res?.ok) {
          gain = res.data;
          push();
        }
      })
      .catch(() => {});
  },
});
