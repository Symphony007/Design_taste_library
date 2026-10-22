/**
 * URL Safety Validator
 *
 * Ensures URLs passed to headless Chromium only use http/https protocols
 * and strictly rejects localhost, loopback, private RFC-1918 networks,
 * and link-local addresses (SSRF protection).
 */

export interface UrlSafetyCheck {
  safe: boolean;
  reason?: string;
  url?: URL;
}

/**
 * Checks whether an IP address string falls into a private/loopback IPv4 range.
 */
function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return false;
  }

  const [a, b] = parts;

  // 0.0.0.0/8 (Broadcast/Current network)
  if (a === 0) return true;

  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;

  // 10.0.0.0/8 (Private class A)
  if (a === 10) return true;

  // 172.16.0.0/12 (Private class B: 172.16.0.0 – 172.31.255.255)
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.168.0.0/16 (Private class C)
  if (a === 192 && b === 168) return true;

  // 169.254.0.0/16 (Link-local / APIPA)
  if (a === 169 && b === 254) return true;

  return false;
}

/**
 * Checks whether an IP string is an IPv6 loopback or private address.
 */
function isPrivateIpv6(host: string): boolean {
  const clean = host.replace(/^\[|\]$/g, "").toLowerCase();

  // Loopback ::1
  if (clean === "::1" || clean === "0:0:0:0:0:0:0:1") return true;

  // Link-local fe80::/10
  if (clean.startsWith("fe8") || clean.startsWith("fe9") || clean.startsWith("fea") || clean.startsWith("feb")) {
    return true;
  }

  // Unique local addresses fc00::/7 (fc00... and fd00...)
  if (clean.startsWith("fc") || clean.startsWith("fd")) {
    return true;
  }

  // IPv4-mapped IPv6 (::ffff:127.0.0.1)
  if (clean.includes("::ffff:")) {
    const ipv4Part = clean.split("::ffff:").pop();
    if (ipv4Part && isPrivateIpv4(ipv4Part)) {
      return true;
    }
  }

  return false;
}

/**
 * Single, comprehensive URL safety function.
 */
export function isSafeUrl(rawUrl: string): UrlSafetyCheck {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { safe: false, reason: "URL cannot be empty." };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      safe: false,
      reason: `Invalid URL format: "${trimmed}". Must be a valid absolute URL.`,
    };
  }

  // Only allow http: and https:
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      safe: false,
      reason: `Unsupported protocol "${parsed.protocol}". Only http: and https: are allowed.`,
    };
  }

  const hostname = parsed.hostname.toLowerCase().trim();

  // Reject empty hostnames
  if (!hostname) {
    return { safe: false, reason: "URL must contain a valid host name." };
  }

  // Check for localhost and local domains
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    return {
      safe: false,
      reason: `Local and internal network hostnames ("${hostname}") are rejected for safety.`,
    };
  }

  // Check IPv4 addresses
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)) {
    if (isPrivateIpv4(hostname)) {
      return {
        safe: false,
        reason: `Private and loopback IP addresses ("${hostname}") are rejected for safety.`,
      };
    }
  }

  // Check IPv6 addresses
  if (hostname.startsWith("[") || hostname.includes(":")) {
    if (isPrivateIpv6(hostname)) {
      return {
        safe: false,
        reason: `Private and loopback IPv6 addresses ("${hostname}") are rejected for safety.`,
      };
    }
  }

  return { safe: true, url: parsed };
}
