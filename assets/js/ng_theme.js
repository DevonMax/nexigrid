// =============================================================================
// ng_theme — switch tema NexiGrid via [data-theme] su <html>, persistito.
//
// Il tema è SEMPRE esplicito: nessun "auto"/fallback su OS. Se non c'è nulla
// di salvato né un data-theme già presente sul markup → default 'light'.
// (NG non legge mai prefers-color-scheme / matchMedia.)
//
// API (window.ng.theme):
//   set(name)   imposta e persiste un tema ('light','dark','<nome>'); falsy → 'light'
//   get()       nome del tema corrente (mai 'auto'; default 'light')
//   toggle()    alterna dark <-> light
//   apply(name) applica senza persistere (preview); falsy → 'light'
// Evento: 'ng:theme:change' su document.documentElement, detail { theme }.
//
// FOUC: per evitare il flash, incollare PRIMA del CSS, inline in <head>:
//   <script>try{document.documentElement.setAttribute('data-theme',localStorage.getItem('ng-theme')||'light');}catch(e){}</script>
// =============================================================================

import * as u from './ng_utils.js';

const KEY = 'ng-theme';
const DEFAULT_THEME = 'light';
const root = document.documentElement;

function apply(name) {
	root.setAttribute('data-theme', name || DEFAULT_THEME);
}

function set(name) {
	const theme = name || DEFAULT_THEME;
	try { localStorage.setItem(KEY, theme); } catch (e) { /* storage non disponibile: applica comunque */ }
	apply(theme);
	root.dispatchEvent(new CustomEvent('ng:theme:change', {
		detail: { theme }
	}));
}

function get() {
	let saved = null;
	try { saved = localStorage.getItem(KEY); } catch (e) {}
	return saved || root.getAttribute('data-theme') || DEFAULT_THEME;
}

function toggle() {
	set(get() === 'dark' ? 'light' : 'dark');
}

// init: il tema è obbligatorio → ne applica sempre uno esplicito.
// Priorità: salvato (localStorage) → data-theme già sul markup → 'light'.
// Non sovrascrive un data-theme scelto dall'autore se non c'è un salvataggio.
(function initTheme() {
	let saved = null;
	try { saved = localStorage.getItem(KEY); } catch (e) {}
	apply(saved || root.getAttribute('data-theme') || DEFAULT_THEME);
})();

export const theme = { set, get, toggle, apply };

// Metadata utility (coerente con ng.state._meta). Non è un componente DOM
// (niente initTheme/root) → non si registra nel registry.
theme._meta = {
	name: 'theme',
	version: '1.1',
	description: 'Switch tema via [data-theme] su <html>, persistito in localStorage + evento ng:theme:change. Tema SEMPRE esplicito (nessun auto/OS): default light.',
	dependencies: [],
	author: 'NexiGrid',
	experimental: false
};

if (window.ng) window.ng.theme = theme;

u.log('[NG] ng_theme.js v1.1 loaded');
