// Registration email lookup intentionally does not expose account existence.
// The auth provider is the source of truth for whether an email can register.
export default async function(req: Request): Promise<Response> {
  return Response.json({ available: true, registration_check: 'deferred_to_auth' }, { status: 200 });
}