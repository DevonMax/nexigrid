import * as u from './ng_utils.js';

const FOCUSABLE_SELECTOR = [
	'a[href]',
	'area[href]',
	'button:not([disabled])',
	'input:not([disabled]):not([type="hidden"])',
	'select:not([disabled])',
	'textarea:not([disabled])',
	'iframe',
	'[tabindex]:not([tabindex="-1"])',
	'[contenteditable="true"]'
].join(',');

function _isVisible(el) {
	// Robusto: getClientRects è 0 solo se l'elemento è davvero non renderizzato
	// (display:none o tutti i parent display:none). Funziona anche con position:fixed.
	if (!el) return false;
	if (el.hasAttribute('disabled')) return false;
	if (el.getAttribute('aria-hidden') === 'true') return false;
	const rects = el.getClientRects();
	return rects && rects.length > 0;
}

function _focusableIn(container) {
	if (!container) return [];
	return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(_isVisible);
}

export function initModal(scope = document) {

	const roots = u.resolveElements(scope, '.ng-modal:not([data-ng-uid])');
	const initialized = [];

	roots.forEach(root => {

		const panel = root.querySelector('.ng-modal-panel');
		if (!panel) return;

		const listeners = [];
		let _returnFocus = null;

		// =========================
		// ARIA SETUP
		// =========================

		if (!root.hasAttribute('role')) root.setAttribute('role', 'dialog');
		if (!root.hasAttribute('aria-modal')) root.setAttribute('aria-modal', 'true');

		// aria-labelledby: auto-link al primo heading se non specificato
		if (!root.hasAttribute('aria-labelledby')) {
			const heading = panel.querySelector('h1, h2, h3, h4, h5, h6, [data-ng-modal-title]');
			if (heading) {
				if (!heading.id) heading.id = 'ng-modal-title-' + u.generateUID();
				root.setAttribute('aria-labelledby', heading.id);
			}
		}

		if (!panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '-1');

		// =========================
		// API
		// =========================

		function open() {

			if (root.classList.contains('is-open')) return;

			_returnFocus = document.activeElement;
			root.classList.add('is-open');

			// Focus management: primo focusable o panel
			requestAnimationFrame(() => {
				const focusables = _focusableIn(panel);
				const target = focusables[0] || panel;
				try { target.focus({ preventScroll: false }); } catch {}
			});

			root.dispatchEvent(new CustomEvent('ng:modal:open', {
				detail: { modal: root }
			}));
		}

		function close() {

			if (!root.classList.contains('is-open')) return;

			root.classList.remove('is-open');

			// Return focus al trigger
			if (_returnFocus && typeof _returnFocus.focus === 'function') {
				try { _returnFocus.focus({ preventScroll: false }); } catch {}
			}
			_returnFocus = null;

			root.dispatchEvent(new CustomEvent('ng:modal:close', {
				detail: { modal: root }
			}));
		}

		function toggle() {
			root.classList.contains('is-open') ? close() : open();
		}

		// =========================
		// CLOSE BUTTONS
		// =========================

		const closeBtns = root.querySelectorAll('[data-ng-modal-close]');

		closeBtns.forEach(btn => {
			u.listen(btn, 'click', e => {
				e.preventDefault();
				close();
			}, false, listeners);
		});

		// =========================
		// CONFIRM / CANCEL
		// =========================

		const confirmBtns = root.querySelectorAll('[data-ng-modal-confirm]');
		const cancelBtns  = root.querySelectorAll('[data-ng-modal-cancel]');

		confirmBtns.forEach(btn => {
			u.listen(btn, 'click', e => {

				e.preventDefault();

				const ev = new CustomEvent('ng:modal:confirm', {
					cancelable: true,
					detail: { modal: root, trigger: btn }
				});

				root.dispatchEvent(ev);

				if (!ev.defaultPrevented) {
					close();
				}

			}, false, listeners);
		});

		cancelBtns.forEach(btn => {
			u.listen(btn, 'click', e => {

				e.preventDefault();

				const ev = new CustomEvent('ng:modal:cancel', {
					cancelable: true,
					detail: { modal: root, trigger: btn }
				});

				root.dispatchEvent(ev);

				if (!ev.defaultPrevented) {
					close();
				}

			}, false, listeners);
		});

		// =========================
		// BACKDROP CLICK (dynamic)
		// =========================

		if (root.classList.contains('is-dynamic')) {

			u.listen(root, 'click', e => {

				if (e.target === root) {
					close();
				}

			}, false, listeners);
		}

		// =========================
		// KEYBOARD: ESC + FOCUS TRAP
		// (capture phase per intercettare prima della default action del browser)
		// =========================

		u.listen(document, 'keydown', e => {

			if (!root.classList.contains('is-open')) return;

			if (e.key === 'Escape') {
				close();
				return;
			}

			if (e.key === 'Tab') {

				const focusables = _focusableIn(panel);
				if (!focusables.length) {
					e.preventDefault();
					try { panel.focus(); } catch {}
					return;
				}

				const first = focusables[0];
				const last = focusables[focusables.length - 1];
				const active = document.activeElement;

				// Focus fuori dal panel → riporta al primo
				if (!panel.contains(active) && active !== panel) {
					e.preventDefault();
					try { first.focus(); } catch {}
					return;
				}

				// Boundary cycling
				if (e.shiftKey && (active === first || active === panel)) {
					e.preventDefault();
					try { last.focus(); } catch {}
				} else if (!e.shiftKey && (active === last || active === panel)) {
					e.preventDefault();
					try { first.focus(); } catch {}
				}
			}

		}, true, listeners);

		// =========================
		// FOCUS GUARD (safety net)
		// =========================
		// Se per qualche motivo il focus finisce fuori dal panel (mouse click,
		// elementi non gestiti dal Tab handler, ecc.), riportalo dentro.

		u.listen(document, 'focusin', e => {

			if (!root.classList.contains('is-open')) return;
			if (e.target === root) return;
			if (panel.contains(e.target) || e.target === panel) return;

			const focusables = _focusableIn(panel);
			const target = focusables[0] || panel;
			try { target.focus(); } catch {}

		}, false, listeners);

		// =========================
		// EXPOSE API
		// =========================

		root.__ngModal = {
			open,
			close,
			toggle
		};

		// =========================
		// INIT MARK
		// =========================

		root.__ngListeners = listeners;
		root.setAttribute('data-ng-init', 'modal');

		initialized.push(root);
	});

	// =========================
	// GLOBAL TRIGGERS
	// =========================

	const openTriggers = u.resolveElements(
		scope,
		'[data-ng-modal-open]'
	);

	openTriggers.forEach(trigger => {

		if (trigger.dataset.ngModalInit) return;

		const targetSel = trigger.getAttribute('data-ng-modal-open');
		if (!targetSel) return;

		const target = document.querySelector(targetSel);
		if (!target || !target.__ngModal) return;

		// Traccia il listener nell'istanza del modal target → ng.unmount(modal)
		// lo pulisce (prima restava orfano su trigger.__ngListeners).
		u.listen(trigger, 'click', e => {
			e.preventDefault();
			target.__ngModal.open();
		}, false, target.__ngListeners);

		trigger.dataset.ngModalInit = 'true';
	});

	return initialized;
}

// ==========================
// META
// ==========================

initModal.meta = {
	name: "modal",
	version: "1.0",
	description: "Modal/dialog with backdrop, focus trap, return-focus, ARIA dialog roles.",
	dependencies: [],
	author: "NexiGrid",
	experimental: false
};

// ==========================
// AUTO REGISTER
// ==========================

u.log('[NG] ng_modal.js v1.0 loaded — focus trap + return focus active');

if (window.ng) {
	window.ng.registerComponent('modal', initModal);
}