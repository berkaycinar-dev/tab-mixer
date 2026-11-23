import { installEngine } from '@/lib/engine';

// Sayfa bağlamında çalışır: Web Audio ve medya elementlerini yakalar.
export default defineContentScript({
  matches: ['<all_urls>'],
  world: 'MAIN',
  runAt: 'document_start',
  allFrames: true,
  matchAboutBlank: true,
  main() {
    installEngine();
  },
});
