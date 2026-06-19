import * as u from './ng_utils.js';

/**
 * NexiGrid – Matizer (Runtime Dynamic)
 * Ordinatore DOM dinamico con API pubblica.
 */

/* ==========================================================
   INIT (one-shot registration)
========================================================== */

export function initMatizer(scope = document) {

	const roots = u.resolveElements(
		scope,
		'[data-order-list]:not([data-ng-uid])'
	);

	const initialized = [];

	roots.forEach(root => {

		// Prima esecuzione con dataset
		const type = (root.dataset.sort || 'a-z').toLowerCase();
		const invert = root.dataset.invert === 'true';

		sortRoot(root, type, invert);

		root.setAttribute('data-ng-init', 'matizer');
		initialized.push(root);

 	});

	return initialized;
}

/* ==========================================================
   CORE SORT ENGINE (riutilizzabile)
========================================================== */

function sortRoot(root, type = 'a-z', invert = false) {

	const pattern = root.dataset.sortPattern
		? new RegExp(root.dataset.sortPattern)
		: null;

	const selector = root.dataset.target;
	const dataValues = root.dataset.values;

	let items = [];

	if (dataValues) {

		items = buildFromValues(root, dataValues);
		if (!items) return;

	} else if (selector) {

		items = Array.from(root.querySelectorAll(selector));

	} else {

		items = Array.from(root.children);
	}

	if (!items.length) return;

	const direction = invert ? -1 : 1;

	items.sort((a, b) => {
		const A = extractValue(a, pattern, type);
		const B = extractValue(b, pattern, type);
		return direction * compare(A, B, type);
	});

	if (dataValues) {

		while (root.firstChild) {
			root.removeChild(root.firstChild);
		}
		items.forEach(el => root.appendChild(el));

	} else {

		items.forEach(el => root.appendChild(el));
	}
}

/* ==========================================================
   PUBLIC API (runtime dynamic)
========================================================== */

function sort(el, type = 'a-z', invert = false) {

	if (!el || !el.matches?.('[data-order-list]')) return;

	sortRoot(el, type.toLowerCase(), invert);
}

function refresh(el) {

	if (!el || !el.matches?.('[data-order-list]')) return;

	const type = (el.dataset.sort || 'a-z').toLowerCase();
	const invert = el.dataset.invert === 'true';

	sortRoot(el, type, invert);
}

/* ==========================================================
   HELPERS
========================================================== */

function buildFromValues(root, raw) {

	try {
		const values = JSON.parse(raw);
		if (!Array.isArray(values)) return null;

		const tag = root.tagName === 'UL' ? 'li' : 'div';

		return values.map(v => {
			const el = document.createElement(tag);
			el.textContent = v;
			return el;
		});
	} catch {
		return null;
	}
}

function extractValue(el, regex, type) {

	let text = el.textContent.trim().toLowerCase();

	if (regex) {
		const match = text.match(regex);
		text = match ? match[0] : '';
	}

	if (type.includes('num') || type.includes('custom')) {
		const n = Number(text);
		return isNaN(n) ? 0 : n;
	}

	if (type.includes('len')) {
		return text.length;
	}

	return text;
}

function compare(a, b, type) {

	switch (type) {

		case 'a-z':
			return a.localeCompare(b);

		case 'a-z-rev':
			return b.localeCompare(a);

		case 'num':
		case 'custom':
			return a - b;

		case 'num-rev':
		case 'custom-rev':
			return b - a;

		case 'len':
			return a - b;

		case 'len-rev':
			return b - a;

		default:
			return 0;
	}
}

// Metadata component (Component Contract)
initMatizer.meta = {
	name: "matizer",
	version: "1.0",
	description: "DOM sorter for [data-order-list]. Tipi: a-z, num, len (+rev). Public API: ng.matizer.sort(), ng.matizer.refresh().",
	dependencies: [],
	author: "NexiGrid",
	experimental: false
};

u.log('[NG] ng_matizer.js v1.0 loaded');

/* ==========================================================
   REGISTRATION
========================================================== */

if (window.ng) {
	window.ng.registerComponent('matizer', initMatizer);

	// API pubblica runtime
	window.ng.matizer = {
		sort,
		refresh
	};
}