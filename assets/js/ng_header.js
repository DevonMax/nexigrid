/*
==========================================================
NexiGrid – Header Component
----------------------------------------------------------
Gestisce header responsive e trasferimento voci in overlay.

Funzionamento:
- header con zone left / center / right
- gli elementi con [data-on-mobile] vengono spostati nell'overlay
  sotto breakpoint mobile
- in desktop tornano nella posizione originale
- nessuna duplicazione DOM
- menu header gestiti internamente
- idempotente
- memory-safe
==========================================================
*/

import * as u from './ng_utils.js';

const NG_HEADER_BREAKPOINT = 768;

export function initHeader(scope = document) {

	const roots = u.resolveElements(
		scope,
		'.ng-header:not([data-ng-uid])'
	);

	const initialized = [];

	roots.forEach(root => {

		const listeners = [];
		const moved = new Map();
		const menus = Array.from(root.querySelectorAll('.ng-header-menu'));

		function isMobile() {
			return window.innerWidth <= NG_HEADER_BREAKPOINT;
		}

		function closeMenu(menu) {
			if (!menu) return;
			menu.classList.remove('is-open');
		}

		function closeAllMenus(except = null) {
			menus.forEach(menu => {
				if (menu !== except) {
					menu.classList.remove('is-open');
				}
			});
		}

		/* ==================================================
		HEADER MENU
		================================================== */

		menus.forEach(menu => {

			const trigger = menu.querySelector('.ng-header-menu-trigger');
			const panel = menu.querySelector('.ng-header-menu-panel');

			if (!trigger || !panel) return;

			function toggleMenu(e) {
				e.preventDefault();

				if (isMobile()) {
					menu.classList.toggle('is-open');
					return;
				}

				const willOpen = !menu.classList.contains('is-open');

				closeAllMenus(menu);

				if (willOpen) {
					menu.classList.add('is-open');
				} else {
					menu.classList.remove('is-open');
				}
			}

			function handleOutside(e) {
				if (isMobile()) return;
				if (!menu.contains(e.target)) {
					closeMenu(menu);
				}
			}

			function handleKey(e) {
				if (e.key !== 'Escape') return;
				closeMenu(menu);
			}

			u.listen(trigger, 'click', toggleMenu, false, listeners);
			u.listen(document, 'click', handleOutside, true, listeners);
			u.listen(document, 'keydown', handleKey, true, listeners);

		});

		/* ==================================================
		MOBILE MOVE MAP
		================================================== */

		const items = root.querySelectorAll('[data-on-mobile]');

		items.forEach(el => {

			const overlayId = el.getAttribute('data-on-mobile');
			if (!overlayId) return;

			const overlay = document.getElementById(overlayId);
			if (!overlay) return;

			const target = overlay.querySelector('[data-ng-mobile-target]');
			if (!target) return;

			const placeholder = document.createComment('ng-mobile-placeholder');

			moved.set(el, {
				parent: el.parentNode,
				next: el.nextSibling,
				target,
				placeholder,
				moved: false
			});

		});

		function moveToOverlay() {

			moved.forEach((state, el) => {

				if (state.moved) return;
				if (!state.parent || !state.target) return;

				state.parent.insertBefore(state.placeholder, el);
				state.target.appendChild(el);
				state.moved = true;

			});

		}

		function restoreFromOverlay() {

			moved.forEach((state, el) => {

				if (!state.moved) return;
				if (!state.placeholder.parentNode) return;

				state.placeholder.parentNode.insertBefore(el, state.placeholder);
				state.placeholder.parentNode.removeChild(state.placeholder);
				state.moved = false;

			});

		}

		function closeMovedOverlays() {

			moved.forEach(state => {

				const overlay = state.target?.closest('.ng-overlay');
				if (!overlay) return;

				overlay.classList.remove('is-active');
				overlay.setAttribute('aria-hidden', 'true');

			});

		}

		function update() {

			closeAllMenus();

			if (isMobile()) {
				moveToOverlay();
				return;
			}

			restoreFromOverlay();
			closeMovedOverlays();

		}

		const handleResize = u.debounce(update, 80);

		update();

		u.listen(window, 'resize', handleResize, false, listeners);
		u.listen(window, 'orientationchange', update, false, listeners);

		root.__ngListeners = listeners;
		root.setAttribute('data-ng-init', 'header');

		initialized.push(root);

	});

	return initialized;

}

// Metadata component (Component Contract)
initHeader.meta = {
	name: 'header',
	version: '1.0',
	description: 'Responsive header. Moves [data-on-mobile] items into overlay below 768px and restores on desktop. Manages header menus with outside-click + ESC close.',
	dependencies: ['overlay'],
	author: 'NexiGrid',
	experimental: false
};

u.log('[NG] ng_header.js v1.0 loaded');

if (window.ng) {
	window.ng.registerComponent('header', initHeader);
}