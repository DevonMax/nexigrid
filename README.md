# Nexigrid

A zero-dependency CSS + JS UI framework.

Nexigrid provides ready-to-use, themeable components built on modern CSS
(custom properties, logical properties) and small, framework-free vanilla
JavaScript modules. No build step is required.

This repository ships the **compiled distribution** only:

- `assets/css/nexigrid.css` · `nexigrid.min.css` · `nexigrid.css.map`
- `assets/js/ng-all.min.js` (full bundle) · `assets/js/min/*.js` (per-component modules)
- `assets/nexigrid.manifest.json` (component catalog)

## Installation

### Local / self-hosted

```html
<link rel="stylesheet" href="assets/css/nexigrid.min.css">

<!-- Full bundle: every component -->
<script type="module" src="assets/js/ng-all.min.js"></script>
```

Or load only what you use (each module pulls its own dependencies):

```html
<link rel="stylesheet" href="assets/css/nexigrid.min.css">
<script type="module" src="assets/js/min/ng_core.js"></script>   <!-- required -->
<script type="module" src="assets/js/min/ng_modal.js"></script>
```

### CDN (jsDelivr)

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/DevonMax/nexigrid/assets/css/nexigrid.min.css">
<script type="module" src="https://cdn.jsdelivr.net/gh/DevonMax/nexigrid/assets/js/ng-all.min.js"></script>
```

Pin a specific version with a git tag or commit, e.g.
`…/gh/DevonMax/nexigrid@v1.1.0/…`.

## Usage

Loading `ng_core` (or the full bundle) mounts every component found in the DOM
and keeps watching for dynamically added markup — no manual initialization is
needed. Add the component markup with its `ng-*` classes; the full catalog
(names, versions, status) is listed in
[`assets/nexigrid.manifest.json`](assets/nexigrid.manifest.json).

## Theming

Components are driven by CSS custom properties (design tokens) exposed at
`:root` in the compiled stylesheet. Override them at `:root` or per instance —
runtime theming requires no rebuild. A `[data-theme]` attribute on `<html>`
switches themes (light by default; dark and custom themes supported).

## Dependencies

Nexigrid has no runtime dependencies. The default design uses the following,
which you can add via a CDN or your package manager:

- **Inter** — UI typeface — https://fonts.google.com/specimen/Inter
- **Phosphor Icons** — https://phosphoricons.com

## License

[MIT](LICENSE) © 2026 Claudio Pistidda — Nexigrid

## Links

- Website: https://nexigrid.org
