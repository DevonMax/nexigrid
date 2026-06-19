import * as u from './ng_utils.js';

/*
----------------------------------------------------------
Registry interno dei count inizializzati
----------------------------------------------------------
*/
const NG_COUNTS = new Set();


export function initCount(scope = document) {

	/*
	----------------------------------------------------------
	Seleziona tutti i campi non inizializzati
	----------------------------------------------------------
	*/
	const roots = u.resolveElements(
		scope,
		'[data-count-position]:not([data-ng-uid])'
	);

	const initialized = [];

	roots.forEach(el => {

		// supporta solo input / textarea
		if (typeof el.value === 'undefined') return;

		const listeners = [];

		const pos   = el.dataset.countPosition || 'bottom-right';
		const start = parseInt(el.dataset.countStart || 0, 10);
		// Target visualizzato: data-count-end > maxlength > minlength > 0
		let end = 0;
		if (el.dataset.countEnd)     end = parseInt(el.dataset.countEnd, 10);
		else if (el.maxLength > 0)   end = el.maxLength;
		else if (el.minLength > 0)   end = el.minLength;

		/*
		----------------------------------------------------------
		Wrapper
		----------------------------------------------------------
		*/
		const wrapper = el.parentElement;
		if (!wrapper) return;

		if (getComputedStyle(wrapper).position === 'static') {
			wrapper.style.position = 'relative';
		}

		/*
		----------------------------------------------------------
		Creazione counter
		----------------------------------------------------------
		*/
		const counter = document.createElement('span');
		counter.className = 'ng-count ' + pos;

		wrapper.appendChild(counter);

		/*
		----------------------------------------------------------
		Update
		----------------------------------------------------------
		*/
		function update() {

			const len = el.value ? el.value.length : 0;

			counter.textContent = end
				? `${len}/${end}`
				: `${len}`;

			counter.style.opacity = (len < start) ? '0' : '1';
			counter.classList.remove('bg-success', 'bg-danger', 'bg-info');

			// STATO 0
			if (len === 0) {
				counter.classList.add('bg-info');
				return;
			}

			// STATO INVALIDO
			const tooShort = el.minLength > 0 && len < el.minLength;
			const tooLong  = el.maxLength > 0 && len > el.maxLength;
			if (tooShort || tooLong) {
				counter.classList.add('bg-danger');
				return;
			}

			// STATO OK
			counter.classList.add('bg-success');
		}
		el.__ngCountUpdate = update;

		/*
		----------------------------------------------------------
		Init (con fix timing browser)
		----------------------------------------------------------
		*/
		const run = () => update();

		run();
		requestAnimationFrame(run);
		window.addEventListener('load', run, { once: true });

		/*
		----------------------------------------------------------
		Eventi
		----------------------------------------------------------
		*/
		u.listen(el, 'input', update, false, listeners);

		/*
		----------------------------------------------------------
		Registrazione componente
		----------------------------------------------------------
		*/
		el.__ngListeners = listeners;

		el.setAttribute('data-ng-init', 'count');

		NG_COUNTS.add(el);
		initialized.push(el);

	});

	return initialized;

}

export function refreshCount() {

	document
		.querySelectorAll('[data-ng-init="count"]')
		.forEach(el => {

			if (typeof el.__ngCountUpdate === 'function') {
				el.__ngCountUpdate();
			}

		});

}

/*
----------------------------------------------------------
Component Contract Metadata
----------------------------------------------------------
*/
initCount.meta = {

	name: "count",
	version: "1.0",
	description:"Character counter enhancer for input and textarea fields, with flexible positioning and DOM-driven initialization.",
	dependencies: [],
	author: "NexiGrid",
	experimental: false

};


/*
----------------------------------------------------------
Registrazione nel registry NexiGrid
----------------------------------------------------------
*/
if (window.ng) {
	window.ng.registerComponent('count', initCount);

	window.ng.count ||= {};
	window.ng.count.refresh = refreshCount;
}