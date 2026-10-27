/**
 * Dictation credential seam.
 *
 * Desktop: returns the local relay's URL + per-launch ticket
 * (electron/stt-relay.cjs, env LH_STT_RELAY_*) — the renderer connects to
 * 127.0.0.1 and the raw Deepgram key never leaves the main process.
 *
 * Dev / no relay: the historical BYOK mint. The key lives server-side only
 * (auth.json → process.env in the desktop app; .env.local in dev — same
 * seam as OPENROUTER_API_KEY). A dictation run starts here: mint a
 * short-lived access token (TTL 300s — a run can outlast the 30s default),
 * the renderer opens its WebSocket to Deepgram with it, and audio flows
 * renderer → Deepgram directly, never through this server. The token is
 * only checked at the WebSocket handshake, so long dictation sessions
 * survive the TTL fine (Deepgram docs).
 *
 * NOTE: the fallback key needs ≥ Member permission in the Deepgram console
 * to call /auth/grant (their docs, token-based auth FAQ) — plain
 * read/transcribe keys return FORBIDDEN here. The relay path exists so
 * such keys still work.
 */
import { keyValue } from "@/src/server";

export async function GET() {
	const key = keyValue("DEEPGRAM_API_KEY");
	if (!key) {
		return Response.json(
			{ message: "No DEEPGRAM_API_KEY — add it to auth.json (desktop) or .env.local (dev)." },
			{ status: 503 },
		);
	}

	// Desktop builds run the local relay (electron/stt-relay.cjs): the
	// renderer connects to 127.0.0.1 and the raw key never reaches it.
	// This also covers keys that can transcribe but cannot mint tokens
	// (Deepgram's /auth/grant requires Member permission).
	const relayUrl = process.env.LH_STT_RELAY_URL;
	const relayTicket = process.env.LH_STT_RELAY_TICKET;
	if (relayUrl && relayTicket) {
		return Response.json({ relay: true, url: relayUrl, token: relayTicket });
	}

	try {
		const res = await fetch("https://api.deepgram.com/v1/auth/grant", {
			method: "POST",
			headers: { Authorization: `Token ${key}`, "Content-Type": "application/json" },
			body: JSON.stringify({ ttl_seconds: 300 }),
		});
		if (!res.ok) {
			const detail = await res.text();
			// Deepgram's 400 "Invalid credentials" / 401 are the KEY being bad
			// or revoked, not a transient grant failure. Say so plainly and
			// point at the Keys row instead of leaking the raw JSON. 403 is the
			// documented "key cannot mint tokens" (needs Member permission).
			if (res.status === 400 || res.status === 401) {
				return Response.json(
					{
						message:
							"Deepgram rejected this API key (invalid or revoked). Replace it in Settings → Providers → Dictation.",
						code: "invalid_credentials",
					},
					{ status: 401 },
				);
			}
			if (res.status === 403) {
				return Response.json(
					{
						message:
							"This Deepgram key cannot mint dictation tokens. Create a key with Member permission in the Deepgram console and replace it in Settings → Providers → Dictation.",
						code: "insufficient_permissions",
					},
					{ status: 403 },
				);
			}
			return Response.json(
				{ message: `Deepgram token grant failed (${res.status}): ${detail.slice(0, 200)}` },
				{ status: 502 },
			);
		}
		const data = (await res.json()) as { access_token?: string };
		if (!data.access_token) {
			return Response.json({ message: "Deepgram grant returned no token" }, { status: 502 });
		}
		return Response.json({ token: data.access_token });
	} catch {
		return Response.json({ message: "Deepgram unreachable" }, { status: 502 });
	}
}
