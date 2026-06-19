import * as u from './ng_utils.js';

/* ==========================================================
NexiGrid — Chart (Tier 2)
----------------------------------------------------------
Renderizza line/area/bar in SVG dai dati (zero dipendenze) CON interattività:
hover → tooltip + punto/barra attiva. Render in coordinate PIXEL reali
(viewBox = dimensioni px) → cerchi tondi, niente distorsione; re-render al resize.

Markup:
  <div class="ng-chart-js ng-chart-success"
       data-chart="line"               // line | area | bar
       data-values="3,7,4,8,6,9,5"     // numeri csv
       data-labels="Mon,Tue,..."       // opz. etichette per il tooltip
       data-min="0" data-max="10"      // opz. (default: min/max dei dati; bar → 0)
       data-dots="true"></div>         // opz. line/area: punti sempre visibili
========================================================== */

	const NS = 'http://www.w3.org/2000/svg';
	const PADX = 6;
	const PADY = 10;

	function el(tag, attrs) {
		const e = document.createElementNS(NS, tag);
		for (const k in attrs) e.setAttribute(k, attrs[k]);
		return e;
	}

	function parseValues(str) {
		return (str || '').split(',').map(s => parseFloat(s.trim())).filter(n => !Number.isNaN(n));
	}

	/* Ricostruisce l'SVG in px reali; salva i punti su c.points per l'hover. */
	function render(root) {
		const c = root.__chart;
		if (!c) return;

		const W = root.clientWidth;
		const H = root.clientHeight;
		if (!W || !H) return;

		const v = c.values;
		const n = v.length;
		const dataMin = Math.min(...v);
		const dataMax = Math.max(...v);
		const min = c.opts.min != null ? c.opts.min : (c.type === 'bar' ? Math.min(0, dataMin) : dataMin);
		const max = c.opts.max != null ? c.opts.max : dataMax;
		const range = (max - min) || 1;

		const x = i => (n > 1 ? PADX + (i / (n - 1)) * (W - 2 * PADX) : W / 2);
		const y = val => H - PADY - ((val - min) / range) * (H - 2 * PADY);

		const svg = el('svg', { viewBox: `0 0 ${W} ${H}` });
		c.points = v.map((val, i) => ({ x: x(i), y: y(val), value: val, i }));
		c.bars = [];

		if (c.type === 'bar') {
			const slot = W / n;
			const bw = Math.min(slot * 0.62, 48);
			const base = y(Math.max(min, 0));
			v.forEach((val, i) => {
				const top = y(val);
				const rect = el('rect', {
					class: 'bar',
					x: (i * slot + (slot - bw) / 2).toFixed(2),
					y: Math.min(top, base).toFixed(2),
					width: bw.toFixed(2),
					height: Math.abs(base - top).toFixed(2),
					rx: 3
				});
				c.bars.push(rect);
				svg.appendChild(rect);
				c.points[i].x = i * slot + slot / 2;
				c.points[i].y = top;
			});
		} else {
			const pts = c.points.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
			if (c.type === 'area') {
				svg.appendChild(el('polygon', {
					class: 'area',
					points: `${x(0).toFixed(2)},${H} ${pts} ${x(n - 1).toFixed(2)},${H}`
				}));
			}
			svg.appendChild(el('polyline', { class: 'line', points: pts }));
			if (c.opts.dots) {
				c.points.forEach(p => svg.appendChild(el('circle', { class: 'dot', cx: p.x.toFixed(2), cy: p.y.toFixed(2), r: 3 })));
			}
		}

		/* Punto attivo (hover) — sempre presente, nascosto via CSS */
		c.active = el('circle', { class: 'dot-active', cx: 0, cy: 0, r: 4.5 });
		svg.appendChild(c.active);

		const old = root.querySelector('svg');
		if (old) old.remove();
		root.insertBefore(svg, c.tip);
	}

	function nearestIndex(c, mx) {
		let best = 0, bd = Infinity;
		for (let i = 0; i < c.points.length; i++) {
			const d = Math.abs(c.points[i].x - mx);
			if (d < bd) { bd = d; best = i; }
		}
		return best;
	}

	function onMove(root, e) {
		const c = root.__chart;
		if (!c || !c.points.length) return;
		const r = root.getBoundingClientRect();
		const mx = e.clientX - r.left;
		const i = nearestIndex(c, mx);
		const p = c.points[i];

		root.classList.add('is-hover');
		c.active.setAttribute('cx', p.x.toFixed(2));
		c.active.setAttribute('cy', p.y.toFixed(2));

		if (c.bars.length) {
			c.bars.forEach((b, bi) => { b.style.opacity = bi === i ? '1' : '.45'; });
		}

		const lab = c.labels[i];
		const prefix = (lab != null && lab !== '') ? `${lab}: ` : '';
		c.tip.textContent = `${prefix}${p.value}`;
		c.tip.style.left = `${p.x}px`;
		c.tip.style.top = `${p.y}px`;
	}

	function onLeave(root) {
		const c = root.__chart;
		if (!c) return;
		root.classList.remove('is-hover');
		if (c.bars.length) c.bars.forEach(b => { b.style.opacity = ''; });
	}

	export function initChart(scope = document) {

		const roots = u.resolveElements(scope, '.ng-chart-js:not([data-ng-uid])');
		const initialized = [];

		roots.forEach(root => {

			const values = parseValues(root.dataset.values);
			if (!values.length) return;

			root.__ngListeners ||= [];

			const tip = document.createElement('div');
			tip.className = 'ng-chart-tip';
			root.appendChild(tip);

			root.__chart = {
				values,
				type: (root.dataset.chart || 'line').toLowerCase(),
				labels: (root.dataset.labels || '').split(',').map(s => s.trim()),
				opts: {
					min: root.dataset.min != null ? parseFloat(root.dataset.min) : null,
					max: root.dataset.max != null ? parseFloat(root.dataset.max) : null,
					dots: root.dataset.dots === 'true' || root.dataset.dots === ''
				},
				tip, points: [], bars: []
			};

			render(root);

			u.listen(root, 'mousemove', e => onMove(root, e), false, root.__ngListeners);
			u.listen(root, 'mouseleave', () => onLeave(root), false, root.__ngListeners);
			u.listen(window, 'resize', () => render(root), false, root.__ngListeners);

			root.setAttribute('data-ng-init', 'chart');
			initialized.push(root);
		});

		return initialized;
	}

	// Metadata component (Component Contract)
	initChart.meta = {
		name: "chart",
		version: "1.4",
		description: "Chart NG. Tier 1 (SCSS): donut/gauge/bars/sparkline. Tier 2 (questo JS): line/area/bar da dati (data-values) con auto-scale, render px (cerchi tondi), hover tooltip + punto/barra attiva, re-render al resize. Zero dipendenze.",
		dependencies: [],
		author: "NexiGrid",
		experimental: false
	};

	u.log('[NG] ng_chart.js v1.4 loaded');

	if (window.ng) {
		window.ng.registerComponent('chart', initChart);
	}
