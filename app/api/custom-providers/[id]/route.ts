import {
	deleteCustomProvider,
	getCustomProvider,
	getSafeCustomProviders,
	saveCustomProvider,
	validateCustomProviderInput,
} from "@/src/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: Params) {
	const { id } = await params;
	const existing = getCustomProvider(id);
	if (!existing) {
		return Response.json({ error: `Provider "${id}" not found` }, { status: 404 });
	}

	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return Response.json({ error: "body must be JSON" }, { status: 400 });
	}

	const validated = validateCustomProviderInput(body, id);
	if (!validated.ok) {
		return Response.json({ error: validated.error }, { status: 400 });
	}

	saveCustomProvider(validated.config);
	return Response.json({ ok: true, providers: getSafeCustomProviders() });
}

export async function DELETE(_req: Request, { params }: Params) {
	const { id } = await params;
	const existing = getCustomProvider(id);
	if (!existing) {
		return Response.json({ error: `Provider "${id}" not found` }, { status: 404 });
	}

	deleteCustomProvider(id);
	return Response.json({ ok: true, providers: getSafeCustomProviders() });
}
