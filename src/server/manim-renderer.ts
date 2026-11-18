/** Client for the isolated Manim rendering service. */

const RENDERER_URL = (process.env.MANIM_RENDERER_URL || "http://127.0.0.1:8765").replace(/\/$/, "");
const RENDERER_SECRET = process.env.MANIM_RENDERER_SECRET || "dev-secret";

export function rendererConfigured(): boolean {
	return Boolean(RENDERER_URL);
}

async function rfetch(path: string, init?: RequestInit): Promise<Response> {
	return fetch(`${RENDERER_URL}${path}`, {
		...init,
		headers: {
			"X-Renderer-Secret": RENDERER_SECRET,
			...(init?.headers || {}),
		},
	});
}

export async function rendererHealth(): Promise<{ ok: boolean; error?: string }> {
	try {
		const res = await rfetch("/health");
		if (!res.ok) return { ok: false, error: `status ${res.status}` };
		return { ok: true };
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : String(e) };
	}
}

export async function submitRender(code: string, quality: string, sceneName?: string, timeout?: number): Promise<{ jobId: string; sceneName: string }> {
	const res = await rfetch("/render", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ code, quality, scene_name: sceneName, timeout: timeout ?? 300 }),
	});
	if (!res.ok) {
		const text = await res.text().catch(() => "");
		throw new Error(`render submit failed (${res.status}): ${text}`);
	}
	const json = (await res.json()) as { job_id: string; scene_name: string };
	return { jobId: json.job_id, sceneName: json.scene_name };
}

export interface RendererJob {
	id: string;
	status: string;
	quality: string;
	scene_name?: string | null;
	progress: number;
	artifact_path?: string | null;
	error?: string | null;
	logs?: string;
}

export async function getRenderJob(jobId: string): Promise<RendererJob> {
	const res = await rfetch(`/jobs/${jobId}`);
	if (!res.ok) throw new Error(`job fetch failed (${res.status})`);
	return (await res.json()) as RendererJob;
}

export async function cancelRenderJob(jobId: string): Promise<void> {
	await rfetch(`/jobs/${jobId}/cancel`, { method: "POST" });
}

export async function fetchArtifact(jobId: string): Promise<ArrayBuffer> {
	const res = await rfetch(`/artifacts/${jobId}.mp4`);
	if (!res.ok) throw new Error(`artifact fetch failed (${res.status})`);
	return res.arrayBuffer();
}
