// All runtime configuration comes from environment variables (see ../.env.example).
const env = (k: string, d = ''): string => (Deno.env.get(k) ?? d).trim();

export const config = {
  port: Number(env('PORT', '8080')),
  databaseUrl: env('DATABASE_URL', 'postgres://postgres:postgres@localhost:5432/repeaternation'),
  // Public origin of the site, no trailing slash. Used in e-mails, OAuth redirects
  // and passed to functions as the X-Base44-App-Url header they already expect.
  publicUrl: env('PUBLIC_URL', 'http://localhost:8080').replace(/\/+$/, ''),
  jwtSecret: env('JWT_SECRET'),
  dataDir: env('DATA_DIR', './data'),
  webDir: env('WEB_DIR', '../web/dist'),
  // Mirrors the old app id so Base44-style URLs (/api/apps/<id>/functions/<name>) keep working.
  appId: env('APP_ID', '6a6d787f8e808727b935dd09'),
  smtp: {
    host: env('SMTP_HOST'),
    port: Number(env('SMTP_PORT', '587')),
    user: env('SMTP_USER'),
    pass: env('SMTP_PASS'),
    from: env('SMTP_FROM', 'Repeater Nation <no-reply@localhost>'),
    secure: env('SMTP_SECURE') === 'true',
  },
  // Entity events are fanned out in-process; run a single app replica.
  schedulerEnabled: env('SCHEDULER', 'on') !== 'off',
  isProd: env('NODE_ENV') === 'production',
};

export function requireConfig() {
  if (!config.jwtSecret || config.jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be set to a random string of at least 32 characters (try: openssl rand -hex 32)');
  }
}
