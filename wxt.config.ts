import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';

// Hedef tarayıcı (-b / --browser). Şablon değişkenleri koşul desteklemediği için komut satırından okunur.
declare const process: { argv: string[] }; // @types/node eklememek için
const argv = process.argv;
const flag = argv.findIndex((a) => a === '-b' || a === '--browser');
const target = flag >= 0 ? argv[flag + 1] : (argv.find((a) => a.startsWith('--browser='))?.split('=')[1] ?? 'chrome');
// Chrome build'i Brave'de (ve diğer Chromium tarayıcılarda) aynen çalışır; adı bunu belli etsin.
const label = target === 'chrome' ? 'chrome-brave' : '{{browser}}';

// Chrome, Brave ve Firefox için MV3 build.
export default defineConfig({
  srcDir: 'src',
  manifestVersion: 3,
  outDirTemplate: `${label}-mv{{manifestVersion}}{{modeSuffix}}`,
  zip: { artifactTemplate: `{{name}}-{{version}}-${label}.zip` },
  vite: () => ({ plugins: [preact()] }),
  manifest: ({ browser }) => ({
    name: 'Tab Mixer',
    description: 'Chrome, Brave ve Firefox için sekmeler arası ses mikseri. Her sekmenin sesini ayrı ayrı ayarla.',
    permissions: ['tabs', 'storage', 'scripting'],
    host_permissions: ['<all_urls>'],
    // Etkin sekmeye uygulanır. Kullanıcı tarayıcının kısayol ayarlarından değiştirebilir.
    commands: {
      'volume-up': {
        suggested_key: { default: 'Alt+Shift+Up' },
        description: 'Etkin sekmenin sesini %10 artır',
      },
      'volume-down': {
        suggested_key: { default: 'Alt+Shift+Down' },
        description: 'Etkin sekmenin sesini %10 azalt',
      },
      'toggle-mute': {
        suggested_key: { default: 'Alt+Shift+M' },
        description: 'Etkin sekmeyi sessize al / sesini aç',
      },
      'reset-volume': {
        suggested_key: { default: 'Alt+Shift+0' },
        description: 'Etkin sekmenin sesini %100\'e sıfırla',
      },
    },
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'tab-mixer@tab-mixer',
          strict_min_version: '128.0',
          data_collection_permissions: { required: ['none'] },
        },
      },
    }),
  }),
});
