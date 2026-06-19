import * as u from './ng_utils.js';

/*
----------------------------------------------------------
Registry interno dei dropdown inizializzati
Serve per eventuali gestioni future o debug.
----------------------------------------------------------
*/
const NG_DROPDOWNS = new Set();


export function initDropdown(scope = document) {

	/*
	----------------------------------------------------------
	Seleziona tutti i dropdown non ancora inizializzati
	(idempotenza del componente)
	----------------------------------------------------------
	*/
	const roots = u.resolveElements(
		scope,
		'.ng-dropdown:not([data-ng-uid])'
	);

	const initialized = [];

	roots.forEach(root => {

		// elementi fondamentali
		const trigger = root.querySelector('.ng-dropdown-trigger, [data-toggle]');
		const menu = root.querySelector('.ng-dropdown-menu');

		// dropdown non valido
		if (!trigger || !menu) return;

		// ARIA: il trigger apre un menu (mancava aria-haspopup)
		if (!trigger.hasAttribute('aria-haspopup')) trigger.setAttribute('aria-haspopup', 'true');
		if (!trigger.hasAttribute('aria-expanded')) trigger.setAttribute('aria-expanded', 'false');

		const listeners = [];

		// modalità operative
		const hoverMode = root.classList.contains('hover-mode');

		// Top-layer via Popover API (default, quando supportata): il menu esce da
		// overflow:hidden / stacking restando nel DOM (stili e var scoped intatti,
		// input leggibili dal componente padre). Posizionamento + flip/clamp via
		// engine JS. Fallback legacy (assoluto in-flusso) su browser senza Popover.
		const usePopover = typeof menu.showPopover === 'function';
		if (usePopover && !menu.hasAttribute('popover')) {
			menu.setAttribute('popover', 'manual');
		}

		let raf = 0;
		let hoverT = 0;


		/*
		----------------------------------------------------------
		Determina allineamento menu rispetto al trigger
		----------------------------------------------------------
		*/
		function getAlign() {
			if (root.classList.contains('align-left')) return 'left';
			if (root.classList.contains('align-center')) return 'center';
			if (root.classList.contains('align-right')) return 'right';
			return 'left';
		}

		/*
		----------------------------------------------------------
		Scheduler del posizionamento
		evita ricalcoli multipli nello stesso frame
		----------------------------------------------------------
		*/
		function schedule() {

			if (!root.classList.contains('is-open')) return;

			cancelAnimationFrame(raf);
			raf = requestAnimationFrame(position);

		}


		/*
		----------------------------------------------------------
		Stili base quando il menu è in portal-mode
		(menu spostato nel body)
		----------------------------------------------------------
		*/
		function applyFixedStyles() {

			if (!usePopover) return;

			menu.style.position  = 'fixed';
			menu.style.margin    = '0';
			menu.style.inset     = 'auto';
			menu.style.right     = 'auto';
			menu.style.bottom    = 'auto';
			menu.style.transform = 'none';

		}


		/*
		----------------------------------------------------------
		Pulisce gli stili inline quando il menu si chiude
		----------------------------------------------------------
		*/
		function clearInlineStyles() {

			menu.style.position  = '';
			menu.style.top       = '';
			menu.style.left      = '';
			menu.style.right     = '';
			menu.style.bottom    = '';
			menu.style.inset     = '';
			menu.style.margin    = '';
			menu.style.maxHeight = '';
			menu.style.overflowY = '';
			menu.style.marginTop = '';
			menu.style.transform = '';

		}


		/*
		==========================================================
		POSITION ENGINE
		==========================================================
		Gestisce:
		- allineamento
		- flip verticale
		- clamp viewport
		- max-height dinamico
		*/
		function position() {

			if (!usePopover) return;

			applyFixedStyles();

			const rect = trigger.getBoundingClientRect();

			const vw = document.documentElement.clientWidth;
			const vh = document.documentElement.clientHeight;

			const gap = 8;

			const offset =
				parseFloat(
					getComputedStyle(root)
					.getPropertyValue('--ng-dd-offset')
				) || 0;

			const mr = menu.getBoundingClientRect();


			/*
			----------------------------------------------------------
			Gestione flip verticale
			----------------------------------------------------------
			*/
			const spaceBelow = vh - rect.bottom;
			const spaceAbove = rect.top;

			let top  = rect.bottom + offset;
			let maxH = spaceBelow - gap;

			if (mr.height > spaceBelow - gap && spaceAbove > spaceBelow) {

				top  = rect.top - mr.height - offset;
				maxH = spaceAbove - gap;

			}

			top = Math.min(Math.max(top, gap), vh - gap);


			/*
			----------------------------------------------------------
			Calcolo allineamento orizzontale
			----------------------------------------------------------
			*/
			const align = getAlign();
			let left;

			switch (align) {

				case 'left':
					left = rect.left;
					break;

				case 'center':
					left = rect.left + (rect.width - mr.width) / 2;
					break;

				default:
					left = rect.right - mr.width;
					break;

			}


			/*
			----------------------------------------------------------
			Clamp viewport orizzontale
			----------------------------------------------------------
			*/
			if (left < gap) left = gap;
			if (left + mr.width > vw - gap) left = vw - mr.width - gap;


			/*
			----------------------------------------------------------
			Applica posizione finale
			----------------------------------------------------------
			*/
			menu.style.top       = `${Math.round(top)}px`;
			menu.style.left      = `${Math.round(left)}px`;
			menu.style.maxHeight = `${Math.max(80, Math.floor(maxH))}px`;
			menu.style.overflowY = 'auto';

		}


		/*
		==========================================================
		OPEN / CLOSE
		==========================================================
		*/
		function open() {

			if (root.classList.contains('is-open')) return;

			closeAll();

			root.classList.add('is-open');
			trigger.setAttribute('aria-expanded', 'true');

			/*
			Top layer via Popover API: il menu viene promosso nel top layer
			(fuori da overflow/stacking) restando nel DOM sotto il root.
			*/
			if (usePopover) {

				try { menu.showPopover(); } catch (e) { /* già aperto */ }

			}

			// posiziona subito (sincrono) per evitare il flash del centraggio UA,
			// poi l'engine ricalcola su resize/scroll via schedule()
			position();

			root.dispatchEvent(new CustomEvent('ng:dropdown:open', {
				detail: { dropdown: root, trigger, menu }
			}));

		}


		function close() {

			if (!root.classList.contains('is-open')) return;

			root.classList.remove('is-open');
			trigger.setAttribute('aria-expanded', 'false');

			if (usePopover && menu.matches(':popover-open')) {

				try { menu.hidePopover(); } catch (e) { /* già chiuso */ }

			}

			clearInlineStyles();

			root.dispatchEvent(new CustomEvent('ng:dropdown:close', {
				detail: { dropdown: root, trigger, menu }
			}));

		}


		function toggle(e) {

			if (e) e.preventDefault();

			root.classList.contains('is-open')
				? close()
				: open();

		}


		/*
		==========================================================
		GLOBAL HANDLERS
		==========================================================
		*/
		function handleOutside(e) {

			if (!root.contains(e.target) && !menu.contains(e.target))
				close();

		}


		function handleKey(e) {

			if (!root.classList.contains('is-open')) return;

			if (e.key === 'Escape') {

				e.preventDefault();

				close();
				trigger.focus({ preventScroll: true });

			}

		}


		/*
		==========================================================
		EVENTS
		==========================================================
		*/
		if (hoverMode) {

			const hoverOpen = () => {

				clearTimeout(hoverT);
				open();

			};

			const hoverClose = () => {

				clearTimeout(hoverT);
				hoverT = setTimeout(close, 120);

			};

			/*
			IMPORTANTE:
			non usare mouseleave sul root
			perché con position:fixed il menu
			esce dal box del root
			*/
			u.listen(trigger, 'mouseenter', hoverOpen, false, listeners);
			u.listen(menu,    'mouseenter', hoverOpen, false, listeners);

			u.listen(trigger, 'mouseleave', hoverClose, false, listeners);
			u.listen(menu,    'mouseleave', hoverClose, false, listeners);

		} else {

			u.listen(trigger,  'click', toggle, false, listeners);
			u.listen(document, 'click', handleOutside, true, listeners);

		}


		u.listen(document, 'keydown', handleKey, true, listeners);
		u.listen(window,   'resize',  schedule, true, listeners);
		u.listen(window,   'scroll',  schedule, true, listeners);


		/*
		==========================================================
		Registrazione componente
		==========================================================
		*/
		root.__ngListeners     = listeners;
		root.__ngDropdownClose = close;

		// Teardown risorse non-listener (RAF di posizionamento + timer hover)
		root.__ngProbe = { teardown() { cancelAnimationFrame(raf); clearTimeout(hoverT); } };

		root.setAttribute('data-ng-init', 'dropdown');

		NG_DROPDOWNS.add(root);
		initialized.push(root);

	});

	return initialized;

}


/*
----------------------------------------------------------
Chiude tutti i dropdown aperti
----------------------------------------------------------
*/
function closeAll() {

	document
		.querySelectorAll('.ng-dropdown.is-open')
		.forEach(root => {

			if (typeof root.__ngDropdownClose === 'function')
				root.__ngDropdownClose();
			else
				root.classList.remove('is-open');

		});

}


/*
----------------------------------------------------------
Component Contract Metadata
----------------------------------------------------------
*/
initDropdown.meta = {

	name: "dropdown",
	version: "1.2",
	description: "Dropdown menu with hover/click modes, top-layer (Popover API) positioning with auto flip/clamp, ARIA expanded, ESC close, custom events ng:dropdown:open|close.",
	dependencies: [],
	author: "NexiGrid",
	experimental: false

};


/*
----------------------------------------------------------
Registrazione nel registry NexiGrid
----------------------------------------------------------
*/
u.log('[NG] ng_dropdown.js v1.2 loaded');

if (window.ng) {
	window.ng.registerComponent('dropdown', initDropdown);
}