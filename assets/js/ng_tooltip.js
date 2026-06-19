import * as u from './ng_utils.js';

export function initTooltip(scope = document) {

	const triggers = u.resolveElements(scope, '[data-tooltip]:not([data-ng-uid])');
	const initialized = [];

	triggers.forEach(el => {

		const text = el.dataset.tooltip;
		if (!text) return;

		el.__ngListeners ||= [];

		let tooltipEl = null;
		let removeTimer = null;
		const tooltipId = 'ng-tooltip-' + u.generateUID();

		function create() {

			if (tooltipEl) return;

			// Belt & suspenders: garantisce aria-describedby anche se l'init
			// in qualche edge case non lo avesse settato.
			if (el.getAttribute('aria-describedby') !== tooltipId) {
				const cur = el.getAttribute('aria-describedby');
				if (!cur) el.setAttribute('aria-describedby', tooltipId);
				else if (!cur.split(/\s+/).includes(tooltipId)) {
					el.setAttribute('aria-describedby', `${cur} ${tooltipId}`);
				}
			}

			const pos = (el.dataset.tooltipPos || 'top').toLowerCase();
			const color = el.dataset.tooltipColor;

			tooltipEl = document.createElement('div');
			tooltipEl.className = `ng-tooltip is-${pos}`;
			tooltipEl.id = tooltipId;
			tooltipEl.setAttribute('role', 'tooltip');

			if (color) {
				tooltipEl.classList.add(`ng-tooltip-${color}`);
			}

			tooltipEl.textContent = text;

			document.body.appendChild(tooltipEl);
			position();

			requestAnimationFrame(() => {
				tooltipEl?.classList.add('is-visible');
			});
		}

		function destroy() {

			if (!tooltipEl) return;

			const elToRemove = tooltipEl;
			tooltipEl = null;

			elToRemove.classList.remove('is-visible');

			removeTimer = setTimeout(() => {
				elToRemove.remove();
				removeTimer = null;
			}, 150);
		}

		function position() {

			if (!tooltipEl) return;

			const rect = el.getBoundingClientRect();
			const pos = (el.dataset.tooltipPos || 'top').toLowerCase();
			const ttRect = tooltipEl.getBoundingClientRect();

			let top, left;

			switch (pos) {

				case 'bottom':
					top = rect.bottom + 8;
					left = rect.left + rect.width / 2 - ttRect.width / 2;
					break;

				case 'right':
					top = rect.top + rect.height / 2 - ttRect.height / 2;
					left = rect.right + 8;
					break;

				case 'left':
					top = rect.top + rect.height / 2 - ttRect.height / 2;
					left = rect.left - ttRect.width - 8;
					break;

				default:
					top = rect.top - ttRect.height - 8;
					left = rect.left + rect.width / 2 - ttRect.width / 2;
			}

			tooltipEl.style.top = `${top + window.scrollY}px`;
			tooltipEl.style.left = `${left + window.scrollX}px`;
		}

		u.listen(el, 'mouseenter', create, false, el.__ngListeners);
		u.listen(el, 'mouseleave', destroy, false, el.__ngListeners);
		u.listen(el, 'focus', create, false, el.__ngListeners);
		u.listen(el, 'blur', destroy, false, el.__ngListeners);

		// ARIA: il trigger è descritto dal tooltip
		const existingDescBy = el.getAttribute('aria-describedby');
		if (existingDescBy) {
			if (!existingDescBy.split(/\s+/).includes(tooltipId)) {
				el.setAttribute('aria-describedby', `${existingDescBy} ${tooltipId}`);
			}
		} else {
			el.setAttribute('aria-describedby', tooltipId);
		}

		// Teardown: il tooltip è portalizzato in <body> → su unmount va rimosso
		// insieme al timer di rimozione pendente (i listener li pulisce il core).
		el.__ngProbe = {
			teardown() {
				clearTimeout(removeTimer);
				tooltipEl?.remove();
				tooltipEl = null;
			}
		};

		el.setAttribute('data-ng-init', 'tooltip');
		initialized.push(el);
	});

	return initialized;
}

// Metadata component (Component Contract)
initTooltip.meta = {
	name: "tooltip",
	version: "1.0",
	description: "Tooltip on hover/focus with automatic positioning, role=tooltip and aria-describedby on trigger.",
	dependencies: [],
	author: "NexiGrid",
	experimental: false
};

u.log('[NG] ng_tooltip.js v1.0 loaded — ARIA describedby active');

if (window.ng) {
	window.ng.registerComponent('tooltip', initTooltip);
}