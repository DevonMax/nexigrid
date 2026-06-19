# Nexigrid

Framework **CSS + JS** proprietario, **zero dipendenze**.

## Uso (CDN / file)
```html
<link rel="stylesheet" href="assets/css/nexigrid.min.css">
<script type="module" src="assets/js/ng_core.js"></script>
<!-- + i singoli assets/js/ng_<componente>.js che servono, oppure il bundle: -->
<script type="module" src="assets/js/ng-all.min.js"></script>
```

- Sorgenti SCSS: `assets/css/ng_index.scss` (+ `_ng_*.scss`, `components/`).
- Catalogo componenti: `assets/nexigrid.manifest.json`.

### Dipendenze (a parte, come gli altri framework)
Font e icone NON sono incluse. Aggiungile via CDN:
- **Inter** (testo): https://fonts.google.com/specimen/Inter
- **Phosphor** (icone): https://phosphoricons.com/ (`@phosphor-icons/web`)

Sito: https://nexigrid.org
