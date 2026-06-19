import * as u from './ng_utils.js';

export function initToggle(scope = document) {

	const triggers = u.resolveElements(
		scope,
		'[data-ng-toggle]:not([data-ng-uid])'
	);

	const initialized = [];

	triggers.forEach(trigger => {

		const targetSel = trigger.dataset.ngToggle;
		const className = trigger.dataset.ngToggleClass || 'is-open';

		if (!targetSel) return;

		const target =
			scope.querySelector?.(targetSel) ||
			document.querySelector(targetSel);

		if (!target) return;

		// Funziona solo con struttura collapse
		if (!target.classList.contains('ng-collapse')) return;

		trigger.setAttribute('aria-controls', targetSel.replace('#', ''));

		// ─── STATE INTEGRATION STANDARD ───────────────────────────────

		const _stateKey    = trigger.dataset.stateId ?? null;
		const _stateActive = trigger.dataset.ngState !== undefined && _stateKey;
		const _stateProp   = trigger.dataset.stateProp ?? null;
		const _stateRaw    = _stateActive ? (window.ng?.state?.get(_stateKey) ?? null) : null;
		const _stateSaved  = (_stateRaw !== null && _stateProp) ? (_stateRaw[_stateProp] ?? null) : _stateRaw;

		function _stateSave(value) {
			if (!_stateActive) return;
			if (_stateProp) {
				const prev = window.ng?.state?.get(_stateKey);
				const base = (prev && typeof prev === 'object' && !Array.isArray(prev)) ? prev : {};
				window.ng?.state?.set(_stateKey, { ...base, [_stateProp]: value });
			} else {
				window.ng?.state?.set(_stateKey, value);
			}
		}

		const isOpen       = target.classList.contains(className);
		const resolvedOpen = _stateSaved !== null ? _stateSaved : isOpen;

		if (resolvedOpen) {
			target.classList.add(className);
			target.style.height = 'auto';
			trigger.setAttribute('aria-expanded', 'true');
		} else {
			target.classList.remove(className);
			target.style.height = '0px';
			trigger.setAttribute('aria-expanded', 'false');
		}

		function open() {

			target.classList.add(className);

			// Da 0 → scrollHeight
			target.style.height = target.scrollHeight + 'px';

			// Listener tracciato + auto-rimosso ({ once }) sull'altezza finita
			const clear = (e) => {
				if (e.propertyName === 'height') {
					target.style.height = 'auto';
				}
			};

			u.listen(target, 'transitionend', clear, { once: true }, (trigger.__ngListeners ||= []));
		}

		function close() {

			// Da auto → pixel
			target.style.height = target.scrollHeight + 'px';
			target.offsetHeight; // force reflow

			target.style.height = '0px';
			target.classList.remove(className);
		}

		const toggle = (e) => {
			e.preventDefault();

			const currentlyOpen = target.classList.contains(className);

			if (currentlyOpen) {
				close();
				trigger.setAttribute('aria-expanded', 'false');
			} else {
				open();
				trigger.setAttribute('aria-expanded', 'true');
			}

			_stateSave(!currentlyOpen);
		};

		const keyHandler = (e) => {
			if (e.key === 'Enter' || e.key === ' ' || e.key === 'Space') {
				e.preventDefault();
				toggle(e);
			}
		};

		u.listen(trigger, 'click', toggle, false, (trigger.__ngListeners ||= []));
		u.listen(trigger, 'keydown', keyHandler, false, trigger.__ngListeners);

		trigger.setAttribute('data-ng-init', 'toggle');

		initialized.push(trigger);
	});

	return initialized;
}

// Metadata component (Component Contract)
initToggle.meta = {
	name: "toggle",
	version: "1.0",
	description: "Toggle disclosure for collapsibles. ARIA expanded/controls, keyboard Enter/Space, optional state persistence via ng.state.",
	dependencies: [],
	author: "NexiGrid",
	experimental: false
};

u.log('[NG] ng_toggle.js v1.0 loaded');

if (window.ng) {
	window.ng.registerComponent('toggle', initToggle);
}