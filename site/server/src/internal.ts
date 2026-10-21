// Random per-process secret. The workflow engine attaches it to the requests it makes to
// backend functions, which tells the SDK shim "this call comes from a trusted automation, not
// from the internet" (the platform did the same for scheduled and event-triggered workflows).
export const AUTOMATION_HEADER = 'x-rn-automation';
export const AUTOMATION_KEY = crypto.randomUUID() + crypto.randomUUID();
