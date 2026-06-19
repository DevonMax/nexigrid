import * as u from './ng_utils.js';

/*
==========================================================
NexiGrid – State Manager v0.8
==========================================================
Dual pipeline state manager con persistenza localStorage.

Pipeline:
  - Mirror  : sync bidirezionale su input / select / checkbox / radio
  - Dataset : snapshot on-event (sola scrittura)

Features:
  - Persistenza automatica in localStorage
  - TTL per chiave / namespace / globale (secondi via attributo, ms via JS)
  - Purge automatico chiavi scadute al load
  - Sync in tempo reale tra tab (BroadcastChannel)
  - Watch / Unwatch per logica applicativa senza DOM
  - Default da attributo o valore corrente del DOM al load

Attributi Mirror:
  data-ng-state          Marca l'elemento come state-aware
  data-state-id          Chiave stato (formato consigliato: namespace:prop)
  data-state-prop        Proprietà dentro la chiave
  data-state-from        Sorgente valore: 'value' | 'checked'
  data-state-default     Valore default se DOM e storage sono vuoti
  data-state-ttl         Scadenza in secondi
  data-state-debounce    Debounce in ms per input text (default 300)

Attributi Dataset:
  data-ng-state          Marca l'elemento come state-aware
  data-state-id          Chiave stato (formato consigliato: namespace:prop)
  data-state-val         Valore statico (button, link)
  data-state-get         Sorgente: 'value' | 'checked' | 'attr'
  data-state-default     Valore default se vuoto (input, select)

API: ng.state.get/getAll/set/remove/resetKey/resetNamespace/reset
     ng.state.setTTL/getTTL/watch/unwatch
==========================================================
*/

export function initState(scope = document) {

	// Singleton: esegue solo una volta
	if (window.ng?.state) return [];

	window.ng ||= {};
	const ng = window.ng;

	const STORAGE_KEY = 'ng:appState';
	const TTL_KEY     = 'ng:ttlConfig';
	const _watchers   = new Map();
	const _channel    = new BroadcastChannel('ng:state');

// =========================
// TTL CONFIG
// =========================

	// Carica configurazione TTL da localStorage
	const _ttlConfig = (() => {
		try {
			const raw = localStorage.getItem(TTL_KEY);
			return raw ? JSON.parse(raw) : {};
		} catch { return {}; }
	})();

	function saveTTLConfig() {
		try {
			localStorage.setItem(TTL_KEY, JSON.stringify(_ttlConfig));
		} catch {}
	}

	// Risolve TTL per una chiave: chiave > namespace > globale
	function getTTLForKey(key) {
		if (_ttlConfig[key])  return _ttlConfig[key];
		const ns = key.split(':')[0];
		if (_ttlConfig[ns])   return _ttlConfig[ns];
		if (_ttlConfig['*'])  return _ttlConfig['*'];
		return 0;
	}

	// Elimina le chiavi scadute al load, prima di qualsiasi operazione
	function purgeExpired() {
		const now = Date.now();
		let dirty = false;
		Object.keys(ng.appState).forEach(key => {
			const entry = ng.appState[key];
			if (entry?._exp && now > entry._exp) {
				delete ng.appState[key];
				dirty = true;
			}
		});
		if (dirty) save();
	}

// =========================
// LOAD / SAVE
// =========================

	function load() {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			return raw ? JSON.parse(raw) : {};
		} catch { return {}; }
	}

	function save() {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(ng.appState));
		} catch {}
	}

	// Notifica watcher e dispatcha evento globale
	function emit(key, value, source = null) {
		_watchers.get(key)?.forEach(fn => {
			try { fn(value, key); } catch {}
		});
		document.dispatchEvent(new CustomEvent('ng:state:change', {
			detail: { key, value, source }
		}));
	}

// =========================
// INIT
// =========================

	ng.appState = load();
	purgeExpired();

// =========================
// API
// =========================

	ng.state = {

		// Ritorna il valore di una chiave, null se scaduta
		get(key) {
			if (!key) return ng.appState;
			const entry = ng.appState[key];
			if (entry?._exp && Date.now() > entry._exp) {
				delete ng.appState[key];
				save();
				return null;
			}
			return entry?._value !== undefined ? entry._value : entry;
		},

		// Ritorna tutto lo state, purgando le chiavi scadute
		getAll() {
			const now = Date.now();
			const result = {};
			let dirty = false;
			Object.keys(ng.appState).forEach(key => {
				const entry = ng.appState[key];
				if (entry?._exp && now > entry._exp) {
					delete ng.appState[key];
					dirty = true;
					return;
				}
				result[key] = entry?._value !== undefined ? entry._value : entry;
			});
			if (dirty) save();
			return result;
		},

		// Salva un valore, applica TTL se configurato, notifica tab e watcher
		set(key, value, source = null) {

			try {
				if (!key) return false;

				const ttl = getTTLForKey(key);
				ng.appState[key] = ttl > 0
					? { _value: value, _exp: Date.now() + ttl }
					: value;
				save();
				_channel.postMessage({ type: 'set', key, value, entry: ng.appState[key] });
				emit(key, value, source);
				return true;
			} catch (e) {
				return false;
			}
		},

		// Configura TTL in ms per chiave, namespace o globale ('*')
		setTTL(ms, target = '*') {
			if (!ms || ms <= 0) {
				delete _ttlConfig[target];
			} else {
				_ttlConfig[target] = ms;
			}
			saveTTLConfig();
		},

		// Legge TTL configurato per un target
		getTTL(target = '*') {
			return _ttlConfig[target] || 0;
		},

		// Elimina una chiave da state e TTL config
		remove(key) {
			delete ng.appState[key];
			delete _ttlConfig[key];
			save();
			saveTTLConfig();
			emit(key, null, null);
			_channel.postMessage({ type: 'remove', key });
		},

		// Alias semantico di remove
		resetKey(key) {
			delete ng.appState[key];
			delete _ttlConfig[key];
			save();
			saveTTLConfig();
			emit(key, null, null);
			_channel.postMessage({ type: 'remove', key });
		},

		// Elimina tutte le chiavi di un namespace e il suo TTL config
		resetNamespace(ns) {
			const removed = Object.keys(ng.appState).filter(k => k.startsWith(ns + ':'));
			removed.forEach(k => delete ng.appState[k]);
			delete _ttlConfig[ns];
			save();
			saveTTLConfig();
			removed.forEach(k => emit(k, null, null));
			_channel.postMessage({ type: 'resetNamespace', ns });
		},

		// Reset totale: state, TTL config, notifica tutte le tab
		reset() {
			const removed = Object.keys(ng.appState);
			ng.appState = {};
			localStorage.removeItem(STORAGE_KEY);
			localStorage.removeItem(TTL_KEY);
			Object.keys(_ttlConfig).forEach(k => delete _ttlConfig[k]);
			removed.forEach(k => emit(k, null, null));
			_channel.postMessage({ type: 'reset' });
		},

		// Registra un callback su cambio chiave — ritorna fn per unwatch
		watch(key, fn) {
			if (typeof fn !== 'function') return;
			if (!_watchers.has(key)) _watchers.set(key, new Set());
			_watchers.get(key).add(fn);
			return fn;
		},

		// Rimuove un watcher specifico o tutti i watcher della chiave
		unwatch(key, fn) {
			if (!fn) {
				_watchers.delete(key);
				return;
			}
			_watchers.get(key)?.delete(fn);
		}
	};

// =========================
// RUNTIME PIPELINE (MIRROR)
// =========================

	const _debounceMap = new WeakMap();

	function handleRuntime(e) {

		const el = e.target.closest('[data-ng-state][data-state-from]');
		if (!el) return;

		// select / checkbox / radio → solo evento 'change', ignora 'input'
		const isSelectOrToggle =
			el.tagName === 'SELECT' ||
			el.type === 'checkbox'  ||
			el.type === 'radio';

		if (isSelectOrToggle && e.type === 'input') return;

		const key  = el.dataset.stateId;
		const prop = el.dataset.stateProp;
		const from = el.dataset.stateFrom;

		if (!key || !prop || !from) return;

		let val;
		if (from === 'value')   val = el.value;
		if (from === 'checked') val = !!el.checked;

		const prev = ng.state.get(key) || {};
		const next = { ...prev, [prop]: val };

		// Debounce attivo solo su input text (default 300ms)
		const delay = el.dataset.stateDebounce !== undefined
			? parseInt(el.dataset.stateDebounce, 10)
			: 300;

		const isTextInput =
			el.tagName === 'INPUT' &&
			(el.type === 'text' || el.type === 'search' || el.type === 'email');

		if (delay > 0 && isTextInput) {
			clearTimeout(_debounceMap.get(el));
			const t = setTimeout(() => ng.state.set(key, next, el), delay);
			_debounceMap.set(el, t);
			return;
		}

		ng.state.set(key, next, el);
	}

	// Sincronizza tutti gli elementi DOM collegati a una chiave
	function syncRuntime(key, value, source) {

		const nodes = document.querySelectorAll(
			`[data-state-id="${key}"][data-state-from]`
		);

		nodes.forEach(el => {

			// Non risincronizza l'elemento che ha generato il cambio
			if (el === source) return;

			const prop = el.dataset.stateProp;
			const from = el.dataset.stateFrom;

			if (!prop || !from) return;

			const val = value?.[prop];
			if (val === undefined) return;

			// RADIO
			if (el.type === 'radio' && from === 'value') {
				el.checked = String(el.value) === String(val);
				return;
			}

			// CHECKBOX
			if (from === 'checked') {
				el.checked = !!val;
				return;
			}

			// INPUT / SELECT
			if (from === 'value' && 'value' in el) {
				el.value = val ?? '';
			}
		});
	}

// =========================
// DOM INIT + TTL DA ATTRIBUTO
// =========================

	// Idempotente e scope-aware: idrata default + TTL da attributo + sync DOM dai
	// valori salvati. Chiamata al boot (document) e dall'observer su ogni scope
	// inserito a runtime (componente 'state' registrato sotto) — B2.
	function hydrateScope(root = document) {

		const stateEls = u.resolveElements(root, '[data-state-id]');
		if (!stateEls.length) return [];

		// MIRROR: chiavi presenti nello scope
		const keys = new Set(stateEls.map(el => el.dataset.stateId).filter(Boolean));

		keys.forEach(key => {

			const ttlEl = u.resolveElements(root, `[data-state-id="${key}"][data-state-ttl]`)[0];
			if (ttlEl) {
				const ttl = (parseInt(ttlEl.dataset.stateTtl) || 0) * 1000;
				if (ttl > 0) ng.state.setTTL(ttl, key);
			}

			const saved = ng.state.get(key);
			if (saved && typeof saved === 'object' && Object.keys(saved).length) {
				syncRuntime(key, saved, null);
				return;
			}

			const els = u.resolveElements(root, `[data-state-id="${key}"][data-state-prop][data-state-from]`);
			if (!els.length) return;

			const built = {};
			const defaultVal = els[0].dataset.stateDefault;

			els.forEach(el => {
				const prop = el.dataset.stateProp;
				const from = el.dataset.stateFrom;
				if (!prop || !from) return;
				if (from === 'checked') {
					built[prop] = el.checked;
				} else if (from === 'value' && 'value' in el) {
					built[prop] = el.value !== '' ? el.value : (defaultVal ?? '');
				}
			});

			if (Object.keys(built).length) ng.state.set(key, built, null);
		});

		// TTL globale ('*') / namespace da <meta> nello scope
		u.resolveElements(root, '[data-state-id][data-state-ttl]').forEach(el => {
			const target = el.dataset.stateId;
			const ttl    = (parseInt(el.dataset.stateTtl) || 0) * 1000;
			if (ttl > 0 && (target === '*' || !target.includes(':'))) {
				ng.state.setTTL(ttl, target);
			}
		});

		// DATASET: idrata gli elementi data-state-get dai valori salvati
		u.resolveElements(root, '[data-state-id][data-state-get]').forEach(el => {
			const key   = el.dataset.stateId;
			const value = ng.state.get(key);
			if (value === null || value === undefined) return;

			const get = el.dataset.stateGet;
			if (get === 'value' && 'value' in el) {
				const prop = el.dataset.stateProp;
				const val  = (prop && typeof value === 'object') ? value[prop] : value;
				el.value   = val !== undefined ? String(val) : '';
				return;
			}
			if (get === 'checked') {
				el.checked = value === true || value === 'true';
			}
		});

		return [];
	}

	// Boot: idrata il documento (timing invariato, prima di ng:ready).
	hydrateScope(document);
	// Registra 'state' come componente → l'observer ri-idrata gli scope inseriti.
	window.ng.registerComponent?.('state', hydrateScope);

// =========================
// DATASET PIPELINE
// =========================

	const _DATASET_RESERVED = new Set([
		'ngState', 'stateId', 'stateGet', 'stateDefault', 'stateTtl', 'stateDebounce', 'stateVal'
	]);

	// Strip prefisso 'state': stateRole → 'role', stateLevel → 'level'
	function collectAttrs(el) {
		const data = {};
		for (const k in el.dataset) {
			if (_DATASET_RESERVED.has(k)) continue;
			if (!k.startsWith('state')) continue;
			const key = k.slice(5, 6).toLowerCase() + k.slice(6);
			data[key] = el.dataset[k];
		}
		return data;
	}

	function handleDataset(e) {

		if (!(e.target instanceof Element)) return;

		const el = e.target.closest('[data-ng-state]');
		if (!el) return;

		if (el.dataset.stateFrom !== undefined) return;

		const key  = el.dataset.stateId;
		if (!key) return;

		const get  = el.dataset.stateGet;
		const def  = el.dataset.stateDefault;
		const prop = el.dataset.stateProp;

		function _set(value) {
			if (prop) {
				const prev = ng.state.get(key);
				const base = (prev && typeof prev === 'object' && !Array.isArray(prev)) ? prev : {};
				ng.state.set(key, { ...base, [prop]: value }, el);
			} else {
				ng.state.set(key, value, el);
			}
		}

		// click → data-state-val oppure data-state-get="attr"
		if (e.type === 'click') {
			if (el.dataset.stateVal !== undefined) {
				_set(el.dataset.stateVal);
				return;
			}
			if (get === 'attr') {
				const data = collectAttrs(el);
				if (Object.keys(data).length) ng.state.set(key, data, el);
			}
			return;
		}

		// blur → default su campo vuoto
		if (e.type === 'blur') {
			if (get !== 'value' || def === undefined || el.value !== '') return;
			_set(def);
			return;
		}

		// change → data-state-get="value"
		if (get === 'value') {
			const val = el.value !== '' ? el.value : (def ?? '');
			if (val === '') return;
			_set(val);
			return;
		}

		// change → data-state-get="checked"
		if (get === 'checked') {
			_set(!!el.checked);
			return;
		}
	}

// =========================
// TAB SYNC
// =========================

	// Riceve messaggi dalle altre tab e sincronizza state e DOM
	// BroadcastChannel non invia a se stesso: zero rischio loop
	_channel.onmessage = ({ data }) => {

		if (data.type === 'reset') {
			ng.appState = {};
			return;
		}

		if (data.type === 'remove') {
			delete ng.appState[data.key];
			syncRuntime(data.key, null, null);
			return;
		}

		if (data.type === 'resetNamespace') {
			Object.keys(ng.appState).forEach(k => {
				if (k.startsWith(data.ns + ':')) delete ng.appState[k];
			});
			return;
		}

		if (data.type === 'set') {
			const { key, value, entry } = data;
			ng.appState[key] = entry !== undefined ? entry : value;
			syncRuntime(key, value, null);
			_watchers.get(key)?.forEach(fn => {
				try { fn(value, key); } catch {}
			});
		}
	};

// =========================
// EVENT BINDING
// =========================

	document.addEventListener('input',  handleRuntime);
	document.addEventListener('change', handleRuntime);
	document.addEventListener('change', handleDataset);
	document.addEventListener('click',  handleDataset);
	document.addEventListener('blur',   handleDataset, true);

// =========================
// GLOBAL SYNC
// =========================

	// Sincronizza il DOM ad ogni cambio di stato (emesso da set())
	document.addEventListener('ng:state:change', e => {
		const { key, value, source } = e.detail;
		syncRuntime(key, value, source);
	});

// =========================
// META
// =========================

	ng.state._meta = {
		name:         "state",
		version:      "1.0.0",
		description:  "State manager – dual pipeline (runtime mirror + dataset snapshot) with TTL, watch and tab sync",
		dependencies: [],
		author:       "NexiGrid",
		experimental: false
	};

	return [];
}