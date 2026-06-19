import * as u from './ng_utils.js';

export function initTableV2(scope = document) {

	const roots = u.resolveElements(scope, '.ng-table:not([data-ng-uid])');
	const initialized = [];

	roots.forEach(root => {

		const table = root.querySelector('.ng-table-table');
		if (!table) return;

		const thead = table.querySelector('thead');
		const tbody = table.querySelector('tbody');
		if (!thead || !tbody) return;

		root.__ngListeners ||= [];

		const columns = readColumns(thead);
		if (!columns.length) return;

		const dataset = readDatasetFromDOM(tbody, columns);
		const initialLimit = root.dataset.tableLimit
			? parseInt(root.dataset.tableLimit, 10)
			: null;

		const viewState = {
			mode: root.dataset.tableSource ? 'remote' : 'local',
			page: 1,
			limit: initialLimit,
			initialLimit,
			sort: null,
			order: 'asc',
			search: '',
			filters: {},
			hiddenColumns: [],
			selectedRows: [],
			meta: (() => {
				// #8: con initialLimit null tutte le righe sono visibili (niente
				// paginazione) → evita visible:0 / last_page:Infinity.
				const visible = initialLimit ? Math.min(initialLimit, dataset.length) : dataset.length;
				return {
					total: dataset.length,
					filtered: dataset.length,
					visible,
					from: dataset.length ? 1 : 0,
					to: visible,
					per_page: initialLimit || dataset.length,
					current_page: 1,
					last_page: initialLimit ? Math.max(1, Math.ceil(dataset.length / initialLimit)) : 1
				};
			})()
		};

		const state = {
			root,
			table,
			thead,
			tbody,
			columns,
			columnsMap: Object.fromEntries(columns.map(c => [c.key, c])),
			dataset,
			originalDataset: cloneRows(dataset),
			workingDataset: dataset.slice(),
			viewState,
			pageSizeSelectNodes: [],
			remote: {
				url: root.dataset.tableSource || '',
				loading: false,
				error: null,
				requestId: 0
			}
		};

		// SUB-TABLE (detail-row gemella, opt-in via data-table-expandable)
		state.expandable  = root.hasAttribute('data-table-expandable');
		state.expandSingle = root.hasAttribute('data-expand-single');
		// icone expander personalizzabili (qualsiasi Phosphor ph-*).
		// default: caret-right per entrambi → ruota di 90° via CSS.
		// se collapse-icon è diversa (es. plus/minus) lo swap del glifo
		// sostituisce la rotazione (disattivata in CSS via [data-collapse-icon]).
		state.expandIcon   = sanitizePhIcon(root.dataset.expandIcon, 'ph-caret-right');
		state.collapseIcon = sanitizePhIcon(root.dataset.collapseIcon, state.expandIcon);
		// trigger testuale (es. Open/Close): se presente, il testo sostituisce
		// l'icona (a meno che non sia impostata esplicitamente anche un'icona).
		state.expandText   = root.dataset.expandText || null;
		state.collapseText = root.dataset.collapseText || state.expandText;
		state.hasIconAttr  = !!(root.dataset.expandIcon || root.dataset.collapseIcon);
		// dimensione trigger: sm | md | lg | xl (default md)
		state.expandSize   = ['sm','md','lg','xl'].includes(root.dataset.expandSize)
			? root.dataset.expandSize : null;
		state.expanded    = new Set();   // id riga attualmente aperti
		state.detailCache = new Map();   // id → elemento .ng-table-detail-content (lazy, no re-fetch)

		// INIT SORT DA DATASET
		const initialSort = root.dataset.tableSort;

		if (initialSort) {

			const [key, dir] = initialSort.split(':');

			if (key && columns.some(c => c.key === key)) {
				viewState.sort = key;
				viewState.order = (dir === 'desc') ? 'desc' : 'asc';
			}
		}

		if (root.hasAttribute('data-table-persist')) {
			const raw = localStorage.getItem(`ng-table:${root.id || 'default'}`);
			if (raw) {
				try {
					Object.assign(state.viewState, JSON.parse(raw));
				} catch {}
			}
		}

		exposeAPI(state);
		bindFilters(state);
		bindSort(state);
		bindSearch(state);
		bindPageSizeSelect(state);
		bindColumnToggle(state);
		bindRowSelection(state);

		if (state.expandable) {
			const headRow = thead.querySelector('tr');
			if (headRow && !headRow.querySelector('.ng-table-expander-col')) {
				const th = document.createElement('th');
				th.className = 'ng-table-expander-col';
				th.setAttribute('aria-hidden', 'true');
				headRow.insertBefore(th, headRow.firstChild);
			}
			bindRowExpand(state);
		}

		renderTable(state);

		root.setAttribute('data-ng-init', 'table-v2');
		initialized.push(root);
	});

	return initialized;
}

/* =========================================================
READ LAYER
   ---------------------------------------------------------
   Responsabile della lettura e normalizzazione dei dati
   in ingresso (DOM o sorgente esterna) in una struttura
   interna coerente (dataset).

   NON contiene logica applicativa (no search/filter/sort).

   Output:
   - columns → definizione colonne
   - dataset → struttura dati uniforme (righe + celle)

   È il punto di ingresso dei dati nella pipeline:
   sorgente → dataset → pipeline → render

   In modalità local:
   - legge direttamente dal DOM

   In modalità remote:
   - viene sostituito da un mapper API → dataset

   Obiettivo:
   - garantire formato dati stabile e prevedibile
========================================================= */

	// thead: elemento <thead> della tabella
	// Legge e normalizza le colonne della tabella (key, tipo sort, locale, label)
	// Usata in fase di init per costruire la mappa colonne (base per sort e parsing dati)
	function readColumns(thead) {
		return Array.from(thead.querySelectorAll('th')).map((th, index) => ({
			index,
			key: th.dataset.colKey || `col_${index}`,
			type: th.dataset.sortType || 'string',
			locale: th.dataset.sortLocale || 'eu',   // ← QUI
			label: th.textContent.trim()
		}));
	}

	// tbody: elemento <tbody>, columns: array colonne da readColumns()
	// Converte il DOM in dataset strutturato (righe + celle text/html + __index fallback sort)
	// Usata in init per creare dataset iniziale su cui lavorano search/filter/sort
	function readDatasetFromDOM(tbody, columns) {
		return Array.from(tbody.querySelectorAll('tr')).map((tr, rowIndex) => {

			const cells = Array.from(tr.children);

			const row = {
				__id: tr.dataset.rowId || `row_${rowIndex}`,
				__index: rowIndex,
				__cells: {}
			};

			columns.forEach((col, colIndex) => {
				const cell = cells[colIndex] || null;

				row.__cells[col.key] = {
					text: cell ? cell.textContent.replace(/\s+/g, ' ').trim() : '',
					html: cell ? cell.innerHTML : ''
				};
			});

			return row;
		});
	}

	// rows: array dataset
	// Clona le righe evitando mutazioni sul dataset originale (immutabilità pipeline)
	// Usata nei passaggi pipeline e reset per mantenere coerenza dati
	function cloneRows(rows) {
		return rows.map(row => ({
			...row,
			__cells: Object.fromEntries(
				Object.entries(row.__cells).map(([key, cell]) => [key, { ...cell }])
			)
		}));
	}

	// value: input da parsare, fallback: default se non valido
	// Converte un valore in intero positivo sicuro
	// Usata per limit/pagination e parametri numerici configurabili via dataset
	function readPositiveInt(value, fallback = 10) {
		const n = parseInt(value, 10);
		return Number.isFinite(n) && n > 0 ? n : fallback;
	}

	// state: oggetto stato componente (root + viewState)
	// Binda/Aggancia i filtri DOM → aggiorna viewState.filters e triggera render
	// Usata in init per attivare sistema filtri (radio/select/input)
	function bindFilters(state) {

		const { root, viewState } = state;

		const inputs = root.querySelectorAll('[data-table-filter]');
		if (!inputs.length) return;

		inputs.forEach(input => {

			const key = input.dataset.tableFilter;

			const handler = () => {

				if (input.type === 'radio') {
					if (!input.checked) return;
					viewState.filters[key] = input.value;
				}
				else {
					viewState.filters[key] = input.value;
				}

				viewState.page = 1;
				renderTable(state);
			};

			u.listen(input, 'change', handler, false, root.__ngListeners);

			// init stato iniziale
			if (input.type === 'radio') {
				if (input.checked) viewState.filters[key] = input.value;
			} else {
				viewState.filters[key] = input.value;
			}
		});
	}

	// state: oggetto stato componente
	// Binda/Aggancia click header → gestisce sort tri-state (asc/desc/null)
	// Usata in init per abilitare sorting colonne
	function bindSort(state) {

		const { root, viewState } = state;

		const headers = root.querySelectorAll('.ng-sortable');

		headers.forEach(th => {

			const key = th.dataset.colKey;
			if (!key) return;

			// A11y: header focusabile + attivabile da tastiera (#3)
			th.setAttribute('tabindex', '0');

			const doSort = () => {

				if (viewState.sort === key) {

					if (viewState.order === 'asc') {
						viewState.order = 'desc';
					}
					else if (viewState.order === 'desc') {
						viewState.sort = null;
						viewState.order = null;
					}
					else {
						viewState.order = 'asc';
					}

				} else {
					viewState.sort = key;
					viewState.order = 'asc';
				}

				viewState.page = 1;
				renderTable(state);
			};

			u.listen(th, 'click', doSort, false, root.__ngListeners);

			u.listen(th, 'keydown', (e) => {
				if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
					e.preventDefault();
					doSort();
				}
			}, false, root.__ngListeners);
		});
	}

	// state: oggetto stato componente
	// Sincronizza stato sort (viewState) con UI (data-sort sugli header)
	// Usata dopo ogni render per aggiornare indicatori visivi
	function updateSortUI(state) {

		const { root, viewState } = state;

		const headers = root.querySelectorAll('.ng-sortable');

		headers.forEach(th => {

			const key = th.dataset.colKey;

			// reset sempre
			th.removeAttribute('data-sort');

			// stato neutro
			if (viewState.sort !== key || !viewState.order) {
				th.setAttribute('aria-sort', 'none');
				return;
			}

			// stato attivo
			th.setAttribute('data-sort', viewState.order);
			th.setAttribute('aria-sort', viewState.order === 'asc' ? 'ascending' : 'descending');
		});
	}

	// state: oggetto stato componente
	// Binda/Aggancia input search → aggiorna viewState.search live e triggera render
	// Usata in init per attivare ricerca full-text
	function bindSearch(state) {

		const { root, viewState } = state;

		const input = root.querySelector('[data-table-search]');
		if (!input) return;

		const delay = parseInt(root.dataset.tableSearchDebounce, 10) || 0;

		let timer = null;

		u.listen(input, 'input', (e) => {

			const value = e.target.value;

			// no debounce → comportamento attuale
			if (!delay) {
				viewState.search = value;
				viewState.page = 1;
				renderTable(state);
				return;
			}

			// debounce
			clearTimeout(timer);

			timer = setTimeout(() => {
				viewState.search = value;
				viewState.page = 1;
				renderTable(state);
			}, delay);
		}, false, root.__ngListeners);
	}

	// state: oggetto stato componente
	// Legge data-table-page-size, crea i select e li posiziona (top/bottom/both)
	// Usata in init per abilitare il controllo dinamico del page limit
	function bindPageSizeSelect(state) {

		const { root, viewState } = state;

		const raw = root.dataset.tablePageSize;
		if (!raw) return;

		const sizes = raw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n) && n > 0);
		if (!sizes.length) return;

		const position = root.dataset.tablePageSizePosition || 'both'; // top | bottom | both

		function createSelect() {
			const select = document.createElement('select');
			select.className = 'ng-select ng-filter-select ng-page-size';

			sizes.forEach(size => {
				const option = document.createElement('option');
				option.value = size;
				option.textContent = size;
				if (size === viewState.initialLimit) option.selected = true;
				select.appendChild(option);
			});

			u.listen(select, 'change', () => {
				root.setLimit(parseInt(select.value, 10));
			}, false, root.__ngListeners);

			return select;
		}


		if (position === 'top' || position === 'both') {

			// ── ANCHOR STABILE TOP ───────────────────────────────
			let toolbar = root.querySelector('.ng-table-toolbar');

			if (!toolbar) {
				const filtersContainer = root.querySelector('.ng-table-filters') || root;

				toolbar = document.createElement('div');
				toolbar.className = 'ng-table-toolbar';

				filtersContainer.appendChild(toolbar);
			}

			// ── CREA SELECT UNA SOLA VOLTA ───────────────────────
			if (!state._pageSizeSelectTop) {
				state._pageSizeSelectTop = createSelect();
				state.pageSizeSelectNodes.push(state._pageSizeSelectTop);
			}

			// ── INSERISCI SEMPRE NEL TOOLBAR ─────────────────────
			if (!toolbar.contains(state._pageSizeSelectTop)) {
				toolbar.appendChild(state._pageSizeSelectTop);
			}

		}

		if (position === 'bottom' || position === 'both') {
			// salvato sullo state: verrà iniettato in renderPagination al primo render
			state._pageSizeSelectBottom = createSelect();
			state.pageSizeSelectNodes.push(state._pageSizeSelectBottom);
		}
	}

	// state: oggetto stato componente
	// Click sulla riga → toggle selezione (modalità single).
	// Listener UNICO delegato sul tbody: niente listener per-riga, niente leak
	// su render ripetuti, gestisce anche righe aggiunte da render successivi.
	function bindRowSelection(state) {

		const { root, tbody, viewState } = state;

		u.listen(tbody, 'click', (e) => {

			// l'expander della sub-table non seleziona la riga
			if (e.target?.closest?.('.ng-table-expander')) return;

			const tr = e.target?.closest?.('tr[data-row-id]');
			if (!tr || !tbody.contains(tr)) return;

			const id = tr.dataset.rowId;
			if (id == null) return;

			const isSelected = viewState.selectedRows[0] === id;

			viewState.selectedRows = isSelected ? [] : [id];

			tbody.querySelectorAll('tr.is-selected').forEach(node => {
				node.classList.remove('is-selected');
				node.removeAttribute('aria-selected');
			});

			if (!isSelected) {
				tr.classList.add('is-selected');
				tr.setAttribute('aria-selected', 'true');
			}

		}, false, root.__ngListeners);
	}

	function bindColumnToggle(state) {

		const { root, viewState } = state;

		const inputs = root.querySelectorAll('.ng-dropdown input[type="checkbox"][value]');
		if (!inputs.length) return;

		inputs.forEach(input => {

			const key = input.value;

			u.listen(input, 'change', () => {

				if (input.checked) {
					viewState.hiddenColumns = viewState.hiddenColumns.filter(k => k !== key);
				} else {
					if (!viewState.hiddenColumns.includes(key)) {
						viewState.hiddenColumns.push(key);
					}
				}

				renderTable(state);
			}, false, root.__ngListeners);
		});
	}

/* =========================================================
DATA PIPELINE
   ---------------------------------------------------------
   Trasforma dataset → workingDataset tramite step puri.

   Ordine:
   search → filters → sort

   Responsabilità:
   - applicare logica dati senza side-effect
   - garantire output deterministico

   Input:
   - dataset originale
   - viewState (search, filters, sort)

   Output:
   - workingDataset pronto per render

   Non modifica mai il dataset originale
========================================================= */

	// state: oggetto stato componente (dataset + viewState + columnsMap)
	// Esegue la pipeline dati completa (search → filters → sort) e aggiorna workingDataset
	// Usata in render per ottenere sempre il dataset finale coerente con lo stato corrente
	function computeWorkingDataset(state) {

		let rows = state.dataset.slice();

		rows = applySearch(rows, state);
		rows = applyFilters(rows, state);
		rows = applySort(rows, state);

		state.workingDataset = rows;
	}

	// rows: dataset corrente, state: stato componente
	// Applica ricerca full-text su tutte le celle (case-insensitive)
	// Usata nella pipeline dati come primo step (riduce dataset prima dei filtri)
	function applySearch(rows, state) {

		const q = normalizeSearchQuery(state.viewState.search);
		if (!q) return rows;

		return rows.filter(row =>
			Object.values(row.__cells).some(cell =>
				cell.text.toLowerCase().includes(q)
			)
		);
	}

	// rows: dataset corrente, state: stato componente
	// Applica filtri combinati (AND) basati su viewState.filters
	// Usata nella pipeline dati dopo search per restringere ulteriormente il dataset
	function applyFilters(rows, state) {

		const filters = state.viewState.filters;
		if (!filters || !Object.keys(filters).length) return rows;

		return rows.filter(row => {

			return Object.entries(filters).every(([key, value]) => {

				if (value === '' || value == null) return true;

				const cell = row.__cells[key];
				if (!cell) return true;

				const col = state.columnsMap[key];
				if (col?.type === 'number') {
					return parseFloat(cell.text) == parseFloat(value);
				}

				return cell.text.trim() === value.trim();

			});
		});
	}

	// rows: dataset corrente, state: stato componente
	// Ordina dataset in base a colonna + ordine (asc/desc) con fallback su __index
	// Usata nella pipeline dati come ultimo step per garantire ordine finale stabile
	function applySort(rows, state) {

		const { sort, order } = state.viewState;

		if (!sort || !order) {
			return rows.slice().sort((a, b) => a.__index - b.__index);
		}

		const dir = order === 'desc' ? -1 : 1;

		const col = state.columnsMap[sort];
		const type = col?.type || 'string';

		return rows.slice().sort((a, b) => {

			let va = a.__cells[sort]?.text || '';
			let vb = b.__cells[sort]?.text || '';

			switch (type) {

				case 'number':
					va = parseFloat(va) || 0;
					vb = parseFloat(vb) || 0;
					return (va - vb) * dir;

				case 'date':

					va = parseDate(va, col.locale);
					vb = parseDate(vb, col.locale);

					return ((va || 0) - (vb || 0)) * dir;

				default:
					return va.localeCompare(vb) * dir;
			}
		});
	}

	// str: stringa data, locale: formato atteso (eu|en)
	// Converte una data testuale in timestamp gestendo più formati (ISO, EU, EN)
	// Usata nello sort per confronti coerenti su colonne date
	function parseDate(str, locale = 'eu') {

		if (!str) return null;

		str = str.trim();

		// ISO con -
		if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
			return new Date(str).getTime();
		}

		// ISO con /
		if (/^\d{4}\/\d{2}\/\d{2}/.test(str)) {
			return new Date(str.replace(/\//g, '-')).getTime();
		}

		const parts = str.split(/[\/-]/);
		if (parts.length !== 3) return null;

		let d, m, y;

		if (locale === 'eu') {
			[d, m, y] = parts;
		} else {
			[m, d, y] = parts;
		}

		// #13: zero-pad → "2024-1-5" non è affidabile cross-browser (Safari).
		const pad = (s) => String(s).padStart(2, '0');
		return new Date(`${y}-${pad(m)}-${pad(d)}`).getTime();
	}

	// value: input search
	// Normalizza query di ricerca (string → trim + lowercase)
	// Usata da applySearch per evitare mismatch e duplicazioni logiche
	function normalizeSearchQuery(value) {
		return String(value || '').trim().toLowerCase();
	}

/* =========================================================
REMOTE
   ---------------------------------------------------------
   Layer dedicato alla modalità remote.

   Responsabilità:
   - costruire query server-side
   - fetch JSON
   - mappare response → dataset interno
   - sincronizzare meta dal server

   Nota:
   - non usa pipeline locale
   - non ricalcola meta lato client
========================================================= */

	function buildRemoteQuery(state) {

		const { viewState } = state;
		const params = new URLSearchParams();

		params.set('page_num', String(viewState.page || 1));
		params.set('per_page', String(viewState.limit || viewState.initialLimit || 10));

		if (viewState.sort) {
			params.set('sort_by', viewState.sort);
		}

		if (viewState.order) {
			params.set('sort_dir', viewState.order);
		}

		const search = String(viewState.search || '').trim();
		if (search) {
			params.set('search', search);
		}

		Object.entries(viewState.filters || {}).forEach(([key, value]) => {
			if (value === '' || value == null) return;
			params.set(key, String(value));
		});

		return params.toString();
	}

	async function fetchRemoteData(state) {

		const url = state.remote.url;
		if (!url) {
			throw new Error('Missing data-table-source');
		}

		const query = buildRemoteQuery(state);
		const fullUrl = query ? `${url}${url.includes('?') ? '&' : '?'}${query}` : url;

		state.remote.loading = true;
		state.remote.error = null;

		const requestId = ++state.remote.requestId;

		runHook(state, 'BeforeFetch');

		const response = await fetch(fullUrl, {
			method: 'GET',
			cache: 'no-store',
			headers: {
				'X-Requested-With': 'XMLHttpRequest',
				'Accept': 'application/json'
			}
		});

		if (!response.ok) {
			throw new Error(`Remote fetch failed: ${response.status}`);
		}

		const json = await response.json();

		if (requestId !== state.remote.requestId) {
			return null;
		}

		if (!json || !Array.isArray(json.data)) {
			throw new Error('Invalid remote payload: missing data[]');
		}

		return json;
	}

	function htmlToText(value) {

		if (value == null) return '';

		const html = String(value);

		if (!html.includes('<')) {
			return html.replace(/\s+/g, ' ').trim();
		}

		const div = document.createElement('div');
		div.innerHTML = html;

		return (div.textContent || '').replace(/\s+/g, ' ').trim();
	}

	function mapRemoteRows(data, columns) {
		return data.map((item, rowIndex) => {

			const rowId = item.id ?? item.__id ?? `row_${rowIndex}`;
			const row = {
				__id: rowId,
				__index: rowIndex,
				__cells: {}
			};

			columns.forEach(col => {

				const raw = item[col.key] ?? '';
				const html = raw == null ? '' : String(raw);

				row.__cells[col.key] = {
					text: htmlToText(raw),
					html
				};
			});

			return row;
		});
	}

	function syncRemoteMeta(state, payload) {

		const { viewState } = state;

		viewState.page = readPositiveInt(payload.current_page, 1);
		viewState.limit = readPositiveInt(payload.per_page, viewState.initialLimit);

		viewState.meta.total = Number(payload.total) || 0;
		viewState.meta.filtered = Number(payload.total) || 0;
		viewState.meta.visible = Array.isArray(payload.data) ? payload.data.length : 0;
		viewState.meta.per_page = readPositiveInt(payload.per_page, viewState.initialLimit);
		viewState.meta.current_page = readPositiveInt(payload.current_page, 1);
		viewState.meta.last_page = readPositiveInt(payload.last_page, 1);

		if (viewState.meta.total > 0) {
			viewState.meta.from = ((viewState.meta.current_page - 1) * viewState.meta.per_page) + 1;
			viewState.meta.to = Math.min(
				viewState.meta.from + viewState.meta.visible - 1,
				viewState.meta.total
			);
		} else {
			viewState.meta.from = 0;
			viewState.meta.to = 0;
		}
	}

	async function renderRemoteTable(state) {

		const { tbody, columns } = state;
		const hidden = state.viewState.hiddenColumns;

		state.thead.querySelectorAll('th:not(.ng-table-expander-col)').forEach((th, i) => {
			const col = columns[i];
			th.style.display = hidden.includes(col.key) ? 'none' : '';
		});

		try {

			const payload = await fetchRemoteData(state);
			if (!payload) return;

			const rows = mapRemoteRows(payload.data, columns);

			state.dataset = rows;
			state.workingDataset = rows.slice();

			tbody.innerHTML = '';

			if (!rows.length) {
				tbody.appendChild(renderEmptyRow(getFullColspan(state), 'empty', state));
			} else {
				rows.forEach(row => {
					tbody.appendChild(renderRow(row, columns, state));
					appendDetailRow(state, row);
				});
			}

			syncRemoteMeta(state, payload);

			renderPagination(state);
			updateCount(state);
			updateSortUI(state);
			updatePageSizeSelects(state);

		} catch (error) {

			runHook(state, 'FetchError', error);

			state.remote.error = error;
			tbody.innerHTML = '';
			tbody.appendChild(renderErrorRow(getFullColspan(state), state));

			state.viewState.meta.total = 0;
			state.viewState.meta.filtered = 0;
			state.viewState.meta.visible = 0;
			state.viewState.meta.from = 0;
			state.viewState.meta.to = 0;
			state.viewState.meta.current_page = 1;
			state.viewState.meta.last_page = 1;
			state.viewState.meta.per_page = state.viewState.limit;

			renderPagination(state);
			updateCount(state);
			updateSortUI(state);
			updatePageSizeSelects(state);

		} finally {
			state.remote.loading = false;
		}

	}
/* =========================================================
META / PAGING
   ---------------------------------------------------------
   Gestisce paginazione e metadati derivati dal dataset.

   Responsabilità:
   - clamp pagina corrente (validazione range)
   - calcolo righe visibili (slice)
   - aggiornamento meta (total, filtered, visible, paging)

   Input:
   - workingDataset (post-pipeline)
   - viewState (page, limit)

   Output:
   - subset righe visibili
   - viewState.meta sempre coerente

   Utilizzato nel render per garantire consistenza
   tra dati, paginazione e UI
========================================================= */

	// state: oggetto stato componente (workingDataset + viewState)
	// Clampa la pagina corrente entro limiti validi (1 → lastPage) e restituisce totalPages
	// Usata prima di slicing/paginazione per evitare overflow o pagine non valide
	function clampPage(state) {

		const { workingDataset, viewState } = state;

		if (!viewState.limit) {
			viewState.page = 1;
			return 1;
		}

		const totalPages = Math.max(1, Math.ceil(workingDataset.length / viewState.limit));

		if (viewState.page < 1) viewState.page = 1;
		if (viewState.page > totalPages) viewState.page = totalPages;

		return totalPages;
	}

	// state: oggetto stato componente
	// Calcola e restituisce le righe visibili per la pagina corrente (slice su workingDataset)
	// Usata nel render per ottenere subset dati da visualizzare
	function getVisibleRows(state) {

		const { workingDataset, viewState } = state;

		if (!viewState.limit) {
			return workingDataset;
		}

		clampPage(state);

		const start = (viewState.page - 1) * viewState.limit;
		const end = start + viewState.limit;

		return workingDataset.slice(start, end);
	}

	// state: oggetto stato componente, visibleRows: righe correnti visibili
	// Sincronizza viewState.meta (total, filtered, visible, from/to, paging)
	// Usata dopo render per mantenere metadati coerenti con dataset e UI
	function syncMeta(state, visibleRows) {

		const { dataset, workingDataset, viewState } = state;

		const total = dataset.length;
		const filtered = workingDataset.length;

		// NO LIMIT → niente paginazione
		if (!viewState.limit) {

			viewState.meta.total = total;
			viewState.meta.filtered = filtered;
			viewState.meta.visible = filtered;
			viewState.meta.from = filtered ? 1 : 0;
			viewState.meta.to = filtered;
			viewState.meta.per_page = filtered;
			viewState.meta.current_page = 1;
			viewState.meta.last_page = 1;

			return;
		}

		// LIMIT ATTIVO → comportamento normale
		const visible = visibleRows.length;
		const lastPage = Math.max(1, Math.ceil(filtered / viewState.limit));
		const from = filtered ? ((viewState.page - 1) * viewState.limit) + 1 : 0;
		const to = filtered ? Math.min(from + visible - 1, filtered) : 0;

		viewState.meta.total = total;
		viewState.meta.filtered = filtered;
		viewState.meta.visible = visible;
		viewState.meta.from = from;
		viewState.meta.to = to;
		viewState.meta.per_page = viewState.limit;
		viewState.meta.current_page = viewState.page;
		viewState.meta.last_page = lastPage;
	}

/* =========================================================
RENDER
   ---------------------------------------------------------
   Responsabile della generazione DOM a partire da
   workingDataset e viewState.

   Responsabilità:
   - eseguire pipeline dati
   - calcolare paginazione
   - renderizzare tbody (righe o stato empty)
   - sincronizzare meta
   - aggiornare UI (pagination, count, sort)

   Input:
   - workingDataset (post-pipeline)
   - viewState (page, limit, sort, filters)

   Output:
   - DOM aggiornato (tbody + UI)
   - viewState.meta coerente

   Entry point principale dopo ogni update di stato
========================================================= */

	function runHook(state, name, payload = null) {

		const fn = state.root[`on${name}`];

		if (typeof fn === 'function') {
			try {
				fn(payload, state);
			} catch (e) {
				console.error(`ng-table hook error: ${name}`, e);
			}
		}
	}

	// state: oggetto stato componente (dataset, viewState, DOM refs)
	// Esegue il render completo: pipeline → paginazione → DOM → meta → UI
	// Usata come entry point ogni volta che cambia lo stato (search/filter/sort/page)
	// Persiste viewState su localStorage se il root ha data-table-persist (#11 dedup).
	function persistState(state) {
		if (!state.root.hasAttribute('data-table-persist')) return;
		const vs = state.viewState;
		localStorage.setItem(`ng-table:${state.root.id || 'default'}`, JSON.stringify({
			limit: vs.limit,
			sort: vs.sort,
			order: vs.order,
			search: vs.search,
			filters: vs.filters,
			hiddenColumns: vs.hiddenColumns
		}));
	}

	function renderTable(state) {

		runHook(state, 'BeforeRender');

		if (state.viewState.mode === 'remote') {

			persistState(state);

			renderRemoteTable(state);
			runHook(state, 'AfterRender', state.viewState);
			return;
		}

		// pipeline dati
		computeWorkingDataset(state);

		// clamp pagina
		clampPage(state);

		const { tbody, columns } = state;

		const hidden = state.viewState.hiddenColumns;

		state.thead.querySelectorAll('th:not(.ng-table-expander-col)').forEach((th, i) => {
			const col = columns[i];
			th.style.display = hidden.includes(col.key) ? 'none' : '';
		});

		// righe visibili
		const rows = getVisibleRows(state);

		// render body
		tbody.innerHTML = '';

		if (!rows.length) {

			const isFiltered = state.viewState.search || Object.keys(state.viewState.filters).length;

			tbody.appendChild(
				renderEmptyRow(
					getFullColspan(state),
					isFiltered ? 'no-results' : 'empty',
					state
				)
			);

		} else {
			rows.forEach(row => {
				tbody.appendChild(renderRow(row, columns, state));
				appendDetailRow(state, row);
			});
		}

		// sync stato (UNICA fonte)
		syncMeta(state, rows);

		// UI
		renderPagination(state);
		updateCount(state);
		updateSortUI(state);
		updatePageSizeSelects(state);

		persistState(state);
	}

	// row: oggetto riga strutturato, columns: definizione colonne
	// Genera una riga <tr> con celle basate su __cells (html)
	// Usata nel render per costruire il tbody dinamicamente
	function renderRow(row, columns, state) {

		const tr = document.createElement('tr');
		// dataset.rowId è sempre stringa: confronto stringificato per
		// allineamento con il delegato click su tbody.
		const rowIdStr = String(row.__id);
		tr.dataset.rowId = rowIdStr;

		// selection
		if (state.viewState.selectedRows.some(id => String(id) === rowIdStr)) {
			tr.classList.add('is-selected');
			tr.setAttribute('aria-selected', 'true');
		}

		// NB: il click handler della riga è gestito una sola volta a init via
		// event delegation su tbody (vedi bindRowSelection). Niente listener
		// per-riga per evitare leak di memoria su render ripetuti.

		// sub-table: colonna expander (caret) in testa
		if (state.expandable) {
			const open = state.expanded.has(rowIdStr);
			if (open) tr.classList.add('is-expanded');
			const exTd = document.createElement('td');
			exTd.className = 'ng-table-expander-cell';
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'ng-table-expander'
				+ (state.expandSize ? ' ng-table-expander-' + state.expandSize : '')
				+ (state.expandText ? ' ng-table-expander-text' : '');
			btn.setAttribute('aria-expanded', String(open));
			btn.setAttribute('aria-controls', detailDomId(state, rowIdStr));
			btn.setAttribute('aria-label', open ? 'Comprimi riga' : 'Espandi riga');

			// icona: di default sì; con testo, solo se è impostata un'icona esplicita
			if (!state.expandText || state.hasIconAttr) {
				const ic = document.createElement('i');
				ic.className = 'ph ' + (open ? state.collapseIcon : state.expandIcon);
				btn.appendChild(ic);
			}
			// testo (es. Open/Close): textContent → anti-XSS
			if (state.expandText) {
				const sp = document.createElement('span');
				sp.className = 'ng-table-expander-label';
				sp.textContent = open ? state.collapseText : state.expandText;
				btn.appendChild(sp);
			}

			exTd.appendChild(btn);
			tr.appendChild(exTd);
		}

		const hidden = state.viewState.hiddenColumns;

		columns.forEach(col => {

			if (hidden.includes(col.key)) return;

			const td = document.createElement('td');

			td.innerHTML = row.__cells[col.key]?.html || '';
			tr.appendChild(td);
		});

		return tr;
	}

/* =========================================================
SUB-TABLE (detail-row gemella) — opt-in data-table-expandable
   Slot libero + lazy via evento ng:table:expand. Il <select> nativo
   resta intatto; qui solo righe-dettaglio sotto la riga dati.
========================================================= */

	// colspan delle righe full-width (detail/empty/error) = colonne visibili + expander
	function getFullColspan(state) {
		const hidden = state.viewState.hiddenColumns;
		return Math.max(1, state.columns.length - hidden.length + (state.expandable ? 1 : 0));
	}

	// Valida una classe icona Phosphor (solo ph-*) da attributo utente; fallback se invalida.
	function sanitizePhIcon(val, fallback) {
		const v = String(val || '').trim();
		return /^ph-[a-z0-9-]+$/i.test(v) ? v : fallback;
	}

	// id DOM stabile per la detail-row (per aria-controls dell'expander)
	function detailDomId(state, id) {
		const base = state.root.id || 'ngt';
		return base + '-detail-' + String(id).replace(/[^\w-]/g, '_');
	}

	function findRowById(state, id) {
		const s = String(id);
		return state.dataset.find(r => String(r.__id) === s)
			|| state.workingDataset.find(r => String(r.__id) === s)
			|| null;
	}

	// Appende la detail-row sotto la riga dati, se aperta. Riusa il nodo
	// content cachato (lazy: nessuna re-fetch su re-render/sort/filtro).
	function appendDetailRow(state, row) {
		if (!state.expandable) return;
		const id = String(row.__id);
		if (!state.expanded.has(id)) return;

		const tr = document.createElement('tr');
		tr.className = 'ng-table-detail';
		tr.dataset.detailFor = id;
		tr.id = detailDomId(state, id);   // target di aria-controls dell'expander
		tr.setAttribute('role', 'region');

		const td = document.createElement('td');
		td.colSpan = getFullColspan(state);

		const inner = document.createElement('div');
		inner.className = 'ng-table-detail-inner';

		let content = state.detailCache.get(id);
		if (!content) {
			content = document.createElement('div');
			content.className = 'ng-table-detail-content';
			state.detailCache.set(id, content);
		}
		inner.appendChild(content);
		td.appendChild(inner);
		tr.appendChild(td);
		state.tbody.appendChild(tr);
	}

	function expandRow(state, id) {
		if (!state.expandable) return;
		const sid = String(id);
		if (state.expanded.has(sid)) return;

		// accordion: chiudi le altre
		if (state.expandSingle) {
			Array.from(state.expanded).forEach(other => collapseRow(state, other));
		}

		state.expanded.add(sid);

		// prima apertura → crea il container PRIMA del render e segnala (lazy fill).
		// Va creato qui (non in appendDetailRow) perché in modalità remote il render
		// è async: il dispatch deve avere il container già pronto.
		const fresh = !state.detailCache.has(sid);
		if (fresh) {
			const el = document.createElement('div');
			el.className = 'ng-table-detail-content';
			state.detailCache.set(sid, el);
		}

		renderTable(state);

		if (fresh) {
			const container = state.detailCache.get(sid);
			state.root.dispatchEvent(new CustomEvent('ng:table:expand', {
				bubbles: true,
				detail: { id: sid, row: findRowById(state, sid), container }
			}));
		}
	}

	function collapseRow(state, id) {
		const sid = String(id);
		if (!state.expanded.has(sid)) return;
		state.expanded.delete(sid);
		// NB: NON cancello detailCache → re-expand riusa il contenuto (no re-fetch)
		renderTable(state);
		state.root.dispatchEvent(new CustomEvent('ng:table:collapse', {
			bubbles: true,
			detail: { id: sid, row: findRowById(state, sid) }
		}));
	}

	function toggleRow(state, id) {
		state.expanded.has(String(id)) ? collapseRow(state, id) : expandRow(state, id);
	}

	// Delegato: click sull'expander → toggle della riga corrispondente
	function bindRowExpand(state) {
		const { root, tbody } = state;
		u.listen(tbody, 'click', (e) => {
			const btn = e.target?.closest?.('.ng-table-expander');
			if (!btn || !tbody.contains(btn)) return;
			const tr = btn.closest('tr[data-row-id]');
			if (!tr) return;
			e.stopPropagation();
			toggleRow(state, tr.dataset.rowId);
		}, false, root.__ngListeners);
	}

	// colspan: numero colonne
	// Genera riga placeholder quando non ci sono dati
	// Usata nel render per stato empty (nessun risultato)
	function renderEmptyRow(colspan, type = 'empty', state = null) {

		const tr = document.createElement('tr');
		tr.className = `ng-table-empty ng-table-empty-${type}`;

		const td = document.createElement('td');
		td.colSpan = Math.max(1, colspan);

		// Testi localizzabili via data-table-text-* sul root (#5), default EN.
		const ds = state?.root?.dataset || {};
		td.textContent = (
			type === 'no-results'
				? (ds.tableTextNoResults || 'No results found')
				: (ds.tableTextEmpty || 'No data available')
		);

		tr.appendChild(td);

		return tr;
	}

	function renderErrorRow(colspan, state) {

		const tr = document.createElement('tr');
		tr.className = 'ng-table-error';

		const td = document.createElement('td');
		td.colSpan = Math.max(1, colspan);

		const errText = state?.root?.dataset.tableTextError || 'Data Error Load';
		const box = document.createElement('div');
		box.className = 'ng-table-error-box';
		const inner = document.createElement('div');
		inner.textContent = errText;
		box.appendChild(inner);
		td.appendChild(box);

		tr.appendChild(td);

		return tr;
	}

	// state: oggetto stato componente
	// Aggiorna UI conteggio (range visibile / filtrato / totale)
	// Usata dopo render per mantenere feedback utente coerente
	function updateCount(state) {

		const { root, viewState } = state;
		const el = root.querySelector('[data-table-count]');
		if (!el) return;

		const { total, filtered, from, to } = viewState.meta;

		if (!filtered) {
			el.textContent = `0 / ${total}`;
			return;
		}

		if (filtered === total) {
			el.textContent = `${from}-${to} / ${total}`;
			return;
		}

		el.textContent = `${from}-${to} / ${filtered} / ${total}`;
	}

/* =========================================================
PAGINATION
   ---------------------------------------------------------
   Gestisce la UI della paginazione in base a viewState.meta.

   Responsabilità:
   - creare struttura DOM se assente
   - calcolare pagine visibili (range + ellissi)
   - gestire navigazione (prev/next/page)
   - sincronizzare stato attivo (is-active, is-disabled)

   Input:
   - viewState.meta (current_page, last_page)

   Output:
   - DOM paginazione aggiornato e interattivo

   Nota:
   - non calcola dati (usa meta già pronto)
   - delega navigazione a API (root.setPage)
========================================================= */

	// state: oggetto stato componente (root + viewState.meta)
	// Renderizza e aggiorna la paginazione (UI + eventi) in base allo stato corrente
	// Usata nel render per mantenere navigazione coerente con dataset e pagina attiva
	function renderPagination(state) {

		const { root, viewState } = state;

		if (!state.viewState.limit) {
			const pagination = state.root.querySelector('.ng-table-pagination');
			if (pagination) pagination.style.display = 'none';
			return;
		}

		let pagination = root.querySelector('.ng-table-pagination');
		let pageList = root.querySelector('.ng-page-list');
		let prevBtn = root.querySelector('.ng-page-prev');
		let nextBtn = root.querySelector('.ng-page-next');
		let firstBtn = root.querySelector('.ng-page-first');
		let lastBtn = root.querySelector('.ng-page-last');
		let ellipsisLeft = root.querySelector('.ng-ellipsis-left');
		let ellipsisRight = root.querySelector('.ng-ellipsis-right');

		if (!pageList) {

			pagination = document.createElement('div');
			pagination.className = 'ng-table-pagination';

			pagination.innerHTML = `
				<div class="ng-pagination">
					<a href="#" class="ng-page-prev">‹</a>
					<a href="#" class="ng-page-first">1</a>
					<span class="ng-ellipsis ng-ellipsis-left">…</span>
					<div class="ng-page-list"></div>
					<span class="ng-ellipsis ng-ellipsis-right">…</span>
					<a href="#" class="ng-page-last"></a>
					<a href="#" class="ng-page-next">›</a>
				</div>
			`;

			root.appendChild(pagination);

			pageList = pagination.querySelector('.ng-page-list');
			prevBtn = pagination.querySelector('.ng-page-prev');
			nextBtn = pagination.querySelector('.ng-page-next');
			firstBtn = pagination.querySelector('.ng-page-first');
			lastBtn = pagination.querySelector('.ng-page-last');
			ellipsisLeft = pagination.querySelector('.ng-ellipsis-left');
			ellipsisRight = pagination.querySelector('.ng-ellipsis-right');

			// #9: un solo listener delegato (tracciato da u.listen → pulito da
			// ng.unmount), legge meta al momento del click. Niente .onclick per-render.
			u.listen(pagination, 'click', (e) => {
				const a = e.target.closest('a');
				if (!a || !pagination.contains(a)) return;
				e.preventDefault();
				if (a.classList.contains('is-disabled') || a.classList.contains('is-page-empty')) return;
				const cur = state.viewState.meta.current_page;
				const tot = state.viewState.meta.last_page;
				if (a.classList.contains('ng-page-prev')) { if (cur > 1) root.setPage(cur - 1); }
				else if (a.classList.contains('ng-page-next')) { if (cur < tot) root.setPage(cur + 1); }
				else if (a.classList.contains('ng-page-first')) { root.setPage(1); }
				else if (a.classList.contains('ng-page-last')) { root.setPage(tot); }
				else if (a.classList.contains('ng-page')) {
					const p = parseInt(a.textContent, 10);
					if (Number.isFinite(p)) root.setPage(p);
				}
			}, false, root.__ngListeners);
		}

		// ── INJECT SELECT BOTTOM ──────────────────────────────────
		if (state._pageSizeSelectBottom) {
			const ngPagination = pagination.querySelector('.ng-pagination');
			if (ngPagination && !ngPagination.querySelector('.ng-page-size')) {
				ngPagination.insertBefore(state._pageSizeSelectBottom, ngPagination.firstChild);
			}
		}

		// ── ALLINEAMENTO PAGINATION ───────────────────────────────
		const ngPagination = pagination.querySelector('.ng-pagination');
		if (ngPagination && !ngPagination.dataset.alignSet) {
			const align = root.dataset.tablePaginationAlign || 'left';
			ngPagination.classList.add(`ng-pagination--${align}`);
			ngPagination.dataset.alignSet = '1';
		}

		const currentPage = viewState.meta.current_page;
		const totalPages = viewState.meta.last_page;

		pageList.innerHTML = '';

		if (totalPages <= 1) {
			pagination.style.display = 'none';
			return;
		}

		pagination.style.display = '';

		// ── FIRST / LAST LABEL ────────────────────────────────────
		firstBtn.textContent = '1';
		lastBtn.textContent = totalPages;

		// ── RANGE CENTRALE FISSO ─────────────────────────────────
		const slots = 3;
		const half = Math.floor(slots / 2);

		let start = currentPage - half;
		let end = currentPage + half;

		if (start < 2) {
			start = 2;
			end = start + slots - 1;
		}

		if (end > totalPages - 1) {
			end = totalPages - 1;
			start = end - slots + 1;
		}

		start = Math.max(2, start);
		end = Math.min(totalPages - 1, end);

		const showLeftEllipsis = start > 2;
		const showRightEllipsis = end < totalPages - 1;

		// ── RENDER PAGES (FIX SLOT FISSI) ─────────────────────────
		for (let i = 0; i < slots; i++) {

			const page = start + i;

			const el = document.createElement('a');
			el.href = '#';
			el.className = 'ng-page';

			// pagina valida
			if (page >= 2 && page <= totalPages - 1) {

				el.textContent = page;

				if (page === currentPage) {
					el.classList.add('is-active');
				}

				// click gestito dal listener delegato sul container (#9)

			} else {

				// placeholder sena pagina
				el.classList.add('is-page-empty');
				el.textContent = '';
				el.style.pointerEvents = 'none';
			}

			pageList.appendChild(el);
		}

		// ── ELLIPSIS STATE ───────────────────────────────────────
		ellipsisLeft.classList.toggle('is-hidden', !showLeftEllipsis);
		ellipsisRight.classList.toggle('is-hidden', !showRightEllipsis);

		// ── STATE BUTTONS ────────────────────────────────────────
		prevBtn.classList.toggle('is-disabled', currentPage === 1);
		nextBtn.classList.toggle('is-disabled', currentPage === totalPages);
		firstBtn.classList.toggle('is-disabled', currentPage === 1);
		lastBtn.classList.toggle('is-disabled', currentPage === totalPages);

		// Eventi: gestiti dal listener delegato sul container (#9), bound una volta.
	}

	// state: oggetto stato componente
	// Sincronizza il value di tutti i select ng-page-size con viewState.limit
	// Usata dopo ogni render per mantenere UI coerente con stato (es. setLimit esterno)
	function updatePageSizeSelects(state) {
		const { viewState } = state;
		state.pageSizeSelectNodes.forEach(select => {
			select.value = viewState.limit;
		});
	}

/* =========================================================
API
   ---------------------------------------------------------
   Espone metodi pubblici del componente sul root element.

   Responsabilità:
   - fornire interfaccia esterna (imperativa)
   - aggiornare viewState in modo controllato
   - triggerare render coerente

   Accesso:
   - root.__ngTable (interno)
   - root.* (shortcut pubblici)

   Nota:
   - tutte le azioni passano da state → render
========================================================= */

/* =========================================================
EXPORT
========================================================= */

function exportTable(state, config = {}) {

	const { root, columns, viewState } = state;

	const schema = columns.map((col, index) => ({
		index,
		key: col.key
	}));

	if (!schema.length) return [];

	const isRemote = viewState.mode === 'remote';

	// =========================
	// LOCAL
	// =========================
	if (!isRemote) {

		const rows = Array.from(
			root.querySelectorAll('tbody tr:not(.ng-table-empty)')
		);

		return rows.map(tr => {

			const cells = tr.children;
			const obj = {};

			schema.forEach(col => {
				const cell = cells[col.index];
				obj[col.key] = cell ? htmlToText(cell.innerHTML) : null;
			});

			return obj;
		});
	}

	// =========================
	// REMOTE
	// =========================

	const source = state.remote.url;
	if (!source) return [];

	const params = new URLSearchParams(buildRemoteQuery(state));

	// override export params
	Object.entries(config || {}).forEach(([k, v]) => {
		if (v != null) params.set(k, v);
	});

	return fetch(`${source}?${params.toString()}`, {
		cache: 'no-store'
	})
		.then(r => r.json())
		.then(json => {

			if (!json || !Array.isArray(json.data)) return [];

			return json.data.map(row => {

				const obj = {};

				schema.forEach(col => {
					obj[col.key] = htmlToText(row[col.key]);
				});

				return obj;
			});
		})
		.catch(() => []);
}

// state: oggetto stato componente (root + viewState + dataset)
// Espone API pubblica (reload, reset, setPage, setLimit, search, getState)
// Usata in init per permettere controllo esterno del componente via DOM
function exposeAPI(state) {

	const { root } = state;

	root.__ngTable = {

		reload() {
			renderTable(state);
		},

		reset() {

			state.dataset = cloneRows(state.originalDataset);
			state.workingDataset = state.dataset.slice();

			state.viewState.page = 1;
			state.viewState.limit = state.viewState.initialLimit;
			state.viewState.sort = null;
			state.viewState.order = 'asc';
			state.viewState.filters = {};
			state.viewState.search = '';
			state.viewState.selectedRows = [];

			// sub-table: chiudi tutto e svuota la cache dei dettagli
			if (state.expandable) {
				state.expanded.clear();
				state.detailCache.clear();
			}

			// RESET DOM FILTRI
			const inputs = state.root.querySelectorAll('[data-table-filter]');

			const groupedRadios = {};

			// Loop input:
			// - raggruppa radio per key (data-table-filter)
			// - resetta tutti gli altri input
			inputs.forEach(input => {

				const key = input.dataset.tableFilter;

				if (input.type === 'radio') {
					if (!groupedRadios[key]) groupedRadios[key] = [];
					groupedRadios[key].push(input);
					return;
				}

				input.value = '';
			});

			// Loop gruppi radio:
			// - seleziona il primo radio di ogni gruppo (reset deterministico)
			Object.values(groupedRadios).forEach(group => {
				group.forEach((radio, i) => {
					radio.checked = i === 0;
				});
			});

			// RESET SEARCH INPUT
			const searchInput = state.root.querySelector('[data-table-search]');
			if (searchInput) searchInput.value = '';

			renderTable(state);
		},

		getState() {
			return structuredClone(state.viewState);
		},

		setPage(page) {
			state.viewState.page = readPositiveInt(page, 1);
			renderTable(state);
		},

		setLimit(limit) {
			state.viewState.limit = readPositiveInt(limit, state.viewState.initialLimit);
			state.viewState.page = 1;
			renderTable(state);
		},

		search(query) {
			state.viewState.search = String(query || '');
			state.viewState.page = 1;
			renderTable(state);
		},

		export(config = {}) {
			return exportTable(state, config);
		},

		// sub-table (detail-row gemella)
		expandRow(id)   { expandRow(state, id); },
		collapseRow(id) { collapseRow(state, id); },
		toggleRow(id)   { toggleRow(state, id); },
		isExpanded(id)  { return state.expanded.has(String(id)); }
	};

	root.setPage = (...args) => root.__ngTable.setPage(...args);
	root.setLimit = (...args) => root.__ngTable.setLimit(...args);
	root.reset = (...args) => root.__ngTable.reset(...args);
	root.reload = (...args) => root.__ngTable.reload(...args);
	root.getState = (...args) => root.__ngTable.getState(...args);
	root.search = (...args) => root.__ngTable.search(...args);
	root.export = (...args) => root.__ngTable.export(...args);
}

// meta: configurazione statica del componente
// Definisce nome, versione, descrizione e metadati per registry NexiGrid
// Usata dal core per registrazione, debug e gestione lifecycle componenti
initTableV2.meta = {
	name: 'table-v2',
	version: '2.4.2',
	description: 'Advanced table: local/remote dataset, sort, search, filters, page-size, column toggle, row selection (delegated), sub-table/detail-row (data-table-expandable, slot libero + lazy via ng:table:expand), persist via localStorage. API: reload/reset/getState/setPage/setLimit/search/export/expandRow/collapseRow/toggleRow/isExpanded.',
	dependencies: [],
	author: 'NexiGrid',
	experimental: false
};

u.log('[NG] ng_table.js v2.4.2 loaded');

if (window.ng) {
	window.ng.registerComponent('table-v2', initTableV2);
}