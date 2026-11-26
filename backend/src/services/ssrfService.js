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

export function isPublicIp(ipString) {
  if (!ipString || typeof ipString !== 'string') return false;
  const cleaned = ipString.trim().split('%')[0];
  if (!ipaddr.isValid(cleaned)) return false;
  const addr = ipaddr.parse(cleaned);
  if (addr.kind() === 'ipv6' && addr.isIPv4MappedAddress()) {
    return addr.toIPv4Address().range() === 'unicast';
  }
  const range = addr.range();
  return range === 'unicast' && !UNSAFE_IP_RANGES.has(range);
}

export async function validateProjectUrl(rawUrl, options = {}) {
  const { lookupFn = dns.lookup, allowLoopbackForTest = false } = options;
  if (!rawUrl || typeof rawUrl !== 'string') {
    const err = new Error('Website URL is required.');
    err.statusCode = 400;
    throw err;
  }

  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    const err = new Error('Please enter a valid URL including http:// or https://.');
    err.statusCode = 400;
    throw err;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    const err = new Error('Only HTTP and HTTPS website URLs are supported.');
    err.statusCode = 400;
    throw err;
  }

  if (parsed.username || parsed.password) {
    const err = new Error('URLs with embedded credentials are not permitted.');
    err.statusCode = 400;
    throw err;
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
  const isTestBypass =
    process.env.NODE_ENV === 'test' &&
    (allowLoopbackForTest === true || process.env.ALLOW_TEST_LOOPBACK === 'true');

  if (!isTestBypass) {
    if (BLOCKED_HOSTNAMES.has(hostname) || BLOCKED_SUFFIXES.some((s) => hostname.endsWith(s))) {
      const err = new Error(`Target host "${hostname}" is restricted for security reasons.`);
      err.statusCode = 400;
      err.code = 'SSRF_BLOCKED';
      throw err;
    }
  }

  const bareHost = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
  if (ipaddr.isValid(bareHost)) {
    if (!isTestBypass && !isPublicIp(bareHost)) {
      const err = new Error(`IP address "${bareHost}" is in a blocked private or reserved range.`);
      err.statusCode = 400;
      err.code = 'SSRF_BLOCKED';
      throw err;
    }
    return parsed.toString();
  }

  if (!isTestBypass) {
    let records;
    try {
      records = await lookupFn(bareHost, { all: true, verbatim: true });
    } catch {
      const err = new Error(`Unable to resolve domain "${bareHost}". Please check the URL.`);
      err.statusCode = 400;
      throw err;
    }

    if (!records || records.length === 0 || records.some((r) => !isPublicIp(r.address))) {
      const err = new Error(`Domain "${bareHost}" resolved to a restricted network address.`);
      err.statusCode = 400;
      err.code = 'SSRF_BLOCKED';
      throw err;
    }
  }

  return parsed.toString();
}
