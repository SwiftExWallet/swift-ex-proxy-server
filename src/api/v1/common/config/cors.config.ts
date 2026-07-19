import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

const LOCAL_DEVELOPMENT_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function parseCsv(value?: string): string[] {
  return (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isHttpsOrLocalDevelopmentOrigin(
  origin: string,
  nodeEnv?: string,
): boolean {
  try {
    const parsed = new URL(origin);

    if (parsed.protocol === 'https:') {
      return true;
    }

    return (
      nodeEnv !== 'production' &&
      parsed.protocol === 'http:' &&
      LOCAL_DEVELOPMENT_HOSTS.has(parsed.hostname)
    );
  } catch {
    return false;
  }
}

export function getAllowedCorsOrigins(
  env: NodeJS.ProcessEnv = process.env,
): Set<string> {
  const browserOrigins = parseCsv(env.CORS_ALLOWED_ORIGINS).filter((origin) =>
    isHttpsOrLocalDevelopmentOrigin(origin, env.NODE_ENV),
  );
  const mobileWebViewOrigins = parseCsv(env.CORS_ALLOWED_WEBVIEW_ORIGINS);

  return new Set([...browserOrigins, ...mobileWebViewOrigins]);
}

export function createCorsOptions(
  env: NodeJS.ProcessEnv = process.env,
): CorsOptions {
  const allowedOrigins = getAllowedCorsOrigins(env);

  return {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('CORS origin not allowed'), false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-auth-device-token',
      'x-wallet-address',
    ],
    credentials: false,
    maxAge: 86400,
  };
}
