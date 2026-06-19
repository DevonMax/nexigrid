/*
==========================================================
NexiGrid – Overlay Component                    v1.0.0
----------------------------------------------------------
Drawer / offcanvas panel universale.

Funzionalità:
  - Drawer da sinistra (default) o destra (.right)
  - Apertura tramite [data-ng-overlay="id"]
  - Chiusura tramite:
      · .ng-overlay-close     → bottone esplicito
      · click sul backdrop    → click fuori dal panel
      · tasto ESC             → solo se l'overlay è attivo
  - Idempotente: guard data-ng-uid su ogni root
  - Memory Safe: tutti i listener tracciati via u.listen()
  - ARIA: role="dialog", aria-modal, aria-hidden, focus management
==========================================================
*/

import * as u from './ng_utils.js';

export function initOverlay(scope = document) {

	const roots = u.resolveElements(scope, '.ng-overlay:not([data-ng-uid])');
	const initialized = [];

	roots.forEach(root => {

		const panel = root.querySelector('.ng-overlay-panel');
		if (!panel) return;

		const listeners = [];
		const id = root.id;

		root.setAttribute('role', 'dialog');
		root.setAttribute('aria-modal', 'true');
		root.setAttribute('aria-hidden', 'true');

		const header = root.querySelector('.ng-overlay-header [id]');
		if (header) {
			root.setAttribute('aria-labelledby', header.id);
		}

		let _lastTrigger = null;

		function open(triggerEl = null) {

			_lastTrigger = triggerEl;

			root.classList.add('is-active');
			root.setAttribute('aria-hidden', 'false');

			const focusable = panel.querySelector(
				'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
			);
			if (focusable) focusable.focus();

		}

		function close() {

			root.classList.remove('is-active');
			root.setAttribute('aria-hidden', 'true');

			if (_lastTrigger) {
				_lastTrigger.focus();
				_lastTrigger = null;
			}

		}

		if (id) {

			document.querySelectorAll(`[data-ng-overlay="${id}"]`).forEach(btn => {

				u.listen(btn, 'click', e => {
					e.preventDefault();
					open(btn);
				}, false, listeners);

			});

		}

		const closeBtn = root.querySelector('.ng-overlay-close');

		if (closeBtn) {

			u.listen(closeBtn, 'click', e => {
				e.preventDefault();
				close();
			}, false, listeners);

		}

		// BACKDROP FIX (preciso)
		u.listen(root, 'click', e => {

			if (e.target === root) {
				close();
			}

		}, false, listeners);

		// ESC FIX (solo overlay attivo)
		u.listen(document, 'keydown', e => {

			if (e.key === 'Escape' && root.classList.contains('is-active')) {
				close();
			}

		}, false, listeners);

		// TAB FOCUS-TRAP: con aria-modal=true il focus non deve uscire dal panel
		const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
		u.listen(root, 'keydown', e => {

			if (e.key !== 'Tab' || !root.classList.contains('is-active')) return;

			const f = Array.from(panel.querySelectorAll(FOCUSABLE))
				.filter(el => el.offsetParent !== null || el === document.activeElement);
			if (!f.length) return;

			const first = f[0], last = f[f.length - 1];

			if (e.shiftKey && document.activeElement === first) {
				e.preventDefault();
				last.focus();
			} else if (!e.shiftKey && document.activeElement === last) {
				e.preventDefault();
				first.focus();
			}

		}, false, listeners);

		root.__ngListeners = listeners;
		root.setAttribute('data-ng-init', 'overlay');

		initialized.push(root);

	});

	return initialized;

}

initOverlay.meta = {
	name: 'overlay',
	version: '1.1.0',
	description: 'Drawer/offcanvas universale (left/right): ESC, click backdrop, Tab focus-trap, ARIA dialog.',
	dependencies: [],
	author: 'NexiGrid',
	experimental: false
};

if (window.ng) {
	window.ng.registerComponent('overlay', initOverlay);
}