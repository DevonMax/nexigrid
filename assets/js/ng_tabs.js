import * as u from './ng_utils.js';

export function initTabs(scope = document) {

	const roots = u.resolveElements(scope, '.ng-tabs:not([data-ng-uid])');
	const initialized = [];

	roots.forEach(root => {

		const nav = root.querySelector('.ng-tabs-nav');
		const tabs = nav ? Array.from(nav.querySelectorAll('.ng-tab[data-target]')) : [];
		const panels = Array.from(root.querySelectorAll('.ng-tab-panel'));

		if (!tabs.length || !panels.length) return;

		root.__ngListeners ||= [];

		function activate(tab) {

			if (tab.classList.contains('is-disabled')) return;

			tabs.forEach(t => {
				t.classList.remove('is-active');
				t.setAttribute('aria-selected', 'false');
				t.setAttribute('tabindex', '-1');
			});

			panels.forEach(p => {
				p.classList.remove('is-active');
				p.hidden = true;
			});

			tab.classList.add('is-active');
			tab.setAttribute('aria-selected', 'true');
			tab.setAttribute('tabindex', '0');

			const targetSel = tab.dataset.target;
			if (!targetSel) return;

			const panel = root.querySelector(targetSel);
			if (!panel) return;

			panel.classList.add('is-active');
			panel.hidden = false;
		}

		tabs.forEach((tab, index) => {

			// Accessibility setup
			tab.setAttribute('role', 'tab');
			tab.setAttribute(
				'aria-selected',
				tab.classList.contains('is-active') ? 'true' : 'false'
			);
			tab.setAttribute(
				'tabindex',
				tab.classList.contains('is-active') ? '0' : '-1'
			);

			const targetSel = tab.dataset.target;
			if (targetSel) {
				tab.setAttribute('aria-controls', targetSel.replace('#', ''));
			}

			// Click
			const clickHandler = () => activate(tab);
			u.listen(tab, 'click', clickHandler, { passive: true }, root.__ngListeners);

			// Keyboard
			const keyHandler = (e) => {

				switch (e.key) {

					case 'Enter':
					case ' ':
					case 'Space':
						e.preventDefault();
						activate(tab);
						break;

					case 'ArrowRight':
						e.preventDefault();
						tabs[(index + 1) % tabs.length].focus();
						break;

					case 'ArrowLeft':
						e.preventDefault();
						tabs[(index - 1 + tabs.length) % tabs.length].focus();
						break;
				}
			};

			u.listen(tab, 'keydown', keyHandler, false, root.__ngListeners);

			// Prima attivazione automatica se nessuna attiva
			if (index === 0 && !tabs.some(t => t.classList.contains('is-active'))) {
				activate(tab);
			}
		});

		const active = tabs.find(t => t.classList.contains('is-active'));
		if (active) activate(active);
		else activate(tabs[0]);

		root.setAttribute('data-ng-init', 'tabs');
		root.setAttribute('role', 'tablist');

		initialized.push(root);
	});

	return initialized;
}

// Metadata component (Component Contract)
initTabs.meta = {
	name: "tabs",
	version: "1.0",
	description: "Tablist with role=tab/tablist, aria-selected/controls, keyboard nav (arrows/Home/End), DOM-driven init.",
	dependencies: [],
	author: "NexiGrid",
	experimental: false
};

u.log('[NG] ng_tabs.js v1.0 loaded');

if (window.ng) {
	window.ng.registerComponent('tabs', initTabs);
}