/**
 * Local dictation relay (owner ruling 2026-10-27): the renderer talks to
 * 127.0.0.1 and the Deepgram key stays in the Electron main process.
 *
 * These tests pin the security seams (ticket, Origin, keyless) and the
 * transparent piping of audio frames + Deepgram messages.
 */

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import { WebSocket, WebSocketServer } from "ws";

const require = createRequire(import.meta.url);
const { startSttRelay } = require("../electron/stt-relay.cjs") as {
	startSttRelay: (options: {
		getKey: () => string;
		origin?: string;
		upstreamUrl?: string;
		log?: (line: string) => void;
	}) => Promise<{ url: string; ticket: string; port: number; close: () => Promise<void> }>;
};

const ORIGIN = "http://127.0.0.1:41414";

let upstream: WebSocketServer;
let upstreamUrl = "";
let upstreamProtocol = "";

before(async () => {
	await new Promise<void>((resolve) => {
		upstream = new WebSocketServer({ host: "127.0.0.1", port: 0 }, () => resolve());
	});
	const { port } = upstream.address() as AddressInfo;
	upstreamUrl = `ws://127.0.0.1:${port}`;
	upstream.on("connection", (socket, req) => {
		upstreamProtocol = String(req.headers["sec-websocket-protocol"] ?? "");
		// A Deepgram-shaped JSON result, then a verbatim echo of every frame.
		socket.send(JSON.stringify({ type: "Metadata", model: "nova-3" }));
		socket.on("message", (data, isBinary) => {
			socket.send(data, { binary: isBinary });
		});
	});
});

after(async () => {
	await new Promise<void>((resolve) => upstream.close(() => resolve()));
});

/** Wait for a status on a rejected upgrade. */
function rejectionStatus(url: string, origin: string): Promise<number> {
	return new Promise((resolve, reject) => {
		const socket = new WebSocket(url, { origin });
		const timer = setTimeout(() => reject(new Error("upgrade never settled")), 5000);
		socket.on("unexpected-response", (_req, res) => {
			clearTimeout(timer);
			resolve(res.statusCode ?? 0);
			socket.terminate();
		});
		socket.on("error", () => {
			/* unexpected-response carries the status */
		});
	});
}

describe("stt relay — local WebSocket bridge", () => {
	it("pipes Deepgram JSON and binary audio with the raw-key subprotocol", async () => {
		const relay = await startSttRelay({ getKey: () => "dg-test-key", origin: ORIGIN, upstreamUrl });
		try {
			const socket = new WebSocket(`${relay.url}?ticket=${relay.ticket}`, { origin: ORIGIN });
			const received: Array<{ data: unknown; binary: boolean }> = [];
			await new Promise<void>((resolve, reject) => {
				const timer = setTimeout(() => reject(new Error("relay never delivered both frames")), 5000);
				socket.on("open", () => socket.send(Buffer.from([1, 2, 3, 4]), { binary: true }));
				socket.on("message", (data, isBinary) => {
					received.push({ data, binary: isBinary });
					if (received.length === 2) {
						clearTimeout(timer);
						resolve();
					}
				});
				socket.on("error", reject);
			});
			socket.close();

			assert.equal(upstreamProtocol, "token,dg-test-key");
			const [metadata, audio] = received;
			assert.ok(metadata && audio, "both frames arrived");
			assert.deepEqual(JSON.parse(String(metadata.data)), { type: "Metadata", model: "nova-3" });
			assert.equal(audio.binary, true);
			assert.deepEqual(Buffer.from(audio.data as Buffer), Buffer.from([1, 2, 3, 4]));
		} finally {
			await relay.close();
		}
	});

	it("rejects a wrong ticket before touching Deepgram", async () => {
		let keyReads = 0;
		const relay = await startSttRelay({
			getKey: () => {
				keyReads++;
				return "dg-test-key";
			},
			origin: ORIGIN,
			upstreamUrl,
		});
		try {
			assert.equal(await rejectionStatus(`${relay.url}?ticket=deadbeef`, ORIGIN), 401);
			assert.equal(keyReads, 0);
		} finally {
			await relay.close();
		}
	});

	it("rejects a foreign Origin even with the right ticket", async () => {
		const relay = await startSttRelay({ getKey: () => "dg-test-key", origin: ORIGIN, upstreamUrl });
		try {
			assert.equal(await rejectionStatus(`${relay.url}?ticket=${relay.ticket}`, "http://evil.test"), 403);
		} finally {
			await relay.close();
		}
	});

	it("says 503 when the key store is empty", async () => {
		const relay = await startSttRelay({ getKey: () => "", origin: ORIGIN, upstreamUrl });
		try {
			assert.equal(await rejectionStatus(`${relay.url}?ticket=${relay.ticket}`, ORIGIN), 503);
		} finally {
			await relay.close();
		}
	});
});
