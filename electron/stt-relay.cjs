/**
 * Local dictation relay (owner ruling 2026-10-27, "build a local relay").
 *
 * The renderer must never hold the real Deepgram key. Deepgram's token
 * minting (/v1/auth/grant) requires a Member key, and the owner's current
 * key can transcribe but cannot mint. This relay bridges instead:
 *
 *   renderer --ws--> 127.0.0.1:<random>  --wss--> api.deepgram.com
 *
 * The raw key is read from auth.json at UPGRADE time (so a key replaced in
 * Settings takes effect on the next run without restarting the app) and is
 * only ever used in the upstream `token` subprotocol — the documented
 * raw-key handshake. Audio and Deepgram's JSON results are piped verbatim.
 *
 * Access control is a per-launch random ticket plus the app's own Origin.
 * Both are handed to the Next server child via env; /api/stt/token returns
 * them to the renderer, and only that renderer can complete the handshake.
 * The listener binds 127.0.0.1 only.
 *
 * Kept in CJS because it runs in the Electron main process (no build step).
 */

const http = require("node:http");
const { randomBytes, timingSafeEqual } = require("node:crypto");
const { WebSocket, WebSocketServer } = require("ws");

// Mirrors DG_URL in components/dictation.tsx — keep the params in sync.
// Query params live upstream so the renderer's audio frames need no
// per-run configure message.
const DG_LISTEN =
	"wss://api.deepgram.com/v1/listen" +
	"?model=nova-3" +
	"&encoding=linear16" +
	"&sample_rate=16000" +
	"&channels=1" +
	"&smart_format=true" +
	"&punctuate=true" +
	"&endpointing=300";

/** Constant-time compare of two same-length hex tickets. */
function ticketMatches(expected, actual) {
	if (typeof actual !== "string" || actual.length !== expected.length) return false;
	return timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}

/**
 * Start the relay. Resolves to { url, ticket, port, close } once listening.
 *
 * @param {object} options
 * @param {() => string} options.getKey  read the current Deepgram key (may throw)
 * @param {string} [options.origin]      exact browser Origin accepted (omit in tests)
 * @param {string} [options.upstreamUrl] Deepgram listen URL (tests override)
 * @param {(line: string) => void} [options.log]
 */
function startSttRelay({ getKey, origin, upstreamUrl = DG_LISTEN, log = () => {} } = {}) {
	if (typeof getKey !== "function") throw new Error("startSttRelay needs getKey()");

	const ticket = randomBytes(32).toString("hex");
	const server = http.createServer((_req, res) => {
		res.writeHead(404);
		res.end();
	});
	const wss = new WebSocketServer({ noServer: true });
	/** Live client sockets — terminated on close so no run survives quit. */
	const live = new Set();

	const rejectUpgrade = (socket, status, message) => {
		try {
			socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
		} catch {
			/* socket already gone */
		}
		socket.destroy();
	};

	server.on("upgrade", (req, socket, head) => {
		let requestUrl;
		try {
			requestUrl = new URL(req.url, "http://127.0.0.1");
		} catch {
			rejectUpgrade(socket, 400, "Bad Request");
			return;
		}
		if (requestUrl.pathname !== "/listen") {
			rejectUpgrade(socket, 404, "Not Found");
			return;
		}
		if (!ticketMatches(ticket, requestUrl.searchParams.get("ticket"))) {
			rejectUpgrade(socket, 401, "Unauthorized");
			return;
		}
		// A browser always sends Origin. Enforcing it keeps a random local
		// process from borrowing the ticket even if it learns it.
		if (origin && req.headers.origin !== origin) {
			rejectUpgrade(socket, 403, "Forbidden");
			return;
		}

		let key = "";
		try {
			key = String(getKey() || "");
		} catch (err) {
			log(`stt-relay: key read failed: ${err instanceof Error ? err.message : String(err)}`);
		}
		if (!key) {
			rejectUpgrade(socket, 503, "Service Unavailable");
			return;
		}

		wss.handleUpgrade(req, socket, head, (client) => {
			live.add(client);
			const pending = [];
			let upstream = null;
			let upstreamOpen = false;
			let settled = false;

			const finish = (code = 1000, reason = "") => {
				if (settled) return;
				settled = true;
				live.delete(client);
				pending.length = 0;
				try {
					if (client.readyState === WebSocket.OPEN) client.close(code, reason);
					else if (client.readyState !== WebSocket.CLOSED) client.terminate();
				} catch {
					/* already gone */
				}
				try {
					if (upstream && (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING)) {
						upstream.terminate();
					}
				} catch {
					/* already gone */
				}
			};

			try {
				upstream = new WebSocket(upstreamUrl, ["token", key], { handshakeTimeout: 10_000 });
			} catch (err) {
				log(`stt-relay: upstream construction failed: ${err instanceof Error ? err.message : String(err)}`);
				finish(1011, "upstream unavailable");
				return;
			}

			upstream.on("open", () => {
				upstreamOpen = true;
				// Everything the renderer captured during the handshake goes
				// out now, in order — Deepgram accepts faster-than-realtime.
				for (const [data, isBinary] of pending.splice(0)) {
					try {
						upstream.send(data, { binary: isBinary });
					} catch {
						finish(1011, "upstream send failed");
						return;
					}
				}
			});
			upstream.on("message", (data, isBinary) => {
				if (client.readyState !== WebSocket.OPEN) return;
				try {
					client.send(data, { binary: isBinary });
				} catch {
					finish(1011, "client send failed");
				}
			});
			upstream.on("unexpected-response", (_req, res) => {
				log(`stt-relay: Deepgram rejected the handshake (${res.statusCode})`);
				finish(1011, "upstream rejected");
			});
			upstream.on("error", (err) => {
				log(`stt-relay: upstream error: ${err instanceof Error ? err.message : String(err)}`);
				finish(1011, "upstream error");
			});
			upstream.on("close", (code) => finish(code === 1000 ? 1000 : 1011, "upstream closed"));

			client.on("message", (data, isBinary) => {
				if (upstreamOpen && upstream.readyState === WebSocket.OPEN) {
					try {
						upstream.send(data, { binary: isBinary });
					} catch {
						finish(1011, "upstream send failed");
					}
					return;
				}
				// Not open yet: hold the frame (bounded by the handshake
				// timeout above, so a dead upstream can't grow this forever).
				if (pending.length < 512) pending.push([data, isBinary]);
			});
			client.on("close", () => finish(1000));
			client.on("error", () => finish(1011));
		});
	});

	return new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			server.removeListener("error", reject);
			const { port } = server.address();
			log(`stt-relay: listening on 127.0.0.1:${port}`);
			resolve({
				port,
				ticket,
				url: `ws://127.0.0.1:${port}/listen`,
				close: () =>
					new Promise((done) => {
						settledClose();
						done();
					}),
			});

			function settledClose() {
				for (const socket of live) {
					try {
						socket.terminate();
					} catch {
						/* already gone */
					}
				}
				live.clear();
				wss.close();
				server.close();
			}
		});
	});
}

module.exports = { startSttRelay, DG_LISTEN };
