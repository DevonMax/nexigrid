import * as u from './ng_utils.js';

/*
NexiGrid — ng_range.js v1.2
Range slider component (single + dual-thumb), flat con fill colorato dinamico.
Varianti colorpicker (single only): .ng-range-hue / .ng-range-alpha.

Attributi:
  data-min        (default 0)
  data-max        (default 100)
  data-jump       (default 1)           ← step (NG-naming: "jump")
  data-value      (default min, single only)
  data-value-min  (default min, dual only)
  data-value-max  (default max, dual only)
  data-format     (default null)        ← funzione globale window[name](v)
                                          per formattare l'output ("€{v}.00", ecc.)
  data-output-sep (default " – ")       ← separatore valori dual nell'output
  data-color         (alpha only)       ← colore base di cui regolare l'alpha
                                          (qualsiasi colore CSS; setta --ng-range-alpha-color)
  data-color-format  (default "hex")    ← hex | rgb | css-rgb | css-rgba | cmyk
                                          output/copia per hue e alpha
  data-copy          (flag)             ← click sull'output → copia il colore formattato

Markup single:
  <div class="ng-range" data-ng-range data-min="0" data-max="100" data-jump="5" data-value="40">
    <label class="ng-label">Volume <output class="ng-range-output">40</output></label>
    <input type="range" class="ng-range-input">
    <div class="ng-range-marks"><span>0</span><span>100</span></div>
  </div>

Markup dual:
  <div class="ng-range ng-range-dual" data-ng-range
       data-min="0" data-max="1000" data-jump="10"
       data-value-min="200" data-value-max="800">
    <label class="ng-label">Prezzo <output class="ng-range-output">200 – 800</output></label>
    <div class="ng-range-track">
      <input type="range" class="ng-range-input ng-range-min">
      <input type="range" class="ng-range-input ng-range-max">
    </div>
    <div class="ng-range-marks"><span>0</span><span>1000</span></div>
  </div>

Eventi:
  ng:range:input       continuo durante drag (input event)
  ng:range:change      al commit (change event)
  detail: { value }                    (single)
  detail: { min, max }                 (dual)
  ng:range:copy        dopo copia ok    detail: { text }      (hue/alpha)
  ng:range:copy-error  copia fallita    detail: { error }     (hue/alpha)

API per istanza:
  root.__ngRange = { get(), set(v|{min,max}), reset() }
  hue/alpha: + getColor(format?), copy(format?)
*/

export function initRange(scope = document) {

	const roots = u.resolveElements(scope, '.ng-range:not([data-ng-uid])');
	const initialized = [];

	roots.forEach(root => {

		const isDual = root.classList.contains('ng-range-dual');

		const min  = parseFloat(root.dataset.min)  || 0;
		const max  = parseFloat(root.dataset.max)  || 100;
		const jump = parseFloat(root.dataset.jump) || 1;

		if (max <= min) {
			u.warn?.('ng-range: data-max must be > data-min', root);
			return;
		}

		const output = root.querySelector('.ng-range-output');
		const sep    = root.dataset.outputSep || ' – ';

		// Formatter opzionale: nome di una funzione globale window[name]
		const fmtName = root.dataset.format;
		const fmt     = fmtName && typeof window[fmtName] === 'function'
			? window[fmtName]
			: v => String(v);

		root.__ngListeners ||= [];

		// % di un singolo step → usata dal CSS per le tacche opt-in (.ng-range-ticks)
		root.style.setProperty('--ng-range-step-pct', ((jump / (max - min)) * 100) + '%');

		/* =========================
		   SINGLE
		   ========================= */
		if (!isDual) {

			const input = root.querySelector('.ng-range-input');
			if (!input) return;

			const initial = root.dataset.value !== undefined
				? clamp(parseFloat(root.dataset.value), min, max)
				: min;

			input.min  = min;
			input.max  = max;
			input.step = jump;
			input.value = initial;
			input.setAttribute('aria-valuemin', min);
			input.setAttribute('aria-valuemax', max);

			/* Varianti colorpicker: hue (spettro 0-360) / alpha (canale alpha) */
			const isHue    = root.classList.contains('ng-range-hue');
			const isAlpha  = root.classList.contains('ng-range-alpha');
			const isColor  = isHue || isAlpha;
			const colorFmt = root.dataset.colorFormat || 'hex';

			let baseRGB = null;
			if (isAlpha) {
				if (root.dataset.color) root.style.setProperty('--ng-range-alpha-color', root.dataset.color);
				baseRGB = cssToRGB(getComputedStyle(root).getPropertyValue('--ng-range-alpha-color').trim(), root);
			}

			function currentColor() {
				const v = parseFloat(input.value);
				return isHue
					? { rgb: hslToRgb(v), a: 1 }
					: { rgb: baseRGB, a: (v - min) / (max - min) };
			}

			function syncSingle(commit) {
				const v = parseFloat(input.value);
				const pct = ((v - min) / (max - min)) * 100;
				root.style.setProperty('--ng-range-fill', pct + '%');
				root.style.setProperty('--ng-range-val', v);
				const text = isColor ? formatColor(currentColor(), colorFmt) : fmt(v);
				input.setAttribute('aria-valuenow', v);
				input.setAttribute('aria-valuetext', text);
				if (output) output.textContent = text;
				root.dispatchEvent(new CustomEvent(
					commit ? 'ng:range:change' : 'ng:range:input',
					{ detail: { value: v } }
				));
			}

			u.listen(input, 'input',  () => syncSingle(false), false, root.__ngListeners);
			u.listen(input, 'change', () => syncSingle(true),  false, root.__ngListeners);

			syncSingle(false);

			root.__ngRange = {
				get: () => parseFloat(input.value),
				set: (v) => {
					input.value = clamp(parseFloat(v), min, max);
					syncSingle(true);
				},
				reset: () => {
					input.value = initial;
					syncSingle(true);
				}
			};

			if (isColor) {

				root.__ngRange.getColor = (f) => formatColor(currentColor(), f || colorFmt);

				root.__ngRange.copy = async (f) => {
					const text = root.__ngRange.getColor(f);
					try {
						await navigator.clipboard.writeText(text);
						root.dispatchEvent(new CustomEvent('ng:range:copy', { detail: { text } }));
						if (output) {
							output.classList.add('is-active');
							setTimeout(() => output.classList.remove('is-active'), 800);
						}
					} catch (err) {
						u.warn?.('ng-range: clipboard error', err);
						root.dispatchEvent(new CustomEvent('ng:range:copy-error', { detail: { error: err } }));
					}
					return text;
				};

				if (root.hasAttribute('data-copy') && output) {
					u.listen(output, 'click', () => root.__ngRange.copy(), false, root.__ngListeners);
				}
			}

		/* =========================
		   DUAL
		   ========================= */
		} else {

			const inputMin = root.querySelector('.ng-range-input.ng-range-min');
			const inputMax = root.querySelector('.ng-range-input.ng-range-max');
			if (!inputMin || !inputMax) return;

			const initMin = root.dataset.valueMin !== undefined
				? clamp(parseFloat(root.dataset.valueMin), min, max)
				: min;
			const initMax = root.dataset.valueMax !== undefined
				? clamp(parseFloat(root.dataset.valueMax), min, max)
				: max;

			[inputMin, inputMax].forEach(i => {
				i.min  = min;
				i.max  = max;
				i.step = jump;
				i.setAttribute('aria-valuemin', min);
				i.setAttribute('aria-valuemax', max);
			});

			inputMin.value = Math.min(initMin, initMax);
			inputMax.value = Math.max(initMin, initMax);

			function syncDual(commit) {
				let lo = parseFloat(inputMin.value);
				let hi = parseFloat(inputMax.value);

				// no thumb-cross: enforce lo <= hi (gap >= 0 con jump=0; con jump>0
				// lasciamo lo == hi accettabile per non bloccare l'utente)
				if (lo > hi) {
					// chi ha appena mosso? La fix è: la mano che "spinge" trascina l'altra
					if (this === inputMin) { inputMax.value = lo; hi = lo; }
					else                   { inputMin.value = hi; lo = hi; }
				}

				const span = max - min;
				const pctMin = ((lo - min) / span) * 100;
				const pctMax = ((hi - min) / span) * 100;

				root.style.setProperty('--ng-range-min', pctMin + '%');
				root.style.setProperty('--ng-range-max', pctMax + '%');

				inputMin.setAttribute('aria-valuenow',  lo);
				inputMax.setAttribute('aria-valuenow',  hi);
				inputMin.setAttribute('aria-valuetext', fmt(lo));
				inputMax.setAttribute('aria-valuetext', fmt(hi));

				if (output) output.textContent = fmt(lo) + sep + fmt(hi);

				root.dispatchEvent(new CustomEvent(
					commit ? 'ng:range:change' : 'ng:range:input',
					{ detail: { min: lo, max: hi } }
				));
			}

			u.listen(inputMin, 'input',  function () { syncDual.call(this, false); }, false, root.__ngListeners);
			u.listen(inputMax, 'input',  function () { syncDual.call(this, false); }, false, root.__ngListeners);
			u.listen(inputMin, 'change', function () { syncDual.call(this, true);  }, false, root.__ngListeners);
			u.listen(inputMax, 'change', function () { syncDual.call(this, true);  }, false, root.__ngListeners);

			syncDual.call(null, false);

			root.__ngRange = {
				get: () => ({
					min: parseFloat(inputMin.value),
					max: parseFloat(inputMax.value)
				}),
				set: (v) => {
					if (typeof v === 'object' && v !== null) {
						if (v.min !== undefined) inputMin.value = clamp(parseFloat(v.min), min, max);
						if (v.max !== undefined) inputMax.value = clamp(parseFloat(v.max), min, max);
						syncDual.call(null, true);
					}
				},
				reset: () => {
					inputMin.value = Math.min(initMin, initMax);
					inputMax.value = Math.max(initMin, initMax);
					syncDual.call(null, true);
				}
			};
		}

		root.setAttribute('data-ng-init', 'range');
		initialized.push(root);

	});

	return initialized;
}

function clamp(v, lo, hi) {
	return Math.min(Math.max(v, lo), hi);
}

/* hue (0-360) → rgb, con s=100% l=50% (spettro colorpicker) */
function hslToRgb(h) {
	const f = n => {
		const k = (n + h / 30) % 12;
		return Math.round(255 * (0.5 - 0.5 * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
	};
	return { r: f(0), g: f(8), b: f(4) };
}

/* qualsiasi colore CSS → {r,g,b} via computed style di un probe */
function cssToRGB(str, host) {
	const probe = document.createElement('span');
	probe.style.color = str;
	host.appendChild(probe);
	const m = getComputedStyle(probe).color.match(/[\d.]+/g) || [0, 0, 0];
	probe.remove();
	return { r: +m[0], g: +m[1], b: +m[2] };
}

/* {rgb,a} → stringa nel formato richiesto (hex|rgb|css-rgb|css-rgba|cmyk) */
function formatColor(c, format) {
	if (!c || !c.rgb) return '';
	const { r, g, b } = c.rgb;
	const a = c.a;
	switch (format) {
		case 'rgb':      return r + ', ' + g + ', ' + b;
		case 'css-rgb':  return 'rgb(' + r + ', ' + g + ', ' + b + ')';
		case 'css-rgba': return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + (Math.round(a * 100) / 100) + ')';
		case 'cmyk': {
			const rr = r / 255, gg = g / 255, bb = b / 255;
			const k = 1 - Math.max(rr, gg, bb);
			const d = (1 - k) || 1;
			const p = x => Math.round(x * 100) + '%';
			return 'cmyk(' + p((1 - rr - k) / d) + ', ' + p((1 - gg - k) / d) + ', ' + p((1 - bb - k) / d) + ', ' + p(k) + ')';
		}
		case 'hex':
		default: {
			const h = n => Math.round(n).toString(16).padStart(2, '0');
			return '#' + h(r) + h(g) + h(b) + (a < 1 ? h(a * 255) : '');
		}
	}
}

initRange.meta = {
	name: 'range',
	version: '1.2',
	description: 'Range slider flat (single + dual-thumb): fill colorato dinamico, output number, marks, ARIA, verticale (CSS), tacche opt-in (.ng-range-ticks), hue/alpha colorpicker (formati hex|rgb|css-rgb|css-rgba|cmyk + copia). data-jump=step.',
	dependencies: [],
	author: 'NexiGrid',
	experimental: false
};

u.log('[NG] ng_range.js v1.2 loaded');

if (window.ng) {
	window.ng.registerComponent('range', initRange);
}
