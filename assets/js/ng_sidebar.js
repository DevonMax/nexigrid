import * as u from './ng_utils.js';

export function initSidebar(scope = document) {

	const roots = u.resolveElements(scope, '.ng-sidebar:not([data-ng-uid])');
	const initialized = [];

	roots.forEach(root => {

		root.__ngListeners ||= [];

		const addL = (el, type, handler, options = false) => {
			if (!el) return;
			u.listen(el, type, handler, options, root.__ngListeners);
		};

		const sidebarId = root.id || u.generateUID();
		const layout = root.closest('.ng-layout') || document.querySelector('.ng-layout');
		const overlay = layout?.querySelector('.ng-overlay') || document.querySelector('.ng-overlay');

		if (!root.id) root.id = sidebarId;

		root.setAttribute('data-ng-init', 'sidebar');
		// data-ng-uid: lasciato al core. Marcato qui solo per coerenza legacy
		// (il core riassegna comunque se mancante).


		/* ============================================================
		STATE
		============================================================ */

		const isOpen = () => layout?.classList.contains('ng-sidebar-open');
		const isCompact = () => layout?.classList.contains('ng-sidebar-compact');

		const isDrawer = () => getComputedStyle(root).position === 'fixed';

		function updateControls(open) {
			document.querySelectorAll(
				`[data-ng-sidebar-toggle="${sidebarId}"],
				 [data-ng-sidebar-open="${sidebarId}"],
				 [data-ng-sidebar-close="${sidebarId}"]`
			).forEach(btn => {
				btn.setAttribute('aria-controls', sidebarId);
				btn.setAttribute('aria-expanded', open ? 'true' : 'false');
			});
		}

		function setState(open) {

			if (layout) {
				layout.classList.toggle('ng-sidebar-open', open);
			}

			root.setAttribute('aria-hidden', open ? 'false' : 'true');

			if (overlay) {
				overlay.classList.toggle('is-submenu-active', open);
			}

			updateControls(open);
		}

		const openSidebar   = () => setState(true);
		const closeSidebar  = () => setState(false);
		const toggleSidebar = () => {

			if (!layout) return;

			if (isDrawer()) {
				setState(!isOpen());
				return;
			}

			layout.classList.toggle('ng-sidebar-compact');
		};

		/* ============================================================
		RESPONSIVE SYNC
		mobile → desktop = forza apertura
		============================================================ */

		// const mqDesktop = window.matchMedia('(min-width: 896px)');

		// function syncDesktop(e) {

		// 	if (!layout) return;

		// 	if (e.matches) {
		// 		layout.classList.add('ng-sidebar-open');
		// 		root.setAttribute('aria-hidden', 'false');
		// 		updateControls(true);
		// 	}
		// }


		/* ============================================================
		SUBMENU
		============================================================ */

		function getPanel(trigger) {

			const target = trigger.dataset.ngSidebarTarget || trigger.getAttribute('href') || '';

			if (target.startsWith('#')) {
				return root.querySelector(target);
			}

			const next = trigger.nextElementSibling;
			return next?.classList.contains('ng-sidebar-submenu') ? next : null;
		}

		function setChevron(trigger, open) {
			trigger.classList.toggle('is-open', open);
			trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
		}

		function setPanel(trigger, panel, open) {

			if (!panel) return;

			panel.hidden = false;

			if (open) {

				panel.classList.add('is-open');
				panel.setAttribute('aria-hidden', 'false');
				panel.style.height = '0px';

				requestAnimationFrame(() => {
					panel.style.height = panel.scrollHeight + 'px';
				});

				addL(panel, 'transitionend', () => {
					if (panel.classList.contains('is-open')) {
						panel.style.height = 'auto';
					}
				}, { once: true });

			} else {

				panel.style.height = panel.scrollHeight + 'px';
				panel.offsetHeight;

				panel.classList.remove('is-open');
				panel.setAttribute('aria-hidden', 'true');

				requestAnimationFrame(() => {
					panel.style.height = '0px';
				});

				addL(panel, 'transitionend', () => {
					if (!panel.classList.contains('is-open')) {
						panel.hidden = true;
					}
				}, { once: true });
			}

			setChevron(trigger, open);
		}

		function initPanels() {

			root.querySelectorAll('.ng-sidebar-trigger').forEach((trigger, i) => {

				const panel = getPanel(trigger);
				if (!panel) return;

				if (!panel.id) panel.id = `${sidebarId}-panel-${i + 1}`;

				trigger.setAttribute('aria-controls', panel.id);

				if (panel.classList.contains('is-open')) {
					panel.hidden = false;
					panel.style.height = 'auto';
				} else {
					panel.hidden = true;
					panel.style.height = '0px';
				}
			});
		}

		function openActivePath() {

			const active = root.querySelector('.ng-sidebar-link.is-active, .ng-sidebar-link[aria-current="page"]');
			if (!active) return;

			let current = active.parentElement;

			while (current) {
				if (current.classList?.contains('ng-sidebar-submenu')) {
					current.classList.add('is-open');
					current.hidden = false;
					current.style.height = 'auto';
				}
				current = current.parentElement;
			}
		}


		/* ============================================================
		EVENTS
		============================================================ */

		initPanels();

		root.querySelectorAll('.ng-sidebar-trigger').forEach(trigger => {
			const panel = getPanel(trigger);
			if (!panel) return;

			addL(trigger, 'click', e => {
				e.preventDefault();
				setPanel(trigger, panel, !panel.classList.contains('is-open'));
			});
		});

		document.querySelectorAll(`[data-ng-sidebar-toggle="${sidebarId}"]`)
			.forEach(btn => {
				addL(btn, 'click', e => {
					e.preventDefault();
					toggleSidebar();
				});
			});

		document.querySelectorAll(`[data-ng-sidebar-open="${sidebarId}"]`)
			.forEach(btn => {
				addL(btn, 'click', e => {
					e.preventDefault();
					openSidebar();
				});
			});

		document.querySelectorAll(`[data-ng-sidebar-close="${sidebarId}"]`)
			.forEach(btn => {
				addL(btn, 'click', e => {
					e.preventDefault();
					closeSidebar();
				});
			});

		/* click outside solo drawer */
		addL(document, 'click', e => {

			if (!isOpen() || !isDrawer()) return;

			const t = e.target;

			if (root.contains(t)) return;
			if (t.closest(`[data-ng-sidebar-toggle="${sidebarId}"]`)) return;

			closeSidebar();
		});

		if (overlay) {
			addL(overlay, 'click', () => {
				if (isOpen() && isDrawer()) {
					closeSidebar();
				}
			});
		}

		if (root.hasAttribute('data-open-full')) {
			root.querySelectorAll('.ng-sidebar-trigger').forEach(trigger => {
				const panel = getPanel(trigger);
				if (panel) {
					panel.classList.add('is-open');
					panel.hidden = false;
					panel.style.height = 'auto';
				}
			});
		}

		openActivePath();

		/* init stato */
		setState(isOpen());

		/* sync breakpoint */
		// syncDesktop(mqDesktop);
		// addL(mqDesktop, 'change', syncDesktop);

		initialized.push(root);
	});

	return initialized;
}

initSidebar.meta = {
	name: "sidebar",
	version: "1.1",
	description: "Sidebar layout/drawer with submenu disclosure, ARIA expanded/hidden/controls, listener tracking, optional overlay.",
	dependencies: ["overlay"],
	author: "NexiGrid",
	experimental: false
};

u.log('[NG] ng_sidebar.js v1.1 loaded');

if (window.ng) {
	window.ng.registerComponent('sidebar', initSidebar);
}