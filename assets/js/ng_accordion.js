/*
==========================================================
NexiGrid 0.6 – Accordion Component
----------------------------------------------------------
Componente accordion accessibile e idempotente.

Caratteristiche:
- Supporta modalità multi-open (default) e single-open.
- Altezza animata via max-height (calcolata dinamicamente).
- Sync iniziale stato is-open → max-height coerente.
- Navigazione tastiera: Enter, Space, ArrowUp, ArrowDown.
- Listener tracciati secondo Memory Safety Policy.
- Compatibile con init parziale (scope).
==========================================================
*/

import * as u from './ng_utils.js';

export function initAccordion(scope = document) {

	// Seleziona solo accordion non ancora inizializzati (guard su data-ng-uid)
	const roots = u.resolveElements(scope, '.ng-accordion:not([data-ng-uid])');
	const initialized = [];

	roots.forEach(root => {

		// Recupera solo item diretti del root
		const items = Array.from(root.children)
			.filter(el => el.classList.contains('ng-accordion-item'));

		if (!items.length) return;

		const listeners = [];

		// Modalità single-open opzionale
		const singleMode = root.classList.contains('single-open');

		// Imposta altezza inline (usata per animazione max-height)
		function setHeight(content, value) {
			content.style.maxHeight = value;
		}

		// Apertura item
		function openItem(item) {

			const content = item.querySelector('.ng-accordion-content');
			if (!content) return;

			// Evita doppia apertura
			if (item.classList.contains('is-open')) return;

			// Se singleMode, chiude gli altri aperti
			if (singleMode) {
				items.forEach(i => {
					if (i !== item && i.classList.contains('is-open')) {
						closeItem(i);
					}
				});
			}

			item.classList.add('is-open');

			// ARIA sync
			const trigger = item.querySelector('.ng-accordion-trigger');
			if (trigger) trigger.setAttribute('aria-expanded', 'true');
			content.setAttribute('aria-hidden', 'false');

			// Calcola altezza dinamica contenuto
			const h = content.scrollHeight;
			setHeight(content, h + 'px');
		}

		// Chiusura item
		function closeItem(item) {

			const content = item.querySelector('.ng-accordion-content');
			if (!content) return;

			// Forza altezza attuale prima di chiudere (per animazione fluida)
			const h = content.scrollHeight;
			setHeight(content, h + 'px');
			void content.offsetHeight; // reflow forzato

			item.classList.remove('is-open');
			setHeight(content, '0px');

			// ARIA sync
			const trigger = item.querySelector('.ng-accordion-trigger');
			if (trigger) trigger.setAttribute('aria-expanded', 'false');
			content.setAttribute('aria-hidden', 'true');
		}

		// Toggle stato
		function toggle(item) {
			item.classList.contains('is-open')
				? closeItem(item)
				: openItem(item);
		}

		// ===== INITIAL SYNC + ARIA SETUP =====
		// Allinea max-height + ARIA allo stato iniziale (is-open)

		items.forEach((item, index) => {

			const content = item.querySelector('.ng-accordion-content');
			const trigger = item.querySelector('.ng-accordion-trigger');
			if (!content) return;

			const isOpen = item.classList.contains('is-open');

			// ARIA wiring: trigger ↔ content
			if (trigger && content) {
				if (!content.id) content.id = `ng-acc-content-${u.generateUID()}`;
				trigger.setAttribute('aria-controls', content.id);
				trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
				if (!trigger.hasAttribute('role')) trigger.setAttribute('role', 'button');
				if (!trigger.hasAttribute('tabindex')) trigger.setAttribute('tabindex', '0');

				if (!content.hasAttribute('role')) content.setAttribute('role', 'region');
				if (!content.hasAttribute('aria-labelledby')) {
					if (!trigger.id) trigger.id = `ng-acc-trigger-${u.generateUID()}`;
					content.setAttribute('aria-labelledby', trigger.id);
				}
				content.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
			}

			if (isOpen) {
				setHeight(content, content.scrollHeight + 'px');
			} else {
				setHeight(content, '0px');
			}
		});

		// ===== BIND LISTENERS =====
		// Click + Keyboard accessibility

		items.forEach((item, index) => {

			const trigger = item.querySelector('.ng-accordion-trigger');
			if (!trigger) return;

			// Click
			u.listen(trigger, 'click', e => {
				e.preventDefault();
				toggle(item);
			}, false, listeners);

			// Keyboard support
			u.listen(trigger, 'keydown', e => {

				switch (e.key) {

					// Attivazione
					case 'Enter':
					case ' ':
					case 'Space':
						e.preventDefault();
						toggle(item);
						break;

					// Navigazione giù
					case 'ArrowDown':
						e.preventDefault();
						items[(index + 1) % items.length]
							.querySelector('.ng-accordion-trigger')?.focus();
						break;

					// Navigazione su
					case 'ArrowUp':
						e.preventDefault();
						items[(index - 1 + items.length) % items.length]
							.querySelector('.ng-accordion-trigger')?.focus();
						break;
				}

			}, false, listeners);

		});

		// Listener registrati sul root per cleanup centralizzato
		root.__ngListeners = listeners;

		// Flag legacy compat (non usato come guard principale)
		root.setAttribute('data-ng-init', 'accordion');

		initialized.push(root);
	});

	return initialized;
}

// Metadata component (Component Contract)
initAccordion.meta = {
	name: "accordion",
	version: "1.0",
	description: "Disclosure accordion (multi/single open). ARIA expanded/controls/labelledby/region, keyboard nav (Enter/Space/Arrow), animated max-height.",
	dependencies: [],
	author: "NexiGrid",
	experimental: false
};

u.log('[NG] ng_accordion.js v1.0 loaded');

// Auto-registrazione se core presente
if (window.ng) {
	window.ng.registerComponent('accordion', initAccordion);
}