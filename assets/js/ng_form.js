import * as u from './ng_utils.js';

/**
 * NexiGrid – Form Component
 * ------------------------------------------------------------
 * Minimal HTML5 validation wrapper for `.ng-form`
 * - Uses native checkValidity()
 * - Applies UI states (.ng-field-error / success)
 * - Generates dynamic .ng-help messages
 * - Live validation (blur / change)
 * - Public API: form.ngValidate(), form.ngReset()
 *
 * Password toggle (occhio mostra/nascondi) — delegated, v1.2:
 * markup = .ng-input-group con <input type="password" class="ng-input"> +
 * <button class="ng-input-addon ng-input-addon-ghost ng-password-toggle">
 * con <i class="ph ph-eye">. Funziona anche fuori da .ng-form e su markup
 * runtime (listener delegato su document, registrato una sola volta).
 * - swap input.type password|text · is-active sul button · ph-eye|ph-eye-slash
 * - aria-pressed + aria-label (default it, override data-label-show/-hide)
 * - evento ng:form:password-toggle sul .ng-input-group, detail {input, visible}
 */

// Idempotenza binding delegato (stesso pattern di ng_aux)
let _pwToggleDelegated = false;

function bindPasswordToggle() {

	if (_pwToggleDelegated) return;
	_pwToggleDelegated = true;

	const listeners = [];

	function onClick(e) {

		const btn = e.target instanceof Element && e.target.closest('.ng-password-toggle');
		if (!btn) return;

		const group = btn.closest('.ng-input-group');
		const input = group?.querySelector('input.ng-input');
		if (!input) return;

		const visible = input.type === 'password';
		input.type = visible ? 'text' : 'password';

		btn.classList.toggle('is-active', visible);
		btn.setAttribute('aria-pressed', String(visible));
		btn.setAttribute('aria-label', visible
			? (btn.dataset.labelHide || 'Nascondi password')
			: (btn.dataset.labelShow || 'Mostra password'));

		const icon = btn.querySelector('.ph');
		if (icon) {
			icon.classList.toggle('ph-eye', !visible);
			icon.classList.toggle('ph-eye-slash', visible);
		}

		group.dispatchEvent(new CustomEvent('ng:form:password-toggle', {
			detail: { input, visible }
		}));
	}

	u.listen(document, 'click', onClick, false, listeners);
	document.__ngListeners = (document.__ngListeners || []).concat(listeners);
}

export function initForm(scope = document) {

	bindPasswordToggle();

	const forms = u.resolveElements(scope, '.ng-form:not([data-ng-uid])');
	const initialized = [];

	forms.forEach(form => {

		form.setAttribute('novalidate', 'true');
		form.__ngListeners ||= [];

		function setFieldState(field, state, message = '') {

			field.classList.remove('ng-field-error', 'ng-field-success');

			const existingHelp = field.querySelector('.ng-help[data-ng-generated="true"]');
			if (existingHelp) existingHelp.remove();

			if (!state) return;

			field.classList.add(`ng-field-${state}`);

			if (message) {
				const help = document.createElement('div');
				help.className = 'ng-help';
				help.dataset.ngGenerated = 'true';
				help.textContent = message;
				field.appendChild(help);
			}
		}

		function validateField(input) {

			const field = input.closest('.ng-field');
			if (!field) return true;

			if (!input.checkValidity()) {
				setFieldState(field, 'error', input.validationMessage);
				return false;
			}

			if (input.value && input.value.trim() !== '') {
				setFieldState(field, 'success');
			} else {
				setFieldState(field, null);
			}

			return true;
		}

		function validateForm() {

			let valid = true;

			// Ricalcolo dinamico input (supporto DOM dinamico)
			Array.from(form.querySelectorAll('input, select, textarea'))
				.forEach(input => {
					if (!validateField(input)) valid = false;
				});

			return valid;
		}

		function resetFormState() {

			form.querySelectorAll('.ng-field').forEach(field => {
				field.classList.remove('ng-field-error', 'ng-field-success');

				const help = field.querySelector('.ng-help[data-ng-generated="true"]');
				if (help) help.remove();
			});

			form.reset();
		}

		function serializeForm() {

			const data = {};
			const elements = form.querySelectorAll('input[name], select[name], textarea[name]');

			elements.forEach(el => {

				// ESCLUSIONE AUTOMATICA
				if (
					el.tagName === 'BUTTON' ||
					['submit','button','reset'].includes(el.type)
				) return;

				const name = el.name;
				if (!name) return;

				const type = el.type;

				switch (type) {

					// BOOLEAN
					case 'checkbox':
						data[name] = el.checked;
						break;

					// RADIO GROUP
					case 'radio':
						if (el.checked) {
							data[name] = el.value;
						} else if (!(name in data)) {
							data[name] = null;
						}
						break;

					// NUMBER
					case 'number':
					case 'range':
						data[name] = el.value !== '' ? Number(el.value) : null;
						break;

					// SELECT
					case 'select-one': {
						const opt = el.selectedOptions[0];
						data[name] = opt ? opt.value : null;
						break;
					}

					case 'select-multiple':
						data[name] = Array.from(el.selectedOptions).map(o => o.value);
						break;

					// FILE
					case 'file':
						data[name] = el.files
							? Array.from(el.files).map(f => f.name)
							: [];
						break;

					// DATE / TIME (string ISO)
					case 'date':
					case 'time':
					case 'datetime-local':
					case 'month':
					case 'week':
						data[name] = el.value || null;
						break;

					// COLOR
					case 'color':
						data[name] = el.value || null;
						break;

					// DEFAULT STRING
					default:
						data[name] = el.value;
				}

			});

			return data;
		}

		// Submit handler
		const submitHandler = e => {
			if (!validateForm()) {
				e.preventDefault();
			}
		};

		u.listen(form, 'submit', submitHandler, false, form.__ngListeners);

		// Live validation (delegated per input)
		Array.from(form.querySelectorAll('input, select, textarea'))
			.forEach(input => {

				const handler = () => validateField(input);

				const eventType =
					(input.type === 'checkbox' || input.type === 'radio')
						? 'change'
						: 'blur';

				u.listen(input, eventType, handler, false, form.__ngListeners);
			});

		// Public API
		form.ngValidate = validateForm;
		form.ngReset = resetFormState;
		form.ngSerialize = serializeForm;

		form.setAttribute('data-ng-init', 'form');

		initialized.push(form);

	});

	return initialized;
}

// Metadata component (Component Contract)
initForm.meta = {
	name: "form",
	version: "1.2",
	description: "Form enhancer: validation helpers, input state, API ngValidate/ngReset/ngSerialize, password toggle delegato (.ng-password-toggle in .ng-input-group, evento ng:form:password-toggle).",
	dependencies: [],
	author: "NexiGrid",
	experimental: false
};

u.log('[NG] ng_form.js v1.2 loaded');

if (window.ng) {
	window.ng.registerComponent('form', initForm);
}