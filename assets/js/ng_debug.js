import * as u from './ng_utils.js';

(function () {

	if (!window.ng) return;

	function getRegistry() {
		const reg = window.ng.getComponentRegistry?.();
		return (reg && typeof reg === 'object') ? reg : {};
	}

	function detectLeaks() {

		const reg = window.ng.getComponentRegistry?.() || {};
		const orphanInstances = [];
		const domOrphans = [];

		// Registry → DOM missing
		for (const [name, entry] of Object.entries(reg)) {

			for (const [uid, inst] of Object.entries(entry.instances || {})) {

				const el = inst.element || inst.el || null;

				if (!el || !document.contains(el)) {

					orphanInstances.push({
						Component: name,
						UID: uid,
						Tag: el?.tagName || 'N/A',
						ID: el?.id || '',
						Class: el?.className || '',
						Init: el?.dataset?.ngInit || '',
						Listeners: inst.listeners?.length || 0
					});
				}
			}
		}

		// DOM → UID non registrato
		document.querySelectorAll('[data-ng-uid]').forEach(el => {

			const uid = el.getAttribute('data-ng-uid');
			let found = false;

			for (const entry of Object.values(reg)) {
				if (entry.instances?.[uid]) {
					found = true;
					break;
				}
			}

			if (!found) {
				domOrphans.push({
					UID: uid,
					Tag: el.tagName,
					ID: el.id || '',
					Class: el.className || '',
					Init: el.dataset?.ngInit || ''
				});
			}
		});

		console.group('[NG DEBUG] Leak Report');

		if (orphanInstances.length) {
			console.warn(`Orphan Instances: ${orphanInstances.length}`);
			console.table(orphanInstances);
		}

		if (domOrphans.length) {
			console.warn(`DOM Orphans: ${domOrphans.length}`);
			console.table(domOrphans);
		}

		if (!orphanInstances.length && !domOrphans.length) {
			console.log('No leaks detected.');
		}

		console.groupEnd();

		return {
			orphanInstances,
			domOrphans
		};
	}

	function debugComponents(filterName = null) {

		const reg = getRegistry();
		const summary = [];
		let totalInstances = 0;

		for (const [name, entry] of Object.entries(reg)) {

			if (filterName && name !== filterName) continue;
			if (!entry || typeof entry !== 'object') continue;

			const instances = entry.instances && typeof entry.instances === 'object'
				? entry.instances
				: {};

			const count = Object.keys(instances).length;
			totalInstances += count;

			summary.push({
				Component: name,
				Instances: count,
				Function: typeof entry.fn === 'function'
					? (entry.fn.name || 'anonymous')
					: 'invalid',
				RegisteredAt: entry.registeredAt
					? new Date(entry.registeredAt).toLocaleString()
					: '-',
				UpdatedAt: entry.updatedAt
					? new Date(entry.updatedAt).toLocaleString()
					: '-'
			});
		}

		console.table(summary);
		console.log(
			`Total Components: ${filterName ? summary.length : Object.keys(reg).length}, Total Instances: ${totalInstances}`
		);
	}

	function debugListeners(filterName = null, filterUid = null) {

		const reg = getRegistry();
		const rows = [];
		let total = 0;

		for (const [name, entry] of Object.entries(reg)) {

			if (filterName && name !== filterName) continue;
			if (!entry?.instances) continue;

			for (const [uid, inst] of Object.entries(entry.instances)) {

				if (filterUid && uid !== filterUid) continue;
				const listeners = inst.listeners || inst.element?.__ngListeners || [];
				if (!Array.isArray(listeners)) continue;

				inst.listeners.forEach(l => {
					total++;

					rows.push({
						Component: name,
						UID: uid,
						Event: l.type || l.event || 'N/A',
						Target: l.el?.tagName
							? (
								l.el.tagName +
								(l.el.className
									? '.' + l.el.className
									: '')
							)
							: 'N/A',
						Handler: l.handler?.name || '(anonymous)'
					});
				});
			}
		}

		console.table(rows);
		console.log(`Total listeners: ${total}`);
	}

	function snapshot() {

		const reg = getRegistry();
		const safeRegistry = {};

		for (const [name, entry] of Object.entries(reg)) {

			safeRegistry[name] = {
				registeredAt: entry.registeredAt || null,
				updatedAt: entry.updatedAt || null,
				instances: {}
			};

			for (const [uid, inst] of Object.entries(entry.instances || {})) {

				safeRegistry[name].instances[uid] = {
					tag: inst.element?.tagName || null,
					id: inst.element?.id || '',
					class: inst.element?.className || '',
					listeners: Array.isArray(inst.listeners)
						? inst.listeners.length
						: 0
				};
			}
		}

		return {
			env: u.env || 'dev',
			version: u.version || 'dev',
			time: new Date().toISOString(),
			registry: safeRegistry
		};
	}

	function exportSnapshot() {
		try {
			return JSON.stringify(snapshot(), null, 2);
		} catch (e) {
			console.error('[NG DEBUG] Export failed', e);
			return '{}';
		}
	}

	const debugApi = {
		detectLeaks,
		debugComponents,
		debugListeners,
		snapshot,
		exportSnapshot
	};

	// passthrough util solo se esistono
	if (typeof u.setDebug === 'function') debugApi.setDebug = u.setDebug;
	if (typeof u.setDeepLevel === 'function') debugApi.setDeepLevel = u.setDeepLevel;
	if (typeof u.getDeepLevel === 'function') debugApi.getDeepLevel = u.getDeepLevel;
	if (typeof u.log === 'function') debugApi.log = u.log;

	if (window.ng) {
		Object.assign(window.ng, debugApi);
	}

})();