function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const env = {
  DATABASE_URL: required('DATABASE_URL', 'postgresql://localhost:5432/unified_phone_dev'),
  ENCRYPTION_KEY: required(
    'ENCRYPTION_KEY',
    // 32-byte zero key — only acceptable for local dev before configuring.
    '0000000000000000000000000000000000000000000000000000000000000000',
  ),
  JWT_SECRET: required('JWT_SECRET', 'dev-only-jwt-secret-change-me'),
  APP_USER_EMAIL: process.env.APP_USER_EMAIL ?? 'admin@example.com',
  APP_USER_PASSWORD_HASH: process.env.APP_USER_PASSWORD_HASH ?? '',
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: Number(process.env.PORT ?? 3000),
  APP_BASE_URL: process.env.APP_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`,
  RINGCENTRAL_SERVER:
    process.env.RINGCENTRAL_SERVER ?? 'https://platform.ringcentral.com',
};

if (env.NODE_ENV === 'production') {
  if (env.ENCRYPTION_KEY === '0000000000000000000000000000000000000000000000000000000000000000') {
    throw new Error(
      'ENCRYPTION_KEY must be set to a real random value in production. ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  if (env.JWT_SECRET === 'dev-only-jwt-secret-change-me') {
    throw new Error('JWT_SECRET must be set to a real random value in production.');
  }
}
