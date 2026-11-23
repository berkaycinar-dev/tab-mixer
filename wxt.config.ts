import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';

// Chrome, Brave ve Firefox için MV3 build.
export default defineConfig({
  srcDir: 'src',
  manifestVersion: 3,
  vite: () => ({ plugins: [preact()] }),
  manifest: ({ browser }) => ({
    name: 'Tab Mixer',
    description: 'Chrome, Brave ve Firefox için sekmeler arası ses mikseri. Her sekmenin sesini ayrı ayrı ayarla.',
    permissions: ['tabs', 'storage'],
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
