import * as u from './ng_utils.js';
import { initState } from './ng_state.js';

window.ng = (function () {

	const components = {};
	let booted = false;

	function normalizeName(name) {
		return String(name || '').trim().toLowerCase();
	}

	/* ==========================================================
	   REGISTRY
	========================================================== */

	function registerComponent(name, fn) {

		if (!name?.trim?.() || typeof fn !== 'function') {
			u.error?.(`Invalid component registration: "${name}"`);
			return null;
		}

		const componentName = normalizeName(name);

		if (components[componentName]) {
			u.warn?.(`Component "${componentName}" already registered`);
			return components[componentName];
		}

		components[componentName] = {
			fn,
			instances: {},
			ready: true,
			registeredAt: Date.now(),
			updatedAt: Date.now()
		};

		return components[componentName];
	}

	function initComponent(name, scope = document) {

		const componentName = normalizeName(name);
		const entry = components[componentName];

		if (!entry || typeof entry.fn !== 'function') {
			u.warn?.(`Component "${componentName}" not registered`);
			return false;
		}

		try {

			const instances = entry.fn(scope);

			if (Array.isArray(instances)) {

				instances.forEach(el => {

					if (!el?.getAttribute) return;

					let uid = el.getAttribute('data-ng-uid');
					if (uid && entry.instances[uid]) {
						return; // istanza già registrata → skip
					}
					if (!uid) { // Controla che uid non sia presente
						uid = u.generateUID();
						el.setAttribute('data-ng-uid', uid);
					}

					entry.instances[uid] = {
						element: el,
						uid,
						id: el.id || null,
						data: {},
						listeners: Array.isArray(el.__ngListeners) ? el.__ngListeners : [],
						ready: true,
						initSource: scope === document ? 'global' : 'partial',
						registeredAt: Date.now(),
						updatedAt: Date.now()
					};

					delete el.__ngListeners;
				});
			}

			entry.ready = true;
			entry.updatedAt = Date.now();

			return instances;

		} catch (e) {

			entry.ready = false;
			entry.updatedAt = Date.now();
			u.error?.(`Component "${componentName}" init failed:`, e);

			return false;
		}
	}

	function init(scope = document) {

		Object.keys(components).forEach(name => {
			initComponent(name, scope);
		});

		if (!booted && scope === document) {
			document.dispatchEvent(new Event('ng:ready'));
			u.log('[NG] Ready');
			booted = true;
			if (u.env !== 'prod') {
				console.info('[NG DEBUG] Active');
			}
		}
	}

	/* ==========================================================
	   REGISTRY API
	========================================================== */

	function listComponents() {
		return Object.keys(components);
	}

	function getComponentRegistry() {
		return components;
	}

	function returnComponent(name, uid = null) {

		const entry = components[normalizeName(name)];
		if (!entry) return null;

		if (!uid) return entry;
		return entry.instances?.[uid] || null;
	}

	function removeListeners(inst) {
		if (!Array.isArray(inst.listeners)) return;
		inst.listeners.forEach(({ el, type, handler, options }) => {
			try { el.removeEventListener(type, handler, options); } catch {}
		});
	}

	// Smontaggio completo di un'istanza: listener tracciati + teardown custom.
	// Hook custom = root.__ngProbe = { teardown() }, popolato dal componente in
	// initX per pulire risorse NON-listener (timer, observer, librerie terze,
	// BroadcastChannel, RAF loop). Chiamato una sola volta, poi rimosso.
	function teardownInstance(inst) {
		removeListeners(inst);
		const el = inst.element;
		try { el?.__ngProbe?.teardown?.(); } catch {}
		if (el) {
			delete el.__ngListeners;
			delete el.__ngProbe;
		}
	}

	function removeComponent(name, uid = null, removeFromDOM = false) {

		const entry = components[normalizeName(name)];
		if (!entry) return false;

		const ids = uid ? [uid] : Object.keys(entry.instances);

		ids.forEach(id => {

			const inst = entry.instances[id];
			if (!inst) return;

			// 1) Listener tracciati + teardown custom (prima del remove DOM)
			teardownInstance(inst);

			// 2) Rimozione DOM opzionale
			if (removeFromDOM && inst.element?.remove) {
				inst.element.remove();
			}

			delete entry.instances[id];
		});

		entry.updatedAt = Date.now();
		return true;
	}

	function cleanRegistry() {

		Object.entries(components).forEach(([, entry]) => {

			Object.entries(entry.instances).forEach(([uid, inst]) => {
				if (!inst.element || !document.contains(inst.element)) {
					teardownInstance(inst);
					delete entry.instances[uid];
				}
			});

			entry.updatedAt = Date.now();
		});
	}

	/* ==========================================================
	   MOUNT / UNMOUNT — API raccomandata per istanziazione runtime
	========================================================== */

	function _resolveScope(scope) {
		if (scope === document || scope instanceof Element) return scope;
		return document;
	}

	// ng.mount(scope, name?)
	// - scope: HTMLElement | document
	// - name: opzionale; se omesso, monta tutti i componenti registrati
	// Ritorna { componentName: instances[] }
	function mount(scope, name) {

		const root = _resolveScope(scope);
		const result = {};

		if (name) {
			const componentName = normalizeName(name);
			if (!components[componentName]) {
				u.warn?.(`ng.mount: component "${componentName}" not registered`);
				return result;
			}
			const instances = initComponent(componentName, root);
			result[componentName] = Array.isArray(instances) ? instances : [];
			return result;
		}

		Object.keys(components).forEach(n => {
			const instances = initComponent(n, root);
			result[n] = Array.isArray(instances) ? instances : [];
		});

		return result;
	}

	// ng.unmount(scope, name?)
	// Smonta istanze il cui root element è scope stesso o discendente di scope.
	// - scope: HTMLElement | document
	// - name: opzionale; se omesso, smonta tutti i componenti
	// Ritorna { componentName: count }
	function unmount(scope, name) {

		const root = _resolveScope(scope);
		const result = {};
		const names = name ? [normalizeName(name)] : Object.keys(components);

		names.forEach(n => {

			const entry = components[n];
			if (!entry) return;

			let count = 0;
			const ids = Object.keys(entry.instances);

			ids.forEach(uid => {

				const inst = entry.instances[uid];
				if (!inst?.element) return;

				const inScope = root === document
					|| inst.element === root
					|| (root.contains && root.contains(inst.element));

				if (!inScope) return;

				teardownInstance(inst);

				delete entry.instances[uid];
				count++;
			});

			if (count > 0) entry.updatedAt = Date.now();
			result[n] = count;
		});

		return result;
	}

	function isComponentReady(name) {

		const entry = components[normalizeName(name)];
		if (!entry) return 'missing';

		return entry.ready ? 'ready' : 'error';
	}

	/* ==========================================================
	   DISPATCHER
	========================================================== */

	function dispatchAction(action, el, targetSel, event) {

		// guard azioni riservate (hard-safe)
		if (!action || typeof action !== 'string') return false;

		const a = action.trim().toLowerCase();
		const reserved = [
			'registercomponent',
			'init',
			'initcomponent',
			'removecomponent',
			'cleanregistry',
			'mount',
			'unmount',
			'on',
			'dispatchaction',
			'listcomponents',
			'returncomponent',
			'getcomponentregistry',
			'iscomponentready',
			'resolveelements',
			'generateuid'
		];

		if (reserved.includes(a)) return false;

		let target = el;

		if (targetSel) {

			if (typeof targetSel === 'string') {
				target =
					el?.querySelector?.(targetSel) ||
					document.querySelector(targetSel);
			}
			else if (targetSel instanceof HTMLElement) {
				target = targetSel;
			}
		}

		const fn = window.ng?.[a];

		if (typeof fn === 'function') {
			fn(el, target, event);
			return true;
		}

		u.warn?.(`[ng] Action "${action}" not found`, el);
		return false;
	}

	function on(selectorOrEl, type, handler, options) {

		let els = [];

		if (typeof selectorOrEl === 'string') {
			els = Array.from(document.querySelectorAll(selectorOrEl));
		}
		else if (selectorOrEl instanceof Element) {
			els = [selectorOrEl];
		}
		else if (selectorOrEl instanceof NodeList || Array.isArray(selectorOrEl)) {
			els = Array.from(selectorOrEl);
		}

		els.forEach(el => {

			const wrapped = e => handler(el, e);

			// usa la tracking utility (single source of truth)
			u.listen(el, type, wrapped, options);
		});

		return els;
	}

	/* ==========================================================
	   PUBLIC API
	========================================================== */

	const api = {
		registerComponent,
		initComponent,
		init,
		mount,
		unmount,
		on,
		listComponents,
		returnComponent,
		removeComponent,
		cleanRegistry,
		isComponentReady,
		dispatchAction,
		generateUID: u.generateUID,
		resolveElements: u.resolveElements
	};

	if (u.env !== 'prod') {
		api.getComponentRegistry = getComponentRegistry;
		api.warn = u.warn;
		api.error = u.error;
	}

	return api;


})();

/* ==========================================================
   AUTO INIT
========================================================== */

function bootNG() {
	initState();
	window.ng.init();
	// Observer attivo di default: auto-mount on insert, auto-unmount on remove,
	// cleanRegistry throttled. Disabilitabile via ng.observer.disable().
	try {
		window.ng.observer?.enable?.({ cleanRegistry: true });
	} catch (e) {
		// observer non caricato (modalità minimal): skip
	}
	window.ng.modalState = { type:null, action:null, id:null, name:null };
	window.ng.appState ||= {};
}

if (document.readyState === 'complete') {
	bootNG();
} else {
	document.addEventListener('DOMContentLoaded', bootNG, { once: true });
}