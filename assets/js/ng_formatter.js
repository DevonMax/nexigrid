import * as u from './ng_utils.js';

/**
 * NexiGrid – Formatter
 * Runtime output formatter (stateless, DOM-first)
 */

/* ==========================================================
   INIT
========================================================== */

export function initFormatter(scope = document) {

	const roots = u.resolveElements(
		scope,
		'[data-format]:not([data-ng-uid])'
	);

	const initialized = [];

	roots.forEach(el => {

		applyFormat(el);

		el.setAttribute('data-ng-init', 'formatter');
		initialized.push(el);

	});

	return initialized;
}

/* ==========================================================
   CORE
========================================================== */

function applyFormat(el) {

	const type = (el.dataset.format || '').toLowerCase();
	if (!type) return;

	const raw = readValue(el);
	if (raw == null) return;

	let output = raw;

	switch (type) {

		case 'number':
			output = formatNumber(raw, el);
			break;

		case 'currency':
			output = formatCurrency(raw, el);
			break;

		case 'percent':
			output = formatPercent(raw, el);
			break;

		case 'date':
			output = formatDate(raw, el);
			break;
	}

	el.textContent = output;
}

/* ==========================================================
   VALUE
========================================================== */

function readValue(el) {

	if (el.dataset.value != null) {
		return el.dataset.value;
	}

	const txt = el.textContent?.trim();
	return txt !== '' ? txt : null;
}

/* ==========================================================
   FORMATTERS
========================================================== */

function formatNumber(val, el) {

	const n = Number(val);
	if (isNaN(n)) return val;

	const locale = el.dataset.locale || 'it-IT';

	return new Intl.NumberFormat(locale, {
		minimumFractionDigits: getMin(el),
		maximumFractionDigits: getMax(el)
	}).format(n);
}

function formatCurrency(val, el) {

	const n = Number(val);
	if (isNaN(n)) return val;

	const locale = el.dataset.locale || 'it-IT';
	const currency = el.dataset.currency || 'EUR';

	return new Intl.NumberFormat(locale, {
		style: 'currency',
		currency,
		minimumFractionDigits: getMin(el),
		maximumFractionDigits: getMax(el)
	}).format(n);
}

function formatPercent(val, el) {

	const n = Number(val);
	if (isNaN(n)) return val;

	const locale = el.dataset.locale || 'it-IT';

	return new Intl.NumberFormat(locale, {
		style: 'percent',
		minimumFractionDigits: getMin(el),
		maximumFractionDigits: getMax(el)
	}).format(n);
}

function formatDate(val, el) {

	const d = new Date(val);
	if (isNaN(d.getTime())) return val;

	const locale = el.dataset.locale || 'it-IT';

	return new Intl.DateTimeFormat(locale, {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(d);
}

/* ==========================================================
   OPTIONS
========================================================== */

function getMin(el) {
	return el.dataset.minFraction != null
		? Number(el.dataset.minFraction)
		: 0;
}

function getMax(el) {
	return el.dataset.maxFraction != null
		? Number(el.dataset.maxFraction)
		: 2;
}

/* ==========================================================
   API
========================================================== */

function format(el) {
	if (!el || !el.matches?.('[data-format]')) return;
	applyFormat(el);
}

function refresh(el) {
	if (!el || !el.matches?.('[data-format]')) return;
	applyFormat(el);
}

/* ==========================================================
   META
========================================================== */

initFormatter.meta = {
	name: "formatter",
	version: "1.0",
	description: "Output formatter for [data-format]: number, currency, percent, date. Locale-aware via Intl. Public API: ng.formatter.format/refresh.",
	dependencies: [],
	author: "NexiGrid",
	experimental: false
};

u.log('[NG] ng_formatter.js v1.0 loaded');

/* ==========================================================
   REGISTRATION
========================================================== */

if (window.ng) {

	window.ng.registerComponent('formatter', initFormatter);

	window.ng.formatter = {
		format,
		refresh
	};
}