import * as u from './ng_utils.js';

export function initAutoDisableButtons(scope = document) {

	const buttons = u.resolveElements(
		scope,
		'button.ng-auto-disable:not([data-ng-uid])'
	);

	const initialized = [];

	buttons.forEach(button => {

		const listeners = [];

		function handleClick() {

			// Evita doppio trigger
			if (button.disabled) return;

			button.disabled = true;
			button.classList.add('is-loading');
			button.setAttribute('aria-busy', 'true');
		}

		u.listen(button, 'click', handleClick, false, listeners);

		button.__ngListeners = listeners;
		button.setAttribute('data-ng-init', 'auto-disable');

		initialized.push(button);
	});

	return initialized;
}

// Metadata component (Component Contract)
initAutoDisableButtons.meta = {
	name: "auto-disable",
	version: "1.0",
	description: "Disables a button on click and adds is-loading + aria-busy. Prevents duplicate submits.",
	dependencies: [],
	author: "NexiGrid",
	experimental: false
};

u.log('[NG] ng_autoDisableButtons.js v1.0 loaded');

if (window.ng) {
	window.ng.registerComponent('auto-disable', initAutoDisableButtons);
}