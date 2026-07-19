import { isIP } from 'node:net';

const ONE_INCH_ALLOWED_HOSTS = ['api.1inch.com', 'api.1inch.dev'];

export interface ProviderUrlValidationOptions {
  source: string;
  allowedHosts?: readonly string[];
}

function parseCsv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
}

function isDevEnvironment(): boolean {
  return process.env.ENVIRONMENT === 'dev';
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }

  const [first, second] = parts;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 100 && second >= 64 && second <= 127)
  );
}

function isPrivateIpv6(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:')
  );
}

function isPrivateOrLocalHost(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  const ipType = isIP(normalized);

  if (ipType === 4) {
    return isPrivateIpv4(normalized);
  }

  if (ipType === 6) {
    return isPrivateIpv6(normalized);
  }

  return (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    normalized.endsWith('.internal')
  );
}

function getAllowedHostSet(hosts: readonly string[] = []): Set<string> {
  return new Set(hosts.map(normalizeHostname));
}

function formatValidatedUrl(parsed: URL): string {
  if (parsed.pathname !== '/') {
    parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
  }

  if (parsed.pathname === '/' && !parsed.search && !parsed.hash) {
    return `${parsed.protocol}//${parsed.host}`;
  }

  return parsed.toString();
}

export function getProviderRpcAllowedHosts(): string[] {
  return parseCsv(process.env.PROVIDER_RPC_ALLOWED_HOSTS);
}

export function getBlockscoutAllowedHosts(): string[] {
  return parseCsv(process.env.BLOCKSCOUT_ALLOWED_HOSTS);
}

export function getOneInchAllowedHosts(): readonly string[] {
  return ONE_INCH_ALLOWED_HOSTS;
}

export function validateProviderUrl(
  rawUrl: string | undefined,
  options: ProviderUrlValidationOptions,
): string {
  if (!rawUrl) {
    throw new Error(`${options.source} is required`);
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`${options.source} must be a valid URL`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${options.source} must use http or https`);
  }

  if (!isDevEnvironment() && parsed.protocol !== 'https:') {
    throw new Error(`${options.source} must use https outside dev`);
  }

  if (parsed.username || parsed.password) {
    throw new Error(`${options.source} must not include URL credentials`);
  }

  const hostname = normalizeHostname(parsed.hostname);
  if (!isDevEnvironment() && isPrivateOrLocalHost(hostname)) {
    throw new Error(`${options.source} host is not allowed outside dev`);
  }

  const allowedHosts = getAllowedHostSet(options.allowedHosts);
  if (allowedHosts.size === 0 && !isDevEnvironment()) {
    throw new Error(`${options.source} requires an allowed host list`);
  }

  if (allowedHosts.size > 0 && !allowedHosts.has(hostname)) {
    throw new Error(`${options.source} host is not allowlisted`);
  }

  return formatValidatedUrl(parsed);
}

export function validateOptionalProviderUrl(
  rawUrl: string | undefined,
  options: ProviderUrlValidationOptions,
): string | undefined {
  if (!rawUrl) {
    return undefined;
  }

  return validateProviderUrl(rawUrl, options);
}

export function validateProviderUrlList(
  rawUrls: Array<string | undefined>,
  options: ProviderUrlValidationOptions,
): string[] {
  return rawUrls
    .map((url, index) =>
      validateOptionalProviderUrl(url, {
        ...options,
        source: `${options.source}_${index + 1}`,
      }),
    )
    .filter(Boolean) as string[];
}
