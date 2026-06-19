import * as u from './ng_utils.js';

/*
----------------------------------------------------------
Registry interno dei popover inizializzati
----------------------------------------------------------
*/
const NG_POPOVERS = new Set();

const PLACEMENTS = [
	'top', 'top-start', 'top-end',
	'right', 'right-start', 'right-end',
	'bottom', 'bottom-start', 'bottom-end',
	'left', 'left-start', 'left-end'
];

const FOCUSABLE_SELECTOR = [
	'a[href]',
	'button:not([disabled])',
	'input:not([disabled]):not([type="hidden"])',
	'select:not([disabled])',
	'textarea:not([disabled])',
	'[tabindex]:not([tabindex="-1"])'
].join(',');


export function initPopover(scope = document) {

	/*
	----------------------------------------------------------
	Risolvi popover non ancora inizializzati
	----------------------------------------------------------
	*/
	const roots = u.resolveElements(
		scope,
		'.ng-popover:not([data-ng-uid])'
	);

	const initialized = [];

	roots.forEach(root => {

		/*
		----------------------------------------------------------
		Risoluzione trigger
		Cerca tutti i [data-ng-popover-open="#<id>"] in pagina.
		----------------------------------------------------------
		*/
		if (!root.id) return;

		const triggers = Array.from(
			document.querySelectorAll(
				`[data-ng-popover-open="#${root.id}"]`
			)
		);

		if (!triggers.length) return;

		/*
		----------------------------------------------------------
		Configurazione data-attributes
		----------------------------------------------------------
		*/
		const wantedPlacement = root.dataset.ngPopoverPlacement || 'bottom';
		const triggerMode     = root.dataset.ngPopoverTrigger   || 'click';
		const dismissList     = (root.dataset.ngPopoverDismiss || 'outside,esc')
			.split(',')
			.map(s => s.trim());

		const isModal = 'ngPopoverModal' in root.dataset;

		const listeners = [];

		let activeTrigger = null;
		let placeholder   = null;
		let raf           = 0;
		let hoverT        = 0;


		/*
		==========================================================
		POSITION ENGINE
		==========================================================
		Calcola top/left in base a placement richiesto e fa flip
		automatico se non c'è spazio + clamp dentro viewport.
		*/
		function position() {

			if (!root.classList.contains('is-open')) return;
			if (!activeTrigger) return;

			const rect = activeTrigger.getBoundingClientRect();
			const pop  = root.getBoundingClientRect();

			const vw = document.documentElement.clientWidth;
			const vh = document.documentElement.clientHeight;

			const gap = 8;

			const offset = parseFloat(
				getComputedStyle(root).getPropertyValue('--ng-pop-offset')
			) || 8;

			const requested = wantedPlacement.split('-');
			let side  = requested[0];
			let align = requested[1] || 'center';

			/*
			----------------------------------------------------------
			Auto-flip lato se non c'è spazio
			----------------------------------------------------------
			*/
			const spaceTop    = rect.top;
			const spaceBottom = vh - rect.bottom;
			const spaceLeft   = rect.left;
			const spaceRight  = vw - rect.right;

			if (side === 'bottom' && pop.height + offset > spaceBottom && spaceTop > spaceBottom) {
				side = 'top';
			}
			else if (side === 'top' && pop.height + offset > spaceTop && spaceBottom > spaceTop) {
				side = 'bottom';
			}
			else if (side === 'right' && pop.width + offset > spaceRight && spaceLeft > spaceRight) {
				side = 'left';
			}
			else if (side === 'left' && pop.width + offset > spaceLeft && spaceRight > spaceLeft) {
				side = 'right';
			}


			/*
			----------------------------------------------------------
			Calcolo top/left in base al lato finale
			----------------------------------------------------------
			*/
			let top  = 0;
			let left = 0;

			if (side === 'bottom' || side === 'top') {

				top = (side === 'bottom')
					? rect.bottom + offset
					: rect.top - pop.height - offset;

				switch (align) {
					case 'start':
						left = rect.left;
						break;
					case 'end':
						left = rect.right - pop.width;
						break;
					default:
						left = rect.left + (rect.width - pop.width) / 2;
				}

			} else {

				left = (side === 'right')
					? rect.right + offset
					: rect.left - pop.width - offset;

				switch (align) {
					case 'start':
						top = rect.top;
						break;
					case 'end':
						top = rect.bottom - pop.height;
						break;
					default:
						top = rect.top + (rect.height - pop.height) / 2;
				}
			}


			/*
			----------------------------------------------------------
			Clamp viewport
			----------------------------------------------------------
			*/
			if (left < gap) left = gap;
			if (left + pop.width > vw - gap) left = vw - pop.width - gap;

			if (top < gap) top = gap;
			if (top + pop.height > vh - gap) top = vh - pop.height - gap;


			/*
			----------------------------------------------------------
			Applica posizione finale
			----------------------------------------------------------
			*/
			root.style.top  = `${Math.round(top)}px`;
			root.style.left = `${Math.round(left)}px`;


			/*
			----------------------------------------------------------
			Sync placement class (per arrow + animazione di entrata)
			----------------------------------------------------------
			*/
			PLACEMENTS.forEach(p => {
				root.classList.remove(`placement-${p}`);
			});

			const finalClass = align === 'center'
				? `placement-${side}`
				: `placement-${side}-${align}`;

			root.classList.add(finalClass);

			positionArrow(side, align, rect);
		}


		/*
		----------------------------------------------------------
		Posiziona arrow allineata al trigger
		----------------------------------------------------------
		*/
		function positionArrow(side, align, triggerRect) {

			const arrow = root.querySelector('.ng-popover-arrow');
			if (!arrow) return;

			const rootRect = root.getBoundingClientRect();

			arrow.style.top    = '';
			arrow.style.left   = '';
			arrow.style.right  = '';
			arrow.style.bottom = '';

			if (side === 'top' || side === 'bottom') {

				const triggerCenterX = triggerRect.left + triggerRect.width / 2;
				let arrowLeft = triggerCenterX - rootRect.left;

				arrowLeft = Math.max(12, Math.min(rootRect.width - 12, arrowLeft));

				arrow.style.left = `${arrowLeft}px`;

			} else {

				const triggerCenterY = triggerRect.top + triggerRect.height / 2;
				let arrowTop = triggerCenterY - rootRect.top;

				arrowTop = Math.max(12, Math.min(rootRect.height - 12, arrowTop));

				arrow.style.top = `${arrowTop}px`;
			}
		}


		/*
		----------------------------------------------------------
		Scheduler RAF (evita ricalcoli multipli per frame)
		----------------------------------------------------------
		*/
		function schedule() {
			cancelAnimationFrame(raf);
			raf = requestAnimationFrame(position);
		}


		/*
		==========================================================
		FOCUS TRAP (modalità modal)
		==========================================================
		*/
		function trapFocusHandler(e) {

			if (e.key !== 'Tab') return;
			if (!root.classList.contains('is-open')) return;

			const focusables = Array.from(
				root.querySelectorAll(FOCUSABLE_SELECTOR)
			).filter(el => !el.hasAttribute('disabled'));

			if (!focusables.length) return;

			const first = focusables[0];
			const last  = focusables[focusables.length - 1];

			if (e.shiftKey && document.activeElement === first) {
				e.preventDefault();
				last.focus();
			}
			else if (!e.shiftKey && document.activeElement === last) {
				e.preventDefault();
				first.focus();
			}
		}


		/*
		==========================================================
		OPEN / CLOSE / TOGGLE
		==========================================================
		*/
		function open(trigger) {

			if (root.classList.contains('is-open')) return;

			activeTrigger = trigger || triggers[0];

			/*
			Portal mode: sposta il popover nel <body>
			per evitare clip da overflow:hidden e stacking issues
			*/
			placeholder = document.createComment('ng-popover-portal');
			root.parentNode.insertBefore(placeholder, root);
			document.body.appendChild(root);

			root.classList.add('is-open');
			activeTrigger.setAttribute('aria-expanded', 'true');

			schedule();

			if (isModal) {

				const focusables = root.querySelectorAll(FOCUSABLE_SELECTOR);
				if (focusables.length) focusables[0].focus({ preventScroll: true });

				u.listen(root, 'keydown', trapFocusHandler, false, listeners);
			}

			root.dispatchEvent(new CustomEvent('ng:popover:open', {
				detail: { popover: root, trigger: activeTrigger }
			}));
		}


		function close() {

			if (!root.classList.contains('is-open')) return;

			root.classList.remove('is-open');

			if (activeTrigger) {
				activeTrigger.setAttribute('aria-expanded', 'false');
				activeTrigger.focus({ preventScroll: true });
			}

			/*
			Restore DOM position originale
			*/
			if (placeholder && placeholder.parentNode) {
				placeholder.parentNode.insertBefore(root, placeholder);
				placeholder.remove();
				placeholder = null;
			}

			/*
			Reset stili inline
			*/
			root.style.top  = '';
			root.style.left = '';

			PLACEMENTS.forEach(p => {
				root.classList.remove(`placement-${p}`);
			});

			root.dispatchEvent(new CustomEvent('ng:popover:close', {
				detail: { popover: root, trigger: activeTrigger }
			}));

			activeTrigger = null;
		}


		function toggle(trigger) {
			root.classList.contains('is-open')
				? close()
				: open(trigger);
		}


		/*
		==========================================================
		EVENT BINDINGS
		==========================================================
		*/

		triggers.forEach(trigger => {

			trigger.setAttribute('aria-haspopup', 'true');
			trigger.setAttribute('aria-expanded', 'false');
			trigger.setAttribute('aria-controls', root.id);

			if (triggerMode === 'click' || triggerMode === 'manual') {

				if (triggerMode === 'click') {
					u.listen(trigger, 'click', e => {
						e.preventDefault();
						toggle(trigger);
					}, false, listeners);
				}

			}

			if (triggerMode === 'hover') {

				const hoverOpen = () => {
					clearTimeout(hoverT);
					if (!root.classList.contains('is-open')) open(trigger);
				};

				const hoverClose = () => {
					clearTimeout(hoverT);
					hoverT = setTimeout(close, 150);
				};

				u.listen(trigger, 'mouseenter', hoverOpen,  false, listeners);
				u.listen(trigger, 'mouseleave', hoverClose, false, listeners);
				u.listen(root,    'mouseenter', hoverOpen,  false, listeners);
				u.listen(root,    'mouseleave', hoverClose, false, listeners);
			}

			if (triggerMode === 'focus') {
				u.listen(trigger, 'focus', () => open(trigger), false, listeners);
				u.listen(trigger, 'blur',  close, false, listeners);
			}
		});


		/*
		==========================================================
		DISMISS HANDLERS
		==========================================================
		*/
		if (dismissList.includes('outside')) {

			u.listen(document, 'click', e => {

				if (!root.classList.contains('is-open')) return;
				if (root.contains(e.target)) return;
				if (activeTrigger && activeTrigger.contains(e.target)) return;

				close();

			}, true, listeners);
		}

		if (dismissList.includes('esc')) {

			u.listen(document, 'keydown', e => {

				if (e.key !== 'Escape') return;
				if (!root.classList.contains('is-open')) return;

				e.preventDefault();
				close();

			}, true, listeners);
		}


		/*
		==========================================================
		Riposizionamento su resize/scroll
		==========================================================
		*/
		u.listen(window, 'resize', schedule, true, listeners);
		u.listen(window, 'scroll', schedule, true, listeners);


		/*
		==========================================================
		ARIA su root
		==========================================================
		*/
		root.setAttribute('role', isModal ? 'dialog' : 'tooltip');
		if (isModal) root.setAttribute('aria-modal', 'true');


		/*
		==========================================================
		Registrazione componente
		==========================================================
		*/
		root.__ngListeners = listeners;
		root.__ngPopover   = {
			open:   () => open(triggers[0]),
			close,
			toggle: () => toggle(triggers[0]),
			update: schedule
		};

		// Teardown risorse non-listener (RAF di posizionamento + timer hover)
		root.__ngProbe = { teardown() { cancelAnimationFrame(raf); clearTimeout(hoverT); } };

		root.setAttribute('data-ng-init', 'popover');

		NG_POPOVERS.add(root);
		initialized.push(root);

	});

	return initialized;

}


/*
----------------------------------------------------------
Component Contract Metadata
----------------------------------------------------------
*/
initPopover.meta = {

	name: "popover",
	version: "1.0",
	description: "Anchored popover with click/hover/focus triggers, 12 placements, auto-flip, viewport clamp, portal positioning, optional modal mode with focus trap, custom events ng:popover:open|close.",
	dependencies: [],
	author: "NexiGrid",
	experimental: false

};


/*
----------------------------------------------------------
Registrazione nel registry NexiGrid
----------------------------------------------------------
*/
u.log('[NG] ng_popover.js v1.0 loaded');

if (window.ng) {
	window.ng.registerComponent('popover', initPopover);
}
