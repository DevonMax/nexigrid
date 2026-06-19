import * as u from './ng_utils.js';

/*
NexiGrid — ng_select_orion.js v1.0
Select avanzato (select2-like) come ENHANCEMENT del <select> nativo.
Componente A PARTE: nessuna collisione con .ng-select del form (token distinti).

Filosofia: il <select> reale resta la source of truth → il form invia da solo,
è accessibile, e senza JS resta un select stilizzato funzionante (degrado graceful:
il native porta anche la classe .ng-select del form per lo stile a JS spento).
Distintivi NG: (1) opzioni ricche icona Phosphor + sublabel; (2) sync persistente
opzionale via ng_state — gratis perché scriviamo nel native + dispatch 'change'.

Sicurezza by-design: render via createElement + textContent (MAI innerHTML),
classi icona sanitizzate (solo ph-*).

Markup:
  <div class="ng-select-orion" data-ng-select-orion data-placeholder="Scegli…" data-clearable>
    <select class="ng-select ng-select-orion-native" name="city">
      <option value="">Scegli…</option>
      <optgroup label="Italia">
        <option value="RM" data-icon="ph-map-pin" data-sublabel="Lazio">Roma</option>
        <option value="MI">Milano</option>
      </optgroup>
    </select>
  </div>

  Multi: <select … multiple> → chip inline.
  Sync:  data-ng-state data-state-id="x" data-state-prop="y" data-state-from="value" sul <select>.

Attributi (sul root .ng-select-orion):
  data-placeholder   testo placeholder (override dell'<option value="">)
  data-clearable     flag → bottone clear ✕
  data-searchable    "0" → disabilita la ricerca nel menu (default: attiva)

Eventi (sul root, no bubble):
  ng:select-orion:open    detail { select }
  ng:select-orion:close   detail { select }
  ng:select-orion:change  detail { select, value, values }
  ng:select-orion:add     detail { select, value, label, values }   (multi)
  ng:select-orion:remove  detail { select, value, label, values }   (multi)

API per istanza:
  root.__ngSelectOrion = {
    open(), close(),
    getValue(), getValues(),
    setValue(v|[v]), add(value), remove(value), clear(),
    refresh()
  }
*/

export function initSelectOrion(scope = document) {

	const roots = u.resolveElements(scope, '.ng-select-orion:not([data-ng-uid])');
	const initialized = [];

	roots.forEach(root => {

		const native = root.querySelector('select.ng-select-orion-native');
		if (!native) {
			u.warn?.('ng-select-orion: missing <select class="ng-select-orion-native">', root);
			return;
		}

		root.__ngListeners ||= [];

		const multiple   = native.multiple;
		const searchable = root.dataset.searchable !== '0';
		const clearable  = root.hasAttribute('data-clearable');
		const placeholder = root.dataset.placeholder
			|| (native.querySelector('option[value=""]')?.textContent.trim())
			|| (multiple ? 'Seleziona…' : '');

		/* ===== State ===== */
		let model = [];
		let items = [];
		let activeIndex = -1;
		let isOpen = false;

		/* ===== PARSE del <select> nativo ===== */
		function parse() {
			model = [];
			const walk = (container, group) => {
				Array.from(container.children).forEach(node => {
					if (node.tagName === 'OPTGROUP') {
						walk(node, node.getAttribute('label') || '');
					} else if (node.tagName === 'OPTION') {
						if (node.value === '') return;   // placeholder
						model.push({
							value:    node.value,
							label:    node.textContent.trim(),
							group:    group || null,
							disabled: node.disabled,
							icon:     node.dataset.icon || null,
							sublabel: node.dataset.sublabel || null
						});
					}
				});
			};
			walk(native, null);
		}

		/* ===== Selezione (verità nel <select>) ===== */
		function selectedValues() {
			return Array.from(native.selectedOptions).map(o => o.value).filter(v => v !== '');
		}
		function isSelected(v) {
			return selectedValues().some(x => String(x) === String(v));
		}
		function labelOf(v) {
			const m = model.find(x => String(x.value) === String(v));
			return m ? m.label : String(v);
		}
		function setNativeSelected(v, on) {
			const opt = Array.from(native.options).find(o => String(o.value) === String(v));
			if (opt) opt.selected = on;
		}
		function emitChange() {
			native.dispatchEvent(new Event('change', { bubbles: true }));
			root.dispatchEvent(new CustomEvent('ng:select-orion:change', {
				detail: { select: root, value: native.value, values: selectedValues() }
			}));
		}

		/* ===== DOM custom ===== */
		native.classList.add('is-enhanced');
		native.setAttribute('aria-hidden', 'true');
		native.tabIndex = -1;

		const control = document.createElement('div');
		control.className = 'ng-select-orion-control';
		control.tabIndex = native.disabled ? -1 : 0;
		control.setAttribute('role', 'combobox');
		control.setAttribute('aria-haspopup', 'listbox');
		control.setAttribute('aria-expanded', 'false');
		if (native.disabled) root.classList.add('is-disabled');
		if (multiple) root.classList.add('is-multiple');

		const valueBox = document.createElement('span');
		valueBox.className = 'ng-select-orion-value';
		control.appendChild(valueBox);

		const clearBtn = document.createElement('button');
		clearBtn.type = 'button';
		clearBtn.className = 'ng-select-orion-clear';
		clearBtn.setAttribute('aria-label', 'Pulisci selezione');
		clearBtn.textContent = '×';

		const caret = document.createElement('span');
		caret.className = 'ng-select-orion-caret';
		caret.setAttribute('aria-hidden', 'true');
		const caretIcon = document.createElement('i');
		caretIcon.className = 'ph ph-caret-down';
		caret.appendChild(caretIcon);

		if (clearable) control.appendChild(clearBtn);
		control.appendChild(caret);

		const menu = document.createElement('div');
		menu.className = 'ng-select-orion-menu';
		const menuId = 'ng-selor-menu-' + u.generateUID();
		menu.id = menuId;
		menu.setAttribute('role', 'listbox');
		if (multiple) menu.setAttribute('aria-multiselectable', 'true');
		control.setAttribute('aria-controls', menuId);

		let search = null;
		if (searchable) {
			const sWrap = document.createElement('div');
			sWrap.className = 'ng-select-orion-search';
			search = document.createElement('input');
			search.type = 'text';
			search.className = 'ng-select-orion-search-input';
			search.setAttribute('aria-label', 'Cerca');
			search.setAttribute('autocomplete', 'off');
			search.setAttribute('spellcheck', 'false');
			sWrap.appendChild(search);
			menu.appendChild(sWrap);
		}

		const list = document.createElement('div');
		list.className = 'ng-select-orion-list';
		menu.appendChild(list);

		native.insertAdjacentElement('afterend', control);
		control.insertAdjacentElement('afterend', menu);

		const usePopover = typeof menu.showPopover === 'function';
		if (usePopover && !menu.hasAttribute('popover')) {
			menu.setAttribute('popover', 'manual');
		}

		/* ===== RENDER display ===== */
		function renderValue() {
			while (valueBox.firstChild) valueBox.removeChild(valueBox.firstChild);
			const vals = selectedValues();

			if (!vals.length) {
				valueBox.classList.add('is-placeholder');
				valueBox.textContent = placeholder;
				if (clearable) clearBtn.hidden = true;
				return;
			}
			valueBox.classList.remove('is-placeholder');

			if (multiple) {
				vals.forEach(v => {
					const chip = document.createElement('span');
					chip.className = 'ng-chip removable';
					chip.dataset.value = String(v);
					chip.appendChild(document.createTextNode(labelOf(v)));
					const x = document.createElement('button');
					x.type = 'button';
					x.className = 'ng-chip-close';
					x.setAttribute('aria-label', 'Rimuovi ' + labelOf(v));
					x.textContent = '×';
					chip.appendChild(x);
					valueBox.appendChild(chip);
				});
			} else {
				valueBox.textContent = labelOf(vals[0]);
			}
			if (clearable) clearBtn.hidden = false;
		}

		/* ===== RENDER lista (anti-XSS) ===== */
		function renderList(query) {
			while (list.firstChild) list.removeChild(list.firstChild);
			items = [];
			activeIndex = -1;

			const q = String(query ?? '').trim().toLowerCase();
			let data = model;
			if (q) data = model.filter(m => m.label.toLowerCase().includes(q));
			if (multiple) data = data.filter(m => !isSelected(m.value));

			if (!data.length) {
				const st = document.createElement('div');
				st.className = 'ng-select-orion-status';
				st.textContent = 'Nessun risultato';
				list.appendChild(st);
				return;
			}

			let currentGroup = null;
			data.forEach((m, idx) => {
				if (m.group && m.group !== currentGroup) {
					currentGroup = m.group;
					const g = document.createElement('div');
					g.className = 'ng-select-orion-group';
					g.textContent = m.group;
					list.appendChild(g);
				}

				const item = document.createElement('div');
				item.className = 'ng-select-orion-item';
				item.setAttribute('role', 'option');
				item.id = menuId + '-opt-' + idx;
				item.dataset.value = String(m.value);
				if (m.disabled) item.setAttribute('aria-disabled', 'true');
				if (!multiple && isSelected(m.value)) {
					item.classList.add('is-selected');
					item.setAttribute('aria-selected', 'true');
				}

				if (m.icon) {
					const ico = document.createElement('span');
					ico.className = 'ng-select-orion-icon';
					const i = document.createElement('i');
					i.className = sanitizeClass(m.icon);
					ico.appendChild(i);
					item.appendChild(ico);
				}

				const body = document.createElement('div');
				body.className = 'ng-select-orion-body';
				const lbl = document.createElement('span');
				lbl.className = 'ng-select-orion-label';
				if (q) appendHighlighted(lbl, m.label, q); else lbl.textContent = m.label;
				body.appendChild(lbl);
				if (m.sublabel) {
					const sub = document.createElement('span');
					sub.className = 'ng-select-orion-sublabel';
					sub.textContent = m.sublabel;
					body.appendChild(sub);
				}
				item.appendChild(body);

				items.push({ data: m, node: item });
				list.appendChild(item);
			});
		}

		/* ===== OPEN / CLOSE / POSITION ===== */
		function open() {
			if (isOpen || native.disabled) return;
			isOpen = true;
			renderList('');
			if (usePopover) { try { menu.showPopover(); } catch {} }
			menu.classList.add('is-open');
			root.classList.add('is-open');
			control.setAttribute('aria-expanded', 'true');
			position();
			if (search) { search.value = ''; search.focus(); }
			root.dispatchEvent(new CustomEvent('ng:select-orion:open', { detail: { select: root } }));
		}

		function close() {
			if (!isOpen) return;
			isOpen = false;
			if (usePopover && menu.matches(':popover-open')) { try { menu.hidePopover(); } catch {} }
			menu.classList.remove('is-open');
			root.classList.remove('is-open');
			control.setAttribute('aria-expanded', 'false');
			control.removeAttribute('aria-activedescendant');
			activeIndex = -1;
			root.dispatchEvent(new CustomEvent('ng:select-orion:close', { detail: { select: root } }));
		}

		function position() {
			if (!usePopover) return;
			const gap = 4;
			const vw = window.innerWidth  || document.documentElement.clientWidth  || 0;
			const vh = window.innerHeight || document.documentElement.clientHeight || 0;
			const anchor = control.getBoundingClientRect();

			if (vh <= 0 || vw <= 0) {
				menu.style.position = 'fixed';
				menu.style.inset = 'auto';
				menu.style.top  = `${Math.round(anchor.bottom + gap)}px`;
				menu.style.left = `${Math.round(anchor.left)}px`;
				menu.style.minWidth = `${Math.round(anchor.width)}px`;
				return;
			}

			menu.style.position = 'fixed';
			menu.style.inset = 'auto';
			menu.style.top = 'auto';
			menu.style.bottom = 'auto';
			menu.style.maxHeight = '';
			menu.style.minWidth = '';

			const mr = menu.getBoundingClientRect();
			const spaceBelow = vh - anchor.bottom - gap;
			const spaceAbove = anchor.top - gap;
			const placeAbove = (mr.height > spaceBelow) && (spaceAbove > spaceBelow);

			let maxH;
			if (placeAbove) {
				maxH = Math.max(120, Math.floor(spaceAbove));
				menu.style.top = 'auto';
				menu.style.bottom = `${Math.max(gap, Math.round(vh - anchor.top + gap))}px`;
			} else {
				maxH = Math.max(120, Math.floor(spaceBelow));
				menu.style.bottom = 'auto';
				menu.style.top = `${Math.round(anchor.bottom + gap)}px`;
			}

			let left = Math.round(anchor.left);
			const width = Math.max(anchor.width, 200);
			if (left + width > vw - gap) left = vw - width - gap;
			if (left < gap) left = gap;

			menu.style.left = `${left}px`;
			menu.style.minWidth = `${Math.round(anchor.width)}px`;
			menu.style.maxHeight = `${maxH}px`;
			menu.classList.toggle('is-above', placeAbove);
		}

		/* ===== SELEZIONE ===== */
		function highlight(i) {
			if (!items.length) return;
			if (activeIndex >= 0 && items[activeIndex]) items[activeIndex].node.classList.remove('is-active');
			let n = items.length, step = i - activeIndex >= 0 ? 1 : -1;
			let idx = ((i % n) + n) % n, guard = 0;
			while (items[idx].data.disabled && guard < n) { idx = ((idx + step) % n + n) % n; guard++; }
			activeIndex = idx;
			const sel = items[activeIndex];
			sel.node.classList.add('is-active');
			control.setAttribute('aria-activedescendant', sel.node.id);
			const r = sel.node.getBoundingClientRect();
			const mr = list.getBoundingClientRect();
			if (r.bottom > mr.bottom) sel.node.scrollIntoView({ block: 'end' });
			else if (r.top < mr.top) sel.node.scrollIntoView({ block: 'start' });
		}

		function choose(m) {
			if (!m || m.disabled) return;
			if (multiple) {
				if (!isSelected(m.value)) {
					setNativeSelected(m.value, true);
					renderValue();
					emitChange();
					root.dispatchEvent(new CustomEvent('ng:select-orion:add', {
						detail: { select: root, value: m.value, label: m.label, values: selectedValues() }
					}));
				}
				if (search) { search.value = ''; search.focus(); }
				renderList('');
				position();
			} else {
				Array.from(native.options).forEach(o => { o.selected = false; });
				setNativeSelected(m.value, true);
				renderValue();
				emitChange();
				close();
				control.focus();
			}
		}

		function removeValue(v) {
			if (!isSelected(v)) return;
			const lbl = labelOf(v);
			setNativeSelected(v, false);
			renderValue();
			emitChange();
			root.dispatchEvent(new CustomEvent('ng:select-orion:remove', {
				detail: { select: root, value: v, label: lbl, values: selectedValues() }
			}));
			if (isOpen) { renderList(search ? search.value : ''); position(); }
		}

		function clearAll() {
			Array.from(native.options).forEach(o => { o.selected = false; });
			if (!multiple) native.value = '';
			renderValue();
			emitChange();
			if (isOpen) { renderList(search ? search.value : ''); position(); }
		}

		/* ===== LISTENERS ===== */
		u.listen(control, 'mousedown', (e) => {
			if (e.target.closest('.ng-select-orion-clear')) return;
			if (e.target.closest('.ng-chip-close')) return;
			e.preventDefault();
			isOpen ? close() : open();
		}, false, root.__ngListeners);

		if (clearable) {
			u.listen(clearBtn, 'click', (e) => { e.stopPropagation(); clearAll(); control.focus(); }, false, root.__ngListeners);
		}

		if (multiple) {
			u.listen(valueBox, 'click', (e) => {
				const x = e.target.closest('.ng-chip-close');
				if (!x) return;
				e.stopPropagation();
				removeValue(x.closest('.ng-chip')?.dataset.value);
			}, false, root.__ngListeners);
		}

		u.listen(list, 'click', (e) => {
			const node = e.target.closest('.ng-select-orion-item');
			if (!node) return;
			const m = items.find(it => it.node === node);
			if (m) choose(m.data);
		}, false, root.__ngListeners);

		if (search) {
			u.listen(search, 'input', () => { renderList(search.value); position(); }, false, root.__ngListeners);
		}

		function onKey(e) {
			switch (e.key) {
				case 'ArrowDown':
					e.preventDefault();
					if (!isOpen) { open(); return; }
					highlight(activeIndex < 0 ? 0 : activeIndex + 1);
					return;
				case 'ArrowUp':
					e.preventDefault();
					if (!isOpen) { open(); return; }
					highlight(activeIndex < 0 ? items.length - 1 : activeIndex - 1);
					return;
				case 'Home':
					if (isOpen && items.length) { e.preventDefault(); highlight(0); }
					return;
				case 'End':
					if (isOpen && items.length) { e.preventDefault(); highlight(items.length - 1); }
					return;
				case 'Enter':
					if (isOpen && items[activeIndex]) { e.preventDefault(); choose(items[activeIndex].data); }
					else if (!isOpen) { e.preventDefault(); open(); }
					return;
				case 'Escape':
					if (isOpen) { e.preventDefault(); close(); control.focus(); }
					return;
				case 'Backspace':
					if (multiple && search && search.value === '') {
						const vals = selectedValues();
						if (vals.length) { e.preventDefault(); removeValue(vals[vals.length - 1]); }
					}
					return;
				case 'Tab':
					if (isOpen) close();
					return;
			}
		}
		u.listen(control, 'keydown', onKey, false, root.__ngListeners);
		if (search) u.listen(search, 'keydown', onKey, false, root.__ngListeners);

		u.listen(document, 'click', (e) => {
			if (!isOpen) return;
			if (root.contains(e.target) || menu.contains(e.target)) return;
			close();
		}, false, root.__ngListeners);

		u.listen(window, 'resize', () => { if (isOpen) position(); }, false, root.__ngListeners);
		u.listen(window, 'scroll', () => { if (isOpen) position(); }, true, root.__ngListeners);

		// il native è la source of truth: se cambia da fuori (rehydrate ng_state,
		// reset form, codice esterno) ri-allinea la UI. renderValue NON dispatcha
		// 'change' → nessun loop con emitChange.
		u.listen(native, 'change', renderValue, false, root.__ngListeners);

		/* ===== API + init ===== */
		root.__ngSelectOrion = {
			open, close,
			getValue:  () => (multiple ? selectedValues() : (native.value || null)),
			getValues: () => selectedValues(),
			setValue: (v) => {
				Array.from(native.options).forEach(o => { o.selected = false; });
				(Array.isArray(v) ? v : [v]).forEach(x => setNativeSelected(x, true));
				if (!multiple && !Array.isArray(v)) native.value = String(v);
				renderValue(); emitChange();
			},
			add:    (v) => { const m = model.find(x => String(x.value) === String(v)); if (m) choose(m); },
			remove: (v) => removeValue(v),
			clear:  () => clearAll(),
			refresh: () => { parse(); renderValue(); if (isOpen) { renderList(search ? search.value : ''); position(); } }
		};

		parse();
		renderValue();

		root.setAttribute('data-ng-init', 'select-orion');
		initialized.push(root);

	});

	return initialized;
}

/* ===== HELPERS ===== */

function sanitizeClass(s) {
	const cls = String(s).trim().split(/\s+/).filter(p => /^ph(-[a-z0-9-]+)?$/.test(p));
	if (!cls.includes('ph')) cls.unshift('ph');
	return cls.join(' ');
}

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

initSelectOrion.meta = {
	name: 'select-orion',
	version: '1.0',
	description: 'Select avanzato (select2-like) come enhancement del <select> nativo — componente a parte, nessuna collisione con .ng-select del form. Single + multi (chip), ricerca locale, gruppi (optgroup), opzioni ricche (icona Phosphor + sublabel), placeholder, clear, ARIA combobox/listbox, submit nativo, sync opzionale via ng_state. No innerHTML (anti-XSS).',
	dependencies: [],
	author: 'NexiGrid',
	experimental: false
};

u.log('[NG] ng_select_orion.js v1.0 loaded');

if (window.ng) {
	window.ng.registerComponent('select-orion', initSelectOrion);
}
