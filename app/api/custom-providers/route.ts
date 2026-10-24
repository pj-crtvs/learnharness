import { getSafeCustomProviders, saveCustomProvider, validateCustomProviderInput } from "@/src/server";

export const dynamic = "force-dynamic";

export async function GET() {
	return Response.json({ providers: getSafeCustomProviders() });
}

export async function POST(req: Request) {
	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return Response.json({ error: "body must be JSON" }, { status: 400 });
	}

	const validated = validateCustomProviderInput(body);
	if (!validated.ok) {
		return Response.json({ error: validated.error }, { status: 400 });
	}

	saveCustomProvider(validated.config);
	return Response.json({ ok: true, providers: getSafeCustomProviders() });
}
