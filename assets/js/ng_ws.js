/* ============================================================
NexiGrid – WebSocket Service
- Servizio globale, nessun DOM
- Connessione lazy: apre il socket al primo on()/emit()/connect()
- Event-bus per event_type: on(type, fn) / off(type, fn)
- emit() manda direttamente sul socket (broker fa broadcast)
============================================================ */

const config = {
	socketUrl: 'wss://ws.tempoliberoamga.app/',
	reconnectDelay: 3000,
	keepAliveDelay: 25000
};

const handlers = new Map();
const pending = [];

let socket = null;
let reconnectTimer = null;
let keepAliveTimer = null;
let connecting = false;
let closedManually = false;

function on(eventType, handler) {

	if (!eventType || typeof handler !== 'function') return;

	let set = handlers.get(eventType);

	if (!set) {
		set = new Set();
		handlers.set(eventType, set);
	}

	set.add(handler);

	ensureConnected();
}

function off(eventType, handler) {

	const set = handlers.get(eventType);

	if (!set) return;

	set.delete(handler);

	if (set.size === 0) {
		handlers.delete(eventType);
	}
}

function emit(eventType, payload = {}) {

	if (!eventType) return;

	const frame = JSON.stringify({
		event_type: eventType,
		payload
	});

	ensureConnected();

	if (socket && socket.readyState === WebSocket.OPEN) {
		socket.send(frame);
	} else {
		pending.push(frame);
	}
}

function flushPending() {

	if (!socket || socket.readyState !== WebSocket.OPEN) return;

	while (pending.length) {
		socket.send(pending.shift());
	}
}

function ensureConnected() {

	// Dopo close() esplicita non riaprire automaticamente (es. su emit/on):
	// la riapertura deve passare da una connect() esplicita.
	if (closedManually) return;

	if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
		return;
	}

	connect();
}

function connect() {

	if (connecting) return;

	if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
		return;
	}

	connecting = true;
	closedManually = false;

	try {
		socket = new WebSocket(config.socketUrl);
	} catch (error) {
		connecting = false;
		console.warn('WS create failed:', error);
		scheduleReconnect();
		return;
	}

	socket.addEventListener('open', () => {
		connecting = false;
		clearReconnect();
		startKeepAlive();
		flushPending();
		console.log('WS connected');
	});

	socket.addEventListener('message', event => {

		let data = null;

		try {
			data = JSON.parse(event.data);
		} catch {
			console.warn('WS invalid JSON:', event.data);
			return;
		}

		if (!data || typeof data !== 'object') return;

		if (!data.event_type) {
			// frame di sistema (ping/pong, ecc.) — ignora silenziosamente
			return;
		}

		const set = handlers.get(data.event_type);

		if (!set || set.size === 0) return;

		set.forEach(fn => {
			try {
				fn(data);
			} catch (error) {
				console.warn(`WS handler for '${data.event_type}' threw:`, error);
			}
		});
	});

	socket.addEventListener('error', error => {
		console.warn('WS error:', error);
	});

	socket.addEventListener('close', () => {

		connecting = false;
		clearKeepAlive();

		if (!closedManually) {
			scheduleReconnect();
		}
	});
}

function close() {

	closedManually = true;
	clearReconnect();
	clearKeepAlive();

	if (socket) {
		socket.close();
	}
}

function scheduleReconnect() {

	if (reconnectTimer) return;

	reconnectTimer = window.setTimeout(() => {
		reconnectTimer = null;
		connect();
	}, config.reconnectDelay);
}

function clearReconnect() {

	if (!reconnectTimer) return;

	window.clearTimeout(reconnectTimer);
	reconnectTimer = null;
}

function startKeepAlive() {

	clearKeepAlive();

	keepAliveTimer = window.setInterval(() => {
		if (socket?.readyState === WebSocket.OPEN) {
			socket.send(JSON.stringify({
				type: 'ping',
				time: Date.now()
			}));
		}
	}, config.keepAliveDelay);
}

function clearKeepAlive() {

	if (!keepAliveTimer) return;

	window.clearInterval(keepAliveTimer);
	keepAliveTimer = null;
}

function initWs() {
	return [];
}

initWs.meta = {
	name: 'ws',
	version: '1.1.0',
	description: 'Client WebSocket singleton: connect/emit/on con keep-alive e reconnect automatico.',
	dependencies: [],
	author: 'NexiGrid',
	experimental: false
};

/* ============================================================
REGISTER + API
============================================================ */

if (window.ng && !window.ng.ws?.__ready) {

	window.ng.registerComponent('ws', initWs);

	window.ng.ws = {
		__ready: true,
		on,
		off,
		emit,
		connect,
		close,
		get socket() {
			return socket;
		}
	};
}
