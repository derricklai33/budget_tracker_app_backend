export interface AuthConfig {
  /** Auth0 tenant URL with trailing slash, e.g. https://tenant.auth0.com/ (also the token issuer). */
  domain: string;
  /** Auth0 API identifier (token audience). */
  apiIdentifier: string;
}

export interface AppConfig {
  auth: AuthConfig;
  port: number;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export function loadConfig(): AppConfig {
  required('DATABASE_URL');
  return {
    auth: { domain: required('AUTH0_DOMAIN'), apiIdentifier: required('AUTH0_API_IDENTIFIER') },
    port: Number(process.env.PORT ?? 3000),
  };
}
