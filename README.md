# Tab Mixer

Chrome, Brave ve Firefox için sekmeler arası ses mikseri. Her sekmenin sesini ayrı ayrı ayarla.

## Özellikler

- Ses çalan (veya bu oturumda çalmış) sekmelerin listesi, sekmeye atlama
- Sekme başına sessize alma
- Sekme başına ses seviyesi: %0–%600 (tekerlekle ±%5, yüzdeye tıklayınca %100)
- 📌 Site bazlı hatırlama: işaretlenen sitenin seviyesi kalıcı olarak saklanır; o siteye açılan yeni sekmeler ve yenilemeler aynı seviyeyle başlar

### Klavye kısayolları (etkin sekme)

| Kısayol | İşlem |
|---|---|
| `Alt+Shift+↑` / `Alt+Shift+↓` | Sesi %10 artır / azalt |
| `Alt+Shift+0` | %100'e sıfırla |
| `Alt+Shift+M` | Sessize al / sesi aç |

Değiştirmek için: Chrome `chrome://extensions/shortcuts`, Brave `brave://extensions/shortcuts`, Firefox `about:addons` → ⚙ → *Eklenti kısayollarını yönet*.
Başka bir eklenti aynı kısayolu kullanıyorsa tarayıcı atamayabilir; o sayfadan elle atayın.

## İkonlar

`public/icon/*.png` dosyaları `node scripts/gen-icons.mjs` ile üretilir (bağımlılık gerektirmez).

### Bilinen sınırlamalar

- %100 üzeri güçlendirme yalnızca Web Audio'ya alınabilen medyada çalışır (aynı origin, `blob:`/MSE — ör. YouTube — veya CORS'lu kaynaklar). DRM'li ve CORS'suz çapraz origin medya %100'de sınırlanır.
- Mağaza sayfaları, `chrome://` / `about:` gibi kısıtlı sayfalarda ses seviyesi ayarlanamaz (sessize alma çalışır).

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
