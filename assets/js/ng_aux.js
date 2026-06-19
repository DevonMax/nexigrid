// ng_aux.js
// NexiGrid 1.0 — Aux behaviors (delegated event handlers)
//
// Raccoglie comportamenti UI minori che non hanno una root markup propria
// ma reagiscono a click delegati su selettori specifici. Usa event
// delegation: un solo listener su document copre anche elementi aggiunti
// runtime, indipendentemente dall'observer.
//
// Comportamenti gestiti:
// - .ng-alert.dismissible .ng-alert-close          → rimuove l'alert
// - .ng-chip.removable .ng-chip-close              → rimuove il chip
// - .ng-list.selectable .ng-list-item              → seleziona singolo
// - [data-copy-tab]                                → copia testo del pannello

import * as u from './ng_utils.js';

// Idempotenza: la registrazione delegata avviene una sola volta. Init
// successivi (es. ng.init() ripetuto) sono no-op.
let _delegated = false;

export function initAux() {

	if (_delegated) return [];

	_delegated = true;

	const listeners = [];

	function onClick(e) {

		const t = e.target;
		if (!(t instanceof Element)) return;

		// Alert dismissibile
		const alertClose = t.closest('.ng-alert.dismissible .ng-alert-close');
		if (alertClose) {
			alertClose.closest('.ng-alert')?.remove();
			return;
		}

		// Chip rimovibile
		const chipClose = t.closest('.ng-chip.removable .ng-chip-close');
		if (chipClose) {
			chipClose.closest('.ng-chip')?.remove();
			return;
		}

		// List selectable (single selection)
		const listItem = t.closest('.ng-list.selectable .ng-list-item');
		if (listItem) {
			const list = listItem.closest('.ng-list');
			list?.querySelectorAll('.ng-list-item.is-active')
				.forEach(i => i.classList.remove('is-active'));
			listItem.classList.add('is-active');
			return;
		}

		// Copy tab content
		const copyTrigger = t.closest('[data-copy-tab]');
		if (copyTrigger) {
			e.preventDefault();
			copyTab(copyTrigger);
		}
	}

	async function copyTab(trigger) {

		const id = trigger.dataset.copyTab;
		const panel = document.getElementById(id);
		if (!panel) return;

		let text = '';

		panel.querySelectorAll('h4, .ng-list-item').forEach(node => {
			if (node.tagName === 'H4') {
				text += '\n' + node.innerText.trim().toUpperCase() + '\n';
			}
			if (node.classList.contains('ng-list-item')) {
				text += '- ' + node.innerText.replace(/\s+/g, ' ').trim() + '\n';
			}
		});

		text = text.trim();

		try {
			await navigator.clipboard.writeText(text);
			// Eventi custom per UI feedback (consumer-side):
			trigger.dispatchEvent(new CustomEvent('ng:aux:copy', {
				bubbles: true,
				detail: { trigger, sourceId: id, text }
			}));
		} catch (err) {
			console.error('[NG aux] Clipboard error', err);
			trigger.dispatchEvent(new CustomEvent('ng:aux:copy-error', {
				bubbles: true,
				detail: { trigger, sourceId: id, error: err }
			}));
		}
	}

	u.listen(document, 'click', onClick, false, listeners);

	// Memory safety: tracking sul document per teardown coordinato
	document.__ngListeners = (document.__ngListeners || []).concat(listeners);

	// Nessuna root per istanza: ritorna [] (delegated component).
	return [];
}

initAux.meta = {
	name: 'aux',
	version: '1.0',
	description: 'Delegated micro-behaviors: alert dismiss, chip remove, list selectable, copy-tab. Single document-level listener, dispatcha ng:aux:copy / ng:aux:copy-error.',
	dependencies: [],
	author: 'NexiGrid',
	experimental: false
};

u.log('[NG] ng_aux.js v1.0 loaded');

if (window.ng) {
	window.ng.registerComponent('aux', initAux);
}
