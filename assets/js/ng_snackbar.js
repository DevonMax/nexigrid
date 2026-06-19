import * as u from './ng_utils.js';

/* ============================================================
API GLOBALE (SEMPRE DISPONIBILE)
============================================================ */

function ensureStack(position = 'bottom right') {

	let stack = document.querySelector(`.ng-snackbar-stack[data-position="${position}"]`);

	if (!stack) {
		stack = document.createElement('div');
		stack.className = `ng-snackbar-stack ${position}`;
		stack.dataset.position = position;
		document.body.appendChild(stack);
	}

	return stack;
}

function dismiss(el) {

	if (!el || el.classList.contains('is-closing')) return;

	el.classList.remove('is-active');
	el.classList.add('is-closing');

	clearTimeout(el.__timeout);

	const remove = () => {

		if (el.__ngListeners) {
			el.__ngListeners.forEach(l => {
				l.el.removeEventListener(l.type, l.handler, l.options);
			});
			el.__ngListeners = [];
		}

		el.remove();
	};

	// One-shot tracciato: { once: true } auto-rimuove dal DOM, il record
	// in __ngListeners diventa stale ma è no-op a teardown.
	u.listen(el, 'transitionend', remove, { once: true }, (el.__ngListeners ||= []));
}

function createSnackbar(message, options = {}) {

	const {
		type = 'info',
		variant = 'fill',
		duration = 4000,
		closable = true,
		icon = null
	} = options;

	const el = document.createElement('div');
	el.className = `ng-snackbar ng-snackbar--${variant} ${type}`;
	el.setAttribute('role', 'status');
	el.setAttribute('aria-live', 'polite');

	el.__ngListeners = [];

	const msg = document.createElement('div');
	msg.className = 'ng-snackbar-message';

	// ICON
	if (icon && icon.name) {

		const iconEl = document.createElement('i');

		if (icon.type && icon.type.startsWith('ph')) {
			iconEl.className = `${icon.type} ph-${icon.name}`;
		} else if (icon.type === 'class') {
			iconEl.className = icon.name;
		}

		// classi extra
		if (icon.class) {
			iconEl.className += ' ' + icon.class;
		}

		msg.appendChild(iconEl);
	}

	// TEXT
	const text = document.createElement('span');

	if (typeof message === 'string' && /<[^>]+>/.test(message)) {
		text.innerHTML = message;
	} else {
		text.textContent = String(message);
	}

	msg.appendChild(text);

	el.appendChild(msg);

	// CLOSE
	if (closable) {
		const close = document.createElement('div');
		close.className = 'ng-snackbar-close';
		close.innerHTML = '×';

		u.listen(close, 'click', () => dismiss(el), { passive: true }, el.__ngListeners);

		el.appendChild(close);
	}

	// MOUNT
	const position = options.position || 'bottom right';
	const stack = ensureStack(position);
	stack.appendChild(el);

	// SHOW
	requestAnimationFrame(() => {
		el.classList.add('is-active');
	});

	// AUTO CLOSE
	if (duration > 0) {
		el.__timeout = setTimeout(() => dismiss(el), duration);
	}

	return el;
}

/* ============================================================
INIT (SOLO REGISTRY NG)
============================================================ */

export function initSnackbar(scope = document) {

	const roots = u.resolveElements(document, '.ng-snackbar-stack:not([data-ng-uid])');
	const initialized = [];

	roots.forEach(root => {

		root.__ngListeners ||= [];
		root.setAttribute('data-ng-init', 'snackbar');

		// Teardown: azzera i timer di auto-dismiss degli snackbar ancora in volo
		root.__ngProbe = {
			teardown() {
				root.querySelectorAll('.ng-snackbar').forEach(s => clearTimeout(s.__timeout));
			}
		};

		initialized.push(root);
	});

	return initialized;
}

initSnackbar.meta = {
	name: 'snackbar',
	version: '1.0',
	description: "Snackbar notifier with auto-dismiss timer, role=status + aria-live=polite for assistive tech.",
	dependencies: [],
	author: 'NexiGrid',
	experimental: false
};

u.log('[NG] ng_snackbar.js v1.0 loaded');

/* ============================================================
REGISTER + API
============================================================ */

if (window.ng) {

	window.ng.registerComponent('snackbar', initSnackbar);

	// API SEMPRE DISPONIBILE
	window.ng.snackbar = {
		show: createSnackbar,
		dismiss
	};
}