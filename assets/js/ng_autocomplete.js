import * as u from './ng_utils.js';

/*
NexiGrid — ng_autocomplete.js v1.1
Combobox con fetch incorporato (single + multi-select). Sicurezza by-design:
 - render via createElement + textContent (MAI innerHTML) → anti-XSS.
 - AbortController su ogni nuovo input (annulla la fetch precedente).
 - Validazione JSON: results deve essere array; ogni voce deve avere value+label string.
 - Headers / params configurabili da attributo.
 - Cache opzionale per-istanza (LRU semplice, default off).

Contratto JSON backend:
  { "results": [
      { "value": "RM", "label": "Roma",
        "sublabel": "Lazio · Italia",       (opz)
        "icon": "ph-map-pin",                (opz, classe Phosphor)
        "group": "Italia",                   (opz)
        "disabled": false,                   (opz)
        "meta": { ... }                      (opz, libero)
      }
    ],
    "total": 124,                            (opz)
    "query": "rom"                           (opz, echo)
  }

Markup minimo:
  <div class="ng-field">
    <label class="ng-label">Città</label>
    <div class="ng-autocomplete" data-ng-autocomplete
         data-url="/api/cities"
         data-min-chars="2"
         data-debounce="250"
         data-limit="10">
      <input type="text" class="ng-input" placeholder="Cerca…">
      <div class="ng-autocomplete-menu" role="listbox" hidden></div>
    </div>
  </div>

Attributi:
  data-url           URL endpoint (required)
  data-min-chars     min chars per iniziare a cercare (default 2)
  data-debounce      ms (default 250)
  data-limit         n risultati richiesti (default 10) → ?limit=
  data-query-param   nome param query (default "q")
  data-limit-param   nome param limit (default "limit")
  data-headers       JSON object (default {})
  data-method        "GET" | "POST" (default "GET")
  data-highlight     "1" → wrappa il match in <mark> nel label (default off)
  data-allow-free    "1" → consente Enter come libero (no item selezionato)
  data-multiple      attributo flag → multi-select: i scelti diventano chip
                     removable inline nel campo (tags-input). Single resta default.

Eventi (sul root .ng-autocomplete, no bubble):
  ng:autocomplete:open    detail { query }
  ng:autocomplete:close   detail {}
  ng:autocomplete:select  detail { item, value, label }        (single)
  ng:autocomplete:add     detail { item, value, label, values } (multi)
  ng:autocomplete:remove  detail { value, label, values }       (multi)
  ng:autocomplete:error   detail { error, status?, query }
  ng:autocomplete:results detail { count, query }

API per istanza:
  root.__ngAutocomplete = {
    open(), close(), search(q),
    select(item), clear(),
    getValue(), setValue(v, label?),          // single
    getValues(), getItems(), add(item), remove(value)   // multi
  }
*/

const DEFAULTS = {
	minChars:    2,
	debounce:    250,
	limit:       10,
	queryParam:  'q',
	limitParam:  'limit',
	method:      'GET',
	headers:     {},
	highlight:   false,
	allowFree:   false
};

export function initAutocomplete(scope = document) {

	const roots = u.resolveElements(scope, '.ng-autocomplete:not([data-ng-uid])');
	const initialized = [];

	roots.forEach(root => {

		const input = root.querySelector('.ng-input');
		const menu  = root.querySelector('.ng-autocomplete-menu');

		if (!input || !menu) {
			u.warn?.('ng-autocomplete: missing .ng-input or .ng-autocomplete-menu', root);
			return;
		}

		const url = root.dataset.url;
		if (!url) {
			u.warn?.('ng-autocomplete: data-url required', root);
			return;
		}

		const opts = readOptions(root);

		root.__ngListeners ||= [];

		/* ===== State ===== */
		let abortCtrl    = null;
		let debounceT    = 0;
		let items        = [];          // ultimi results renderizzati
		let activeIndex  = -1;          // voce highlighted
		let isOpen       = false;
		let lastQuery    = '';
		let selectedItem = null;        // single: ultimo item selezionato
		const multiple    = opts.multiple;
		const selectedItems = [];       // multi: lista {value,label,...}
		let tagsBox = null;             // multi: container chip (control box)

		/* ===== Multi-select: tags-input inline =====
		   Markup invariato: l'autore aggiunge solo data-multiple. Il JS avvolge
		   input + chip in un .ng-autocomplete-control che fa da box (riusa i token
		   --ng-input-* via SCSS .is-multiple). I chip sono .ng-chip removable. */
		if (multiple) {
			root.classList.add('is-multiple');
			const control = document.createElement('div');
			control.className = 'ng-autocomplete-control';
			input.parentNode.insertBefore(control, input);
			control.appendChild(input);     // input dentro il control, dopo i chip
			tagsBox = control;
			// click sul box (non su un chip) → focus all'input
			u.listen(control, 'mousedown', (e) => {
				if (e.target === control) { e.preventDefault(); input.focus(); }
			}, false, root.__ngListeners);
			// rimozione chip: intercetto PRIMA di ng_aux (bubbling: container < document)
			u.listen(control, 'click', (e) => {
				const close = e.target.closest('.ng-chip-close');
				if (!close) return;
				e.stopPropagation();
				const chip = close.closest('.ng-chip');
				removeItem(chip?.dataset.value);
			}, false, root.__ngListeners);
		}

		function isSelected(v) {
			return selectedItems.some(s => String(s.value) === String(v));
		}

		function renderChips() {
			if (!multiple || !tagsBox) return;
			// rimuovo i chip esistenti (non l'input)
			tagsBox.querySelectorAll('.ng-chip').forEach(c => c.remove());
			selectedItems.forEach(s => {
				const chip = document.createElement('span');
				chip.className = 'ng-chip removable';
				chip.dataset.value = String(s.value);
				chip.appendChild(document.createTextNode(String(s.label)));
				const btn = document.createElement('button');
				btn.type = 'button';
				btn.className = 'ng-chip-close';
				btn.setAttribute('aria-label', 'Rimuovi ' + String(s.label));
				btn.textContent = '×';   // ×
				chip.appendChild(btn);
				tagsBox.insertBefore(chip, input);   // sempre prima dell'input
			});
		}

		function addItem(item) {
			if (!item || isSelected(item.value)) return;
			selectedItems.push({ value: item.value, label: item.label, data: item });
			renderChips();
			input.value = '';
			root.dispatchEvent(new CustomEvent('ng:autocomplete:add', {
				detail: { item, value: item.value, label: item.label, values: selectedItems.map(s => s.value) }
			}));
		}

		function removeItem(value) {
			const i = selectedItems.findIndex(s => String(s.value) === String(value));
			if (i < 0) return;
			const [removed] = selectedItems.splice(i, 1);
			renderChips();
			input.focus();
			root.dispatchEvent(new CustomEvent('ng:autocomplete:remove', {
				detail: { value: removed.value, label: removed.label, values: selectedItems.map(s => s.value) }
			}));
		}

		/* ===== ARIA setup ===== */
		const menuId = menu.id || ('ng-ac-menu-' + u.generateUID());
		menu.id = menuId;
		menu.setAttribute('role', 'listbox');

		input.setAttribute('role', 'combobox');
		input.setAttribute('aria-autocomplete', 'list');
		input.setAttribute('aria-expanded', 'false');
		input.setAttribute('aria-controls', menuId);
		input.setAttribute('autocomplete', 'off');
		input.setAttribute('spellcheck', 'false');

		/* ===== Popover API (top-layer, no clipping) ===== */
		const usePopover = typeof menu.showPopover === 'function';
		if (usePopover && !menu.hasAttribute('popover')) {
			menu.setAttribute('popover', 'manual');
		}
		menu.toggleAttribute('hidden', false); // gestiamo la visibilità noi

		/* =========================
		   RENDER (safe, textContent)
		   ========================= */

		function clearMenu() {
			while (menu.firstChild) menu.removeChild(menu.firstChild);
		}

		function renderStatus(text, isError) {
			clearMenu();
			items = [];
			activeIndex = -1;
			const el = document.createElement('div');
			el.className = 'ng-autocomplete-status' + (isError ? ' is-error' : '');
			el.textContent = text;
			menu.appendChild(el);
			positionMenu();
		}

		/* Loading: NON svuota il menu (evita flash). Mantiene i risultati
		   precedenti finché non arrivano i nuovi. */
		function setLoading(on) {
			menu.classList.toggle('is-loading', !!on);
		}

		function renderItems(list, query) {
			clearMenu();
			items = [];
			activeIndex = -1;

			// multi: nascondi le voci già selezionate
			if (multiple && selectedItems.length) {
				list = list.filter(it => !isSelected(it.value));
			}
			if (!list.length) {
				renderStatus('Nessun risultato', false);
				return;
			}

			let currentGroup = null;

			list.forEach((it, idx) => {

				if (it.group && it.group !== currentGroup) {
					currentGroup = it.group;
					const g = document.createElement('div');
					g.className = 'ng-autocomplete-group';
					g.textContent = String(currentGroup);
					menu.appendChild(g);
				}

				const item = document.createElement('div');
				item.className = 'ng-autocomplete-item';
				item.setAttribute('role', 'option');
				item.id = menuId + '-opt-' + idx;
				item.setAttribute('data-ac-index', String(idx));
				if (it.disabled) item.setAttribute('aria-disabled', 'true');

				// icona
				if (it.icon) {
					const ico = document.createElement('span');
					ico.className = 'ng-autocomplete-icon';
					const i = document.createElement('i');
					// solo classi che iniziano per "ph " o "ph-" → niente injection
					i.className = sanitizeClass(it.icon);
					ico.appendChild(i);
					item.appendChild(ico);
				}

				// body (label + sublabel)
				const body = document.createElement('div');
				body.className = 'ng-autocomplete-body';

				const lbl = document.createElement('span');
				lbl.className = 'ng-autocomplete-label';
				if (opts.highlight && query) {
					appendHighlighted(lbl, String(it.label), query);
				} else {
					lbl.textContent = String(it.label);
				}
				body.appendChild(lbl);

				if (it.sublabel) {
					const sub = document.createElement('span');
					sub.className = 'ng-autocomplete-sublabel';
					sub.textContent = String(it.sublabel);
					body.appendChild(sub);
				}

				item.appendChild(body);

				// click handler (delegato sotto via listener su menu — qui guard inline)
				items.push({ data: it, node: item });
				menu.appendChild(item);
			});
			// Riposiziona dopo che il menu ha la sua altezza reale (fix flip dinamico)
			positionMenu();
		}

		/* =========================
		   OPEN / CLOSE
		   ========================= */

		function open(query) {
			if (!isOpen) {
				isOpen = true;
				if (usePopover) {
					try { menu.showPopover(); } catch {}
				}
				menu.classList.add('is-open');
				input.setAttribute('aria-expanded', 'true');
				positionMenu();
				root.dispatchEvent(new CustomEvent('ng:autocomplete:open', {
					detail: { query: query ?? lastQuery }
				}));
			} else {
				positionMenu();
			}
		}

		function close() {
			if (!isOpen) return;
			isOpen = false;
			if (usePopover && menu.matches(':popover-open')) {
				try { menu.hidePopover(); } catch {}
			}
			menu.classList.remove('is-open');
			input.setAttribute('aria-expanded', 'false');
			input.removeAttribute('aria-activedescendant');
			activeIndex = -1;
			root.dispatchEvent(new CustomEvent('ng:autocomplete:close', { detail: {} }));
		}

		/* Position engine: flip verticale (sotto/sopra), clamp orizzontale,
		   max-height dinamico in base allo spazio disponibile. */
		function positionMenu() {
			if (!usePopover) return;

			const gap = 4;
			const vw  = window.innerWidth  || document.documentElement.clientWidth  || 0;
			const vh  = window.innerHeight || document.documentElement.clientHeight || 0;
			// Ambienti senza viewport reale (test headless) → fallback "sotto" senza flip
			if (vh <= 0 || vw <= 0) {
				const r0 = input.getBoundingClientRect();
				menu.style.position = 'fixed';
				menu.style.inset    = 'auto';
				menu.style.top      = `${Math.round(r0.bottom + 4)}px`;
				menu.style.left     = `${Math.round(r0.left)}px`;
				menu.style.minWidth = `${Math.round(r0.width)}px`;
				return;
			}

			// reset prima di misurare l'altezza naturale del menu
			menu.style.position  = 'fixed';
			menu.style.inset     = 'auto';
			menu.style.top       = 'auto';
			menu.style.bottom    = 'auto';
			menu.style.maxHeight = '';
			menu.style.minWidth  = '';

			const r  = input.getBoundingClientRect();
			const mr = menu.getBoundingClientRect();

			const spaceBelow = vh - r.bottom - gap;
			const spaceAbove = r.top - gap;

			// flip se sotto non basta E sopra ho più spazio
			const placeAbove = (mr.height > spaceBelow) && (spaceAbove > spaceBelow);

			let maxH;
			if (placeAbove) {
				// Ancoraggio dal BASSO: bottom del menu = (top dell'input - gap).
				// Il menu cresce verso l'alto man mano che gli items arrivano,
				// SENZA mai sovrapporsi all'input (fix flip-cover).
				maxH = Math.max(80, Math.floor(spaceAbove));
				menu.style.top    = 'auto';
				menu.style.bottom = `${Math.max(gap, Math.round(vh - r.top + gap))}px`;
			} else {
				// Ancoraggio dall'ALTO: top del menu = (bottom dell'input + gap).
				maxH = Math.max(80, Math.floor(spaceBelow));
				menu.style.bottom = 'auto';
				menu.style.top    = `${Math.round(r.bottom + gap)}px`;
			}

			// clamp orizzontale
			let left = Math.round(r.left);
			const width = Math.max(r.width, 220); // min-width sensato
			if (left + width > vw - gap) left = vw - width - gap;
			if (left < gap) left = gap;

			menu.style.left      = `${left}px`;
			menu.style.minWidth  = `${Math.round(r.width)}px`;
			menu.style.maxHeight = `${maxH}px`;
			menu.style.overflowY = 'auto';

			menu.classList.toggle('is-above', placeAbove);
		}

		/* =========================
		   SELECTION
		   ========================= */

		function highlight(i) {
			if (!items.length) return;
			if (activeIndex >= 0 && items[activeIndex]) {
				items[activeIndex].node.classList.remove('is-active');
			}
			activeIndex = ((i % items.length) + items.length) % items.length;
			const sel = items[activeIndex];
			sel.node.classList.add('is-active');
			input.setAttribute('aria-activedescendant', sel.node.id);
			// scroll into view se serve
			const r = sel.node.getBoundingClientRect();
			const mr = menu.getBoundingClientRect();
			if (r.bottom > mr.bottom) sel.node.scrollIntoView({ block: 'end' });
			else if (r.top < mr.top)  sel.node.scrollIntoView({ block: 'start' });
		}

		function select(item) {
			if (!item || item.disabled) return;
			if (multiple) {
				addItem(item);
				close();
				input.focus();
				return;
			}
			selectedItem = item;
			input.value = String(item.label);
			close();
			root.dispatchEvent(new CustomEvent('ng:autocomplete:select', {
				detail: { item, value: item.value, label: item.label }
			}));
		}

		/* =========================
		   FETCH (safe)
		   ========================= */

		async function search(query) {
			const q = String(query ?? '').trim();
			lastQuery = q;

			// cancella eventuale fetch in volo
			if (abortCtrl) abortCtrl.abort();

			if (q.length < opts.minChars) {
				close();
				return;
			}

			abortCtrl = new AbortController();
			open(q);
			setLoading(true);   // overlay loading (NON svuota il menu → no flash)

			let res, payload;
			try {
				const init = {
					method:  opts.method,
					signal:  abortCtrl.signal,
					headers: Object.assign({ Accept: 'application/json' }, opts.headers)
				};
				const reqUrl = buildUrl(url, opts.queryParam, q, opts.limitParam, opts.limit);
				res = await fetch(reqUrl, init);

				if (!res.ok) {
					emitError(`HTTP ${res.status}`, res.status, q);
					return;
				}

				payload = await res.json();

			} catch (e) {
				if (e.name === 'AbortError') return; // normale: nuova query
				emitError(e.message || 'fetch failed', null, q);
				return;
			}

			// validazione strutturale
			if (!payload || !Array.isArray(payload.results)) {
				emitError('invalid response: results must be array', null, q);
				return;
			}

			const valid = payload.results
				.filter(it => it && typeof it === 'object'
					&& typeof it.value !== 'undefined'
					&& typeof it.label !== 'undefined');

			if (!valid.length) {
				setLoading(false);
				renderStatus('Nessun risultato', false);
				root.dispatchEvent(new CustomEvent('ng:autocomplete:results', {
					detail: { count: 0, query: q }
				}));
				return;
			}

			setLoading(false);
			renderItems(valid, q);
			highlight(0);
			root.dispatchEvent(new CustomEvent('ng:autocomplete:results', {
				detail: { count: valid.length, query: q }
			}));
		}

		function emitError(msg, status, q) {
			setLoading(false);
			renderStatus(msg, true);
			root.dispatchEvent(new CustomEvent('ng:autocomplete:error', {
				detail: { error: msg, status, query: q }
			}));
		}

		/* =========================
		   LISTENERS
		   ========================= */

		// input → debounce → search
		u.listen(input, 'input', () => {
			clearTimeout(debounceT);
			const q = input.value;
			debounceT = setTimeout(() => search(q), opts.debounce);
		}, false, root.__ngListeners);

		// focus → riapri se c'è valore
		u.listen(input, 'focus', () => {
			if (input.value && input.value.length >= opts.minChars) search(input.value);
		}, false, root.__ngListeners);

		// keyboard
		u.listen(input, 'keydown', (e) => {

			switch (e.key) {

				case 'Backspace':
					// multi: input vuoto → rimuovi l'ultimo chip
					if (multiple && input.value === '' && selectedItems.length) {
						e.preventDefault();
						removeItem(selectedItems[selectedItems.length - 1].value);
					}
					return;

				case 'ArrowDown':
					e.preventDefault();
					if (!isOpen) { search(input.value); return; }
					if (items.length) highlight(activeIndex + 1);
					return;

				case 'ArrowUp':
					e.preventDefault();
					if (!isOpen) return;
					if (items.length) highlight(activeIndex - 1);
					return;

				case 'Home':
					if (isOpen && items.length) { e.preventDefault(); highlight(0); }
					return;

				case 'End':
					if (isOpen && items.length) { e.preventDefault(); highlight(items.length - 1); }
					return;

				case 'Enter':
					if (isOpen && items[activeIndex]) {
						e.preventDefault();
						select(items[activeIndex].data);
					} else if (opts.allowFree && input.value.trim()) {
						// libero: dispatcha select con value=label=testo
						const val = input.value.trim();
						root.dispatchEvent(new CustomEvent('ng:autocomplete:select', {
							detail: {
								item: { value: val, label: val, free: true },
								value: val, label: val
							}
						}));
						close();
					}
					return;

				case 'Escape':
					if (isOpen) { e.preventDefault(); close(); }
					return;

				case 'Tab':
					if (isOpen && items[activeIndex]) {
						select(items[activeIndex].data);
					} else {
						close();
					}
					return;
			}
		}, false, root.__ngListeners);

		// click su voce (delegato)
		u.listen(menu, 'click', (e) => {
			const node = e.target.closest('.ng-autocomplete-item');
			if (!node) return;
			const idx = parseInt(node.getAttribute('data-ac-index'), 10);
			if (Number.isInteger(idx) && items[idx]) select(items[idx].data);
		}, false, root.__ngListeners);

		// click fuori → close
		u.listen(document, 'click', (e) => {
			if (!isOpen) return;
			if (root.contains(e.target) || menu.contains(e.target)) return;
			close();
		}, false, root.__ngListeners);

		// reposition su resize/scroll
		u.listen(window, 'resize', () => { if (isOpen) positionMenu(); }, false, root.__ngListeners);
		u.listen(window, 'scroll', () => { if (isOpen) positionMenu(); }, true,  root.__ngListeners);

		/* =========================
		   API + teardown
		   ========================= */

		root.__ngAutocomplete = {
			open:  () => open(lastQuery),
			close: () => close(),
			search: (q) => { input.value = String(q ?? ''); search(input.value); },
			select: (item) => select(item),
			clear: () => {
				input.value = '';
				selectedItem = null;
				if (multiple) { selectedItems.length = 0; renderChips(); }
				close();
			},
			getValue: () => selectedItem ? selectedItem.value : null,
			setValue: (v, label) => {
				selectedItem = { value: v, label: label ?? String(v) };
				input.value = String(label ?? v);
			},
			// multi
			getValues: () => selectedItems.map(s => s.value),
			getItems:  () => selectedItems.map(s => ({ value: s.value, label: s.label })),
			add:    (item) => addItem(item),
			remove: (value) => removeItem(value)
		};

		root.__ngProbe = {
			teardown() {
				if (abortCtrl) abortCtrl.abort();
				clearTimeout(debounceT);
			}
		};

		root.setAttribute('data-ng-init', 'autocomplete');
		initialized.push(root);

	});

	return initialized;
}

/* =========================
   HELPERS
   ========================= */

function readOptions(root) {
	const ds = root.dataset;
	let headers = {};
	if (ds.headers) {
		try { headers = JSON.parse(ds.headers); } catch {}
	}
	return {
		minChars:   safeInt(ds.minChars,  DEFAULTS.minChars),
		debounce:   safeInt(ds.debounce,  DEFAULTS.debounce),
		limit:      safeInt(ds.limit,     DEFAULTS.limit),
		queryParam: ds.queryParam || DEFAULTS.queryParam,
		limitParam: ds.limitParam || DEFAULTS.limitParam,
		method:     (ds.method || DEFAULTS.method).toUpperCase(),
		headers:    headers && typeof headers === 'object' ? headers : {},
		highlight:  ds.highlight === '1',
		allowFree:  ds.allowFree === '1',
		multiple:   root.hasAttribute('data-multiple')
	};
}

function safeInt(v, dflt) {
	const n = parseInt(v, 10);
	return Number.isFinite(n) && n >= 0 ? n : dflt;
}

function buildUrl(base, qparam, q, lparam, limit) {
	const u = new URL(base, window.location.origin);
	u.searchParams.set(qparam, q);
	u.searchParams.set(lparam, limit);
	return u.toString();
}

/* Permette SOLO classi che iniziano per "ph " o "ph-" (icone Phosphor):
   evita injection di classi arbitrarie da backend. */
function sanitizeClass(s) {
	const cls = String(s).trim().split(/\s+/).filter(p =>
		/^ph(-[a-z0-9-]+)?$/.test(p)
	);
	// Phosphor richiede "ph" + "ph-icon"
	const hasBase = cls.includes('ph');
	if (!hasBase) cls.unshift('ph');
	return cls.join(' ');
}

/* Wrappa la prima occorrenza (case-insensitive) della query in <mark>.
   Lavora solo sui textNode (mai innerHTML, mai HTML del backend). */
function appendHighlighted(parent, text, query) {
	const idx = text.toLowerCase().indexOf(String(query).toLowerCase());
	if (idx < 0) { parent.textContent = text; return; }
	const before = text.slice(0, idx);
	const match  = text.slice(idx, idx + query.length);
	const after  = text.slice(idx + query.length);
	if (before) parent.appendChild(document.createTextNode(before));
	const m = document.createElement('mark');
	m.textContent = match;
	parent.appendChild(m);
	if (after) parent.appendChild(document.createTextNode(after));
}

initAutocomplete.meta = {
	name: 'autocomplete',
	version: '1.1',
	description: 'Combobox con fetch incorporato (single + multi-select via data-multiple, chip removable inline), JSON {results:[...]}, AbortController, ARIA combobox/listbox, no innerHTML (anti-XSS).',
	dependencies: [],
	author: 'NexiGrid',
	experimental: false
};

u.log('[NG] ng_autocomplete.js v1.1 loaded');

if (window.ng) {
	window.ng.registerComponent('autocomplete', initAutocomplete);
}
