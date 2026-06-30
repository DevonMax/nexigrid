# Nexigrid

A zero-dependency CSS + JS UI framework.

Nexigrid provides ready-to-use, themeable components built on modern CSS
(custom properties, logical properties) and small, framework-free vanilla
JavaScript modules. No build step is required to use it.

## Installation

Include the compiled stylesheet and the JavaScript modules you need:

```html
<link rel="stylesheet" href="assets/css/nexigrid.min.css">

<!-- Core (required) -->
<script type="module" src="assets/js/min/ng_core.js"></script>

<!-- Load only the components you use… -->
<script type="module" src="assets/js/min/ng_modal.js"></script>

<!-- …or the full bundle -->
<script type="module" src="assets/js/ng-all.min.js"></script>
```

This repository ships the **compiled distribution**: the bundled stylesheet
(`assets/css/nexigrid.css` / `.min.css` + source map) and the JavaScript
modules (`assets/js/min/*.js` + `assets/js/ng-all.min.js`). No build step is
required.

## Theming

Components are driven by CSS custom properties (design tokens) exposed at
`:root` in the compiled stylesheet. Override them at `:root` or per instance —
runtime theming requires no rebuild.

## Components

The full component catalog (names, versions, status) is listed in
[`assets/nexigrid.manifest.json`](assets/nexigrid.manifest.json).

## Dependencies

Nexigrid has no runtime dependencies. The default design uses the following,
which you can add via a CDN or your package manager:

- **Inter** — UI typeface — https://fonts.google.com/specimen/Inter
- **Phosphor Icons** — https://phosphoricons.com

## License

[MIT](LICENSE) © 2026 Claudio Pistidda — Nexigrid

## Links

- Website: https://nexigrid.org
