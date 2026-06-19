// File: ng_observer.js
// NexiGrid 0.6 – DOM Observer (minimal, contract-aligned)
//
// NOTE:
// - Non rompe nulla: stessa API + stesso comportamento base.
// - Evita che cleanRegistry diventi costoso: throttling + chiamata unica per flush.
// - Queue compress più leggera (evita O(n^2) sul contains).

import * as u from './ng_utils.js';

let _observer = null;
let _active = false;

const _queue = new Set();
const _removedQueue = new Set();
let _scheduled = false;

const _state = {
	root: null,
	useRAF: true,
	scanExisting: false,
	components: null,			// null = all (ng.init). Array = solo questi (ng.initComponent)
	cleanRegistry: false,		// se true, chiama ng.cleanRegistry() (throttled)
	cleanRegistryEvery: 6,		// ogni N flush (se cleanRegistry=true)
	cleanRegistryMinMs: 1500,	// oppure dopo almeno X ms dall’ultima pulizia
};

let _flushCount = 0;
let _lastCleanAt = 0;

function _isElement(node) {
	return node && node.nodeType === 1;
}

/*
	Compress:
	- rimuove duplicati e discendenti se l’ancestor è già presente.
	- evita n^2 “some(contains)” su tutti i nodi:
		1) ordina per profondità (ancestor prima)
		2) scorre e mantiene solo nodi che non sono contenuti dall’ultimo “keeper” che li contiene
*/
function _depth(node) {
	let d = 0;
	let n = node;
	while (n && n.parentElement) {
		d++;
		n = n.parentElement;
	}
	return d;
}

function _compress(nodes) {

	const list = Array.from(nodes).filter(_isElement);

	// Ancestor prima (profondità minore prima)
	list.sort((a, b) => _depth(a) - _depth(b));

	const out = [];

	// Manteniamo un set degli elementi già “coperti” tramite ancestor
	// Strategy: per ogni nodo, se uno degli out lo contiene -> skip
	// Nota: out è tipicamente molto più piccolo della list, costo reale basso
	for (const n of list) {

		let covered = false;

		// Scorri solo out (che è compressa)
		for (let i = 0; i < out.length; i++) {
			const p = out[i];
			if (p !== n && p.contains(n)) {
				covered = true;
				break;
			}
		}

		if (!covered) out.push(n);
	}

	return out;
}

function _shouldCleanRegistry() {

	if (!_state.cleanRegistry) return false;

	const now = Date.now();

	// 1) ogni N flush
	if (_state.cleanRegistryEvery > 0 && (_flushCount % _state.cleanRegistryEvery) === 0) {
		if (now - _lastCleanAt >= _state.cleanRegistryMinMs) return true;
	}

	// 2) oppure almeno ogni X ms, anche se non raggiunge N flush
	if (now - _lastCleanAt >= _state.cleanRegistryMinMs * 2) return true;

	return false;
}

function _flushRemoved() {

	if (!_removedQueue.size) return;

	const nodes = Array.from(_removedQueue);
	_removedQueue.clear();

	try {

		// Cleanup immediato delle istanze rimosse: per ogni nodo rimosso,
		// scorre il subtree e smonta le istanze trovate.
		nodes.forEach(removed => {
			if (!removed) return;
			// Skip nodi ancora connessi: sono stati spostati (portal,
			// move, riordino DOM), non realmente rimossi. Unmount qui
			// rimuoverebbe i listener di componenti perfettamente vivi
			// (es. popover.open() sposta il root in <body>).
			if (document.contains(removed)) return;
			window.ng?.unmount?.(removed);
		});

	} catch (e) {
		u.error?.('ng.observer removed-flush failed:', e);
	}
}

function _flush() {

	_flushRemoved();

	if (!_queue.size) return;

	const nodes = _compress(_queue);
	_queue.clear();

	try {

		if (!_state.components || !Array.isArray(_state.components) || !_state.components.length) {

			// Init globale su scope: core scorre registry e chiama initComponent(name, scope)
			nodes.forEach(scope => window.ng?.init?.(scope));

		} else {

			// Init mirato solo su subset componenti
			nodes.forEach(scope => {
				_state.components.forEach(name => window.ng?.initComponent?.(name, scope));
			});
		}

		_flushCount++;

		// cleanRegistry throttled (mai per ogni mutazione)
		if (_shouldCleanRegistry()) {
			window.ng?.cleanRegistry?.();
			_lastCleanAt = Date.now();
		}

	} catch (e) {
		u.error?.('ng.observer flush failed:', e);
	}
}

function _scheduleFlush() {

	if (_scheduled) return;
	_scheduled = true;

	let raf = 0, to = 0;

	const run = () => {
		if (!_scheduled) return;          // già eseguito dall'altro canale
		_scheduled = false;
		if (raf) cancelAnimationFrame(raf);
		clearTimeout(to);
		_flush();
	};

	if (_state.useRAF && typeof requestAnimationFrame === 'function') {
		raf = requestAnimationFrame(run);
		// Fallback: se rAF è throttlato (tab in background), forza il flush.
		to = setTimeout(run, 100);
		return;
	}

	if (typeof queueMicrotask === 'function') {
		queueMicrotask(run);
		return;
	}

	Promise.resolve().then(run);
}

function _enqueue(node) {
	if (!_isElement(node)) return;
	_queue.add(node);
	_scheduleFlush();
}

function _enqueueRemoved(node) {
	if (!_isElement(node)) return;
	_removedQueue.add(node);
	_scheduleFlush();
}

function _scanExisting() {

	const root = _state.root || document.body || document.documentElement;
	if (!root) return;

	// Scansiona root + subtree: init su root, per contratto idempotente
	_enqueue(root);
}

function enable(options = {}) {

	if (!window.ng) {
		u.error?.('ng.observer requires ng core loaded first');
		return false;
	}

	if (_active) return true;

	_state.root = options.root instanceof Element
		? options.root
		: (document.body || document.documentElement);

	_state.useRAF = options.useRAF !== false; // default true
	_state.scanExisting = options.scanExisting === true;
	_state.cleanRegistry = options.cleanRegistry === true;

	if (typeof options.cleanRegistryEvery === 'number') {
		_state.cleanRegistryEvery = Math.max(1, options.cleanRegistryEvery | 0);
	}
	if (typeof options.cleanRegistryMinMs === 'number') {
		_state.cleanRegistryMinMs = Math.max(250, options.cleanRegistryMinMs | 0);
	}

	if (Array.isArray(options.components) && options.components.length) {
		_state.components = options.components
			.map(n => String(n || '').trim().toLowerCase())
			.filter(Boolean);
	} else {
		_state.components = null;
	}

	_flushCount = 0;
	_lastCleanAt = 0;

	_observer = new MutationObserver(mutations => {

		for (const m of mutations) {
			if (m.type !== 'childList') continue;

			m.addedNodes?.forEach(node => {
				if (_isElement(node)) _enqueue(node);
			});

			m.removedNodes?.forEach(node => {
				if (_isElement(node)) _enqueueRemoved(node);
			});
		}
	});

	_observer.observe(_state.root, {
		childList: true,
		subtree: true,
	});

	_active = true;

	if (_state.scanExisting) {
		_scanExisting();
	}

	return true;
}

function disable() {

	if (!_active) return true;

	try { _observer?.disconnect?.(); } catch {}
	_observer = null;

	_queue.clear();
	_removedQueue.clear();
	_scheduled = false;

	_active = false;
	return true;
}

function isActive() {
	return _active;
}

function configure(options = {}) {

	// tuning runtime (senza restart)
	if (options.root instanceof Element && options.root !== _state.root) {
		_state.root = options.root;
		// Se attivo, ri-osserva il nuovo root (altrimenti resterebbe sul vecchio)
		if (_active && _observer) {
			try { _observer.disconnect(); } catch {}
			_observer.observe(_state.root, { childList: true, subtree: true });
		}
	}
	if (typeof options.useRAF === 'boolean') _state.useRAF = options.useRAF;
	if (typeof options.scanExisting === 'boolean') _state.scanExisting = options.scanExisting;
	if (typeof options.cleanRegistry === 'boolean') _state.cleanRegistry = options.cleanRegistry;

	if (typeof options.cleanRegistryEvery === 'number') {
		_state.cleanRegistryEvery = Math.max(1, options.cleanRegistryEvery | 0);
	}
	if (typeof options.cleanRegistryMinMs === 'number') {
		_state.cleanRegistryMinMs = Math.max(250, options.cleanRegistryMinMs | 0);
	}

	if (Array.isArray(options.components)) {
		_state.components = options.components
			.map(n => String(n || '').trim().toLowerCase())
			.filter(Boolean);
	}
}

// Attach su window.ng: ng.observer.enable()
function _attachToNG() {

	if (!window.ng) return;

	window.ng.observer = {
		enable,
		disable,
		isActive,
		configure,
		_scanExisting,
	};
}

_attachToNG();

export default {
	enable,
	disable,
	isActive,
	configure,
};