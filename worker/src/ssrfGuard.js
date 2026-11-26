import dns from 'node:dns/promises';
import ipaddr from 'ipaddr.js';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata.google.internal',
  'metadata.goog',
  '169.254.169.254',
  '100.100.100.200',
  'fd00:ec2::254',
]);

const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.localdomain'];

const UNSAFE_IP_RANGES = new Set([
  'unspecified',
  'broadcast',
  'multicast',
  'linkLocal',
  'loopback',
  'carrierGradeNat',
  'private',
  'reserved',
  'uniqueLocal',
  'ipv4Mapped',
  'rfc6145',
  '6to4',
  'teredo',
  'benchmarking',
  'amt',
  'as112',
  'deprecated',
  'orchid',
  'orchid2',
]);

export class SsrfError extends Error {
  constructor(message, code = 'SSRF_BLOCKED') {
    super(message);
    this.name = 'SsrfError';
    this.code = code;
    this.statusCode = 400;
  }
}

export function isIpSafe(ipString) {
  if (!ipString || typeof ipString !== 'string') return false;
  let cleaned = ipString.trim();
  // Strip IPv6 zone index if present (e.g. fe80::1%eth0)
  const zoneIdx = cleaned.indexOf('%');
  if (zoneIdx !== -1) {
    cleaned = cleaned.slice(0, zoneIdx);
  }
  if (!ipaddr.isValid(cleaned)) return false;

  const addr = ipaddr.parse(cleaned);
  if (addr.kind() === 'ipv6' && addr.isIPv4MappedAddress()) {
    const v4 = addr.toIPv4Address();
    return v4.range() === 'unicast';
  }
  const range = addr.range();
  return range === 'unicast' && !UNSAFE_IP_RANGES.has(range);
}

/**
 * Validates that a URL is a safe public HTTP/HTTPS target.
 * Checks protocol, credentials, hostname blocklist, IP literals, and DNS resolution.
 */
export async function validateExternalUrl(rawUrl, options = {}) {
  const { lookupFn = dns.lookup, allowLoopbackForTest = false } = options;

  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new SsrfError('A valid website URL is required.', 'INVALID_URL');
  }

  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new SsrfError('Malformed URL. Please include http:// or https://.', 'INVALID_URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SsrfError('Only HTTP and HTTPS protocols are allowed.', 'UNSUPPORTED_PROTOCOL');
  }

  if (parsed.username || parsed.password) {
    throw new SsrfError('URLs containing embedded credentials are not allowed.', 'CREDENTIALS_NOT_ALLOWED');
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (!hostname) {
    throw new SsrfError('URL hostname is missing.', 'INVALID_URL');
  }

  // Test-only explicit escape hatch for local fixture servers in automated tests
  const isTestMode = process.env.NODE_ENV === 'test' && allowLoopbackForTest === true;

  if (!isTestMode) {
    if (BLOCKED_HOSTNAMES.has(hostname)) {
      throw new SsrfError(`Access to restricted host "${hostname}" is blocked.`, 'SSRF_HOST_BLOCKED');
    }

    for (const suffix of BLOCKED_SUFFIXES) {
      if (hostname.endsWith(suffix)) {
        throw new SsrfError(`Access to internal domain "${hostname}" is blocked.`, 'SSRF_DOMAIN_BLOCKED');
      }
    }
  }

  // Handle IPv6 brackets stripped by URL.hostname
  const bareHost = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;

  if (ipaddr.isValid(bareHost)) {
    if (!isTestMode && !isIpSafe(bareHost)) {
      throw new SsrfError(`Target IP "${bareHost}" belongs to a blocked or non-public range.`, 'SSRF_IP_BLOCKED');
    }
    return { url: parsed.toString(), hostname: bareHost, resolvedIps: [bareHost] };
  }

  // Resolve DNS records and validate every returned address
  let records;
  try {
    records = await lookupFn(bareHost, { all: true, verbatim: true });
  } catch (err) {
    throw new SsrfError(`Could not resolve domain "${bareHost}": ${err.message}`, 'DNS_RESOLUTION_FAILED');
  }

  if (!Array.isArray(records) || records.length === 0) {
    throw new SsrfError(`No DNS records found for "${bareHost}".`, 'DNS_RESOLUTION_FAILED');
  }

  const resolvedIps = records.map((r) => r.address);
  if (!isTestMode) {
    for (const ip of resolvedIps) {
      if (!isIpSafe(ip)) {
        throw new SsrfError(
          `Domain "${bareHost}" resolved to a restricted IP address (${ip}).`,
          'SSRF_DNS_BLOCKED'
        );
      }
    }
  }

  return { url: parsed.toString(), hostname: bareHost, resolvedIps };
}
