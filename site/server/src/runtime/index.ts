// Stand-in for the `base44:runtime` module: secrets come from environment variables.
// Secret names that aren't valid env var names (e.g. "X-RN-SDR-Secret") are also looked up
// as UPPER_SNAKE (X_RN_SDR_SECRET).
const snake = (n: string) => n.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase();

export const secrets = {
  get(name: string): string | undefined {
    const v = Deno.env.get(name) ?? Deno.env.get(snake(name));
    return v === undefined || v === '' ? undefined : v;
  },
};
