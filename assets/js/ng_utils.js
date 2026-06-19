/* ==========================================================
   NexiGrid 0.6 – Core Utils (pure utilities only)
   ========================================================== */

/* =========================
   Core Metadata
========================= */

export const env = 'prod'; // dev | stage | prod
export const version = '1.1.0';
export const systemApp = 'nexigrid';
export const appId = 'cralamga-app';
export const buildStamp = '';
export const dateZone = 'Europe/Rome';
export const dateFormat = 'it-IT';

/* =========================
   Logging (env-aware)
========================= */

export function log(...args) {
	if (env !== 'prod') console.log(...args);
}

export function warn(...args) {
	if (env !== 'prod') console.warn(...args);
}

export function error(...args) {
	if (env !== 'prod') console.error(...args);
}

/* =========================
   DOM Helpers
========================= */

export function resolveElements(scope, selector) {

	let elements = [];

	// 1) se scope è elemento → includi se matcha
	if (scope instanceof Element && scope.matches(selector)) {
		elements.push(scope);
	}

	// 2) aggiungi i figli
	const found = scope.querySelectorAll
		? Array.from(scope.querySelectorAll(selector))
		: [];

	return elements.concat(found);
}

export function generateUID(length = 12) {

	const prefix = 'ng-';
	const len = Math.max(length - prefix.length, 4);
	let uid;

	do {
		uid = `${prefix}${Math.random().toString(36).slice(2, 2 + len)}`;
	} while (document.querySelector(`[data-ng-uid="${uid}"]`));

	return uid;
}

export function listen(el, type, handler, options = false, store = null) {

	if (!el || !type || typeof handler !== 'function') return;

	const once = !!(options && typeof options === 'object' && options.once);

	const record = { el, type, handler, options };

	// {once:true}: il browser rimuove il listener nativo dopo il fire → rimuovi
	// anche il record dal tracking, per non lasciare riferimenti stantii.
	const bound = once
		? function (e) {
			const arr = el.__ngListeners;
			if (arr) { const i = arr.indexOf(record); if (i > -1) arr.splice(i, 1); }
			if (Array.isArray(store)) { const j = store.indexOf(record); if (j > -1) store.splice(j, 1); }
			return handler.call(this, e);
		}
		: handler;

	record.handler = bound; // removeEventListener combacia anche se pulito prima del fire

	el.addEventListener(type, bound, options);

	// Memory Safety: sempre tracciato su elemento
	(el.__ngListeners ||= []).push(record);

	// Store opzionale esterno
	if (Array.isArray(store)) {
		store.push(record);
	}
}

export function isElement(obj) {
	return obj instanceof Element;
}

export function isFunction(fn) {
	return typeof fn === 'function';
}

export function debounce(fn, wait = 150) {

	let t;

	return function (...args) {

		clearTimeout(t);

		t = setTimeout(() => {
			fn.apply(this, args);
		}, wait);
	};
}

/* =========================
   Date Parsing
========================= */

export function parseDate(value, options = {}) {

	if (!value || typeof value !== 'string') return NaN;

	const {
		locale = dateFormat === 'en-US' ? 'us' : 'eu',
		fallbackYear = new Date().getFullYear()
	} = options;

	const str = value.trim();

	let year, month, day;

	// YYYY-MM-DD / YYYY/MM/DD
	let m = str.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
	if (m) {
		year  = +m[1];
		month = +m[2];
		day   = +m[3];
		return build(year, month, day);
	}

	// DD/MM/YYYY or MM/DD/YYYY
	m = str.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
	if (m) {

		const a = +m[1];
		const b = +m[2];
		year = +m[3];

		if (locale === 'us') {
			month = a;
			day   = b;
		} else {
			day   = a;
			month = b;
		}

		return build(year, month, day);
	}

	// YYYY-MM
	m = str.match(/^(\d{4})[-\/](\d{1,2})$/);
	if (m) {
		year  = +m[1];
		month = +m[2];
		day   = 1;
		return build(year, month, day);
	}

	// MM-YYYY
	m = str.match(/^(\d{1,2})[-\/](\d{4})$/);
	if (m) {
		month = +m[1];
		year  = +m[2];
		day   = 1;
		return build(year, month, day);
	}

	// DD-MM or MM-DD (no year)
	m = str.match(/^(\d{1,2})[-\/](\d{1,2})$/);
	if (m) {

		const a = +m[1];
		const b = +m[2];

		if (locale === 'us') {
			month = a;
			day   = b;
		} else {
			day   = a;
			month = b;
		}

		year = fallbackYear;

		return build(year, month, day);
	}

	// YYYY
	m = str.match(/^(\d{4})$/);
	if (m) {
		year  = +m[1];
		month = 1;
		day   = 1;
		return build(year, month, day);
	}

	return NaN;
}

function build(year, month, day) {

	if (!isValid(year, month, day)) return NaN;

	return new Date(year, month - 1, day).getTime();
}

function isValid(year, month, day) {

	if (!Number.isInteger(year) || year < 1000 || year > 9999) return false;
	if (month < 1 || month > 12) return false;
	if (day < 1 || day > 31) return false;

	const d = new Date(year, month - 1, day);

	return (
		d.getFullYear() === year &&
		d.getMonth() === month - 1 &&
		d.getDate() === day
	);
}

/* =========================
   General Helpers
========================= */

export function isExists(selector, scope = document) {
	if (typeof selector !== 'string') return false;
	return !!scope.querySelector(selector);
}

export function noop() {}