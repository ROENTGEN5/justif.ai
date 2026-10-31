# Justif.ai branding

The circular blue-and-mint Justifai wordmark is the app's shared brand.
The reference artwork is `/logo.png` at the project root (the older reduced copy is `assets/logo.png`).

- `brand-icon.png`: 1024px optimized PNG for the launcher fallback (441,064 bytes).
- `brand-adaptive.png`: 1024px optimized PNG with additional margins for Android's adaptive icon mask (353,054 bytes).
- `brand-logo.jpg`: 384px JPEG for every in-app `BrandLogo` (15,338 bytes). Covers the current maximum 120-point logo at 3x density, with memory/disk caching.
- `brand-splash.png`: 540px PNG for the 180-point splash artwork at 3x density (111,583 bytes).
- `brand-favicon.png`: dedicated 64px web favicon (2,717 bytes).
- `components/BrandLogo.tsx`: shared in-app renderer used by authentication, chat welcome, drawer, and sign-out confirmation.

The square exports were prepared from the original reference with image generation; the original files remain untouched. Older J/scales icon and splash files are no longer referenced by the app configuration.

## Optimization

All five exports total 923,756 bytes, down from 3,396,611 bytes for the two original square exports (72.8% smaller, before APK packaging). The in-app image is 99.2% smaller on disk than the former 1,995,566-byte icon. A full RGBA decode would use about 0.56 MiB rather than 6.0 MiB (90.6% less); actual device allocation depends on Expo's downsampling and image cache. This is an asset calculation, not a measured app-wide memory improvement.

Preparation uses Sharp 0.34.2 in the ignored `output/branding-tools` directory, with no added app dependency. Resizing and PNG palette/JPEG encoding preserve the artwork; there is no new generated design. High-resolution backups live in ignored `output/branding-originals`.

From the repository root:

```powershell
npm install --prefix output/branding-tools --no-save --package-lock=false --ignore-scripts sharp@0.34.2
node mobile/scripts/optimize-brand.cjs output/branding-originals
```

Prefer the full-resolution backups when regenerating. The script can also use the current optimized assets if no source directory is passed. Exported images were decoded and visually inspected after compression.

Launcher and splash changes require a new native build and installation. Web previews do not verify Android launcher masks.
