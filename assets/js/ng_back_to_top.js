import * as u from './ng_utils.js';

/* ==========================================================
NexiGrid — Back to top
----------------------------------------------------------
Bottone flottante "torna su". Compone .ng-btn (look) + .ng-back-to-top
(position/behavior). Mostra/nasconde su scroll, scroll smooth/instant,
scope window o container, target ancora, anello di progresso opzionale.

Markup:
  <button class="ng-back-to-top ng-btn ng-btn-primary circle"
          data-ng-back-to-top
          data-ng-threshold="300"      // px o "50%" (di viewport/container)
          data-ng-behavior="smooth"    // smooth | instant
          data-ng-target="#anchor"     // opz. ancora a cui scrollare
          data-ng-scope="#box"         // opz. container scrollabile (default window)
          data-ng-progress             // opz. abilita anello progresso
          data-ng-auto-hide="true"     // opz. nasconde vicino al fondo
          data-ng-label="Back to top"> // aria-label + title
    <span class="ng-back-to-top-ring" aria-hidden="true"></span>
    <i class="ph ph-arrow-up"></i>
  </button>

Eventi: ng:back-to-top:show | :hide | :click  (detail { backToTop })
API:    root.__ngBackToTop = { show, hide, scrollToTop, update }
========================================================== */

	export function initBackToTop(scope = document) {

		const roots = u.resolveElements(scope, '.ng-back-to-top:not([data-ng-uid])');
		const initialized = [];

		roots.forEach(root => {

			root.__ngListeners ||= [];
			const ds = root.dataset;

			/* ===== Opzioni ===== */
			const opts = {
				threshold: ds.ngThreshold ?? '300',          // string, può finire con %
				behavior:  ds.ngBehavior  ?? 'smooth',
				target:    ds.ngTarget    || null,            // selettore ancora
				scopeSel:  ds.ngScope     || null,            // container scrollabile
				progress:  ds.ngProgress  !== undefined,
				autoHide:  ds.ngAutoHide === 'true',
				label:     ds.ngLabel     || 'Back to top'
			};

			if (!root.getAttribute('aria-label')) root.setAttribute('aria-label', opts.label);
			if (!root.title) root.title = opts.label;

			const scroller = opts.scopeSel ? document.querySelector(opts.scopeSel) : window;
			if (opts.scopeSel && !scroller) {
				// scope dichiarato ma non trovato: salta (markup incompleto)
				return;
			}

			const ring = opts.progress ? root.querySelector('.ng-back-to-top-ring') : null;

			const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
			const behavior = (prefersReduced || opts.behavior === 'instant') ? 'auto' : 'smooth';

			/* ===== Metriche scroll (window vs container) ===== */
			const getY = () => (scroller === window ? window.scrollY : scroller.scrollTop);
			const getMax = () => (scroller === window
				? document.documentElement.scrollHeight - window.innerHeight
				: scroller.scrollHeight - scroller.clientHeight);
			const resolveThreshold = () => {
				const t = opts.threshold;
				if (typeof t === 'string' && t.trim().endsWith('%')) {
					const vp = scroller === window ? window.innerHeight : scroller.clientHeight;
					return (parseFloat(t) / 100) * vp;
				}
				return parseFloat(t) || 0;
			};

			/* ===== Stato / toggle (idempotente) ===== */
			let visible = null;
			const toggle = (show) => {
				if (show === visible) return;
				visible = show;
				root.classList.toggle('is-visible', show);
				root.dispatchEvent(new CustomEvent(`ng:back-to-top:${show ? 'show' : 'hide'}`, {
					detail: { backToTop: root }
				}));
			};

			/* ===== Update (chiamato rAF-gated) ===== */
			const update = () => {
				const y = getY();
				const max = getMax();
				const thr = resolveThreshold();
				const nearBottom = opts.autoHide && (max - y) < thr;
				toggle(y >= thr && !nearBottom);
				if (ring && max > 0) {
					root.style.setProperty('--ng-btt-progress', `${Math.min(100, (y / max) * 100)}%`);
				}
			};

			/* ===== Scroll handler rAF-gated ===== */
			let ticking = false;
			const onScroll = () => {
				if (ticking) return;
				ticking = true;
				requestAnimationFrame(() => { ticking = false; update(); });
			};

			/* ===== Scroll to top / target ===== */
			const scrollToTop = () => {
				let top = 0;
				if (opts.target) {
					const el = document.querySelector(opts.target);
					if (el) {
						// posizione dell'ancora relativa allo scroller (window o container)
						const scrollerTop = scroller === window ? 0 : scroller.getBoundingClientRect().top;
						top = getY() + (el.getBoundingClientRect().top - scrollerTop);
					}
				}
				if (scroller === window) window.scrollTo({ top, behavior });
				else scroller.scrollTo({ top, behavior });
				root.dispatchEvent(new CustomEvent('ng:back-to-top:click', { detail: { backToTop: root } }));
			};

			/* ===== Listener (tracciati) ===== */
			u.listen(root, 'click', scrollToTop, false, root.__ngListeners);
			u.listen(scroller, 'scroll', onScroll, true, root.__ngListeners);

			/* ===== API per-istanza ===== */
			root.__ngBackToTop = {
				show: () => toggle(true),
				hide: () => toggle(false),
				scrollToTop,
				update
			};

			/* ===== Teardown (i listener si puliscono via __ngListeners) ===== */
			root.__ngProbe = { teardown() { ticking = false; visible = null; } };

			root.setAttribute('data-ng-init', 'back-to-top');
			update();                                       // stato iniziale (pagina già scrollata)
			initialized.push(root);
		});

		return initialized;
	}

	// Metadata component (Component Contract)
	initBackToTop.meta = {
		name: "back-to-top",
		version: "1.0",
		description: "Bottone flottante scroll-to-top che compone .ng-btn. Opzioni: threshold (px/%), behavior smooth/instant, target ancora, scope container, anello di progresso (conic), auto-hide, angoli, animazioni, hide-on-mobile. Eventi ng:back-to-top:show|hide|click.",
		dependencies: [],
		author: "NexiGrid",
		experimental: false
	};

	u.log('[NG] ng_back_to_top.js v1.0 loaded');

	if (window.ng) {
		window.ng.registerComponent('back-to-top', initBackToTop);
	}
