# Tab Mixer

Chrome, Brave ve Firefox için sekmeler arası ses mikseri. Her sekmenin sesini ayrı ayrı ayarla.

## Geliştirme

```bash
npm install
npm run dev            # Chrome (Brave: dev sırasında açılan profil yerine build'i yükleyin)
npm run dev:firefox    # Firefox
```

## Build

```bash
npm run build          # .output/chrome-mv3  → Chrome & Brave
npm run build:firefox  # .output/firefox-mv3 → Firefox
```

Elle yüklemek için:
- **Chrome / Brave:** `chrome://extensions` (Brave: `brave://extensions`) → Geliştirici modu → *Paketlenmemiş öğe yükle* → `.output/chrome-mv3`
- **Firefox:** `about:debugging#/runtime/this-firefox` → *Geçici eklenti yükle* → `.output/firefox-mv3/manifest.json`
