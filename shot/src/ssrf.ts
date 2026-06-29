// Best-effort SSRF guard. Because the service has no auth, by default it refuses
// to fetch URLs that resolve to private / loopback / link-local / cloud-metadata
// addresses (e.g. http://169.254.169.254/). This is a guard rail, not a complete
// defence: it does not protect against DNS rebinding or redirects to private
// hosts mid-navigation. Disable with ALLOW_PRIVATE_IPS=true on trusted networks.

import dns from "node:dns/promises";
import net from "node:net";
import { config } from "./config";
import { HttpError } from "./errors";

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
  const [a, b] = parts;
  if (a === 0) return true; // "this" network
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local + AWS/GCP metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT (100.64/10)
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const x = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (x === "::1" || x === "::") return true; // loopback / unspecified
  if (x.startsWith("fe80")) return true; // link-local
  if (x.startsWith("fc") || x.startsWith("fd")) return true; // unique-local
  if (x.startsWith("::ffff:")) return isPrivateIPv4(x.slice(7)); // IPv4-mapped
  return false;
}

function isPrivateAddress(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return isPrivateIPv4(ip);
  if (family === 6) return isPrivateIPv6(ip);
  return false;
}

/**
 * Validate a user-supplied URL: must be http(s) and (unless allowed) must not
 * resolve to a private address. Returns the parsed URL on success.
 */
export async function assertUrlAllowed(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(400, `Invalid url: ${JSON.stringify(raw)}`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new HttpError(400, `Unsupported protocol "${url.protocol}" (only http and https)`);
  }

  if (config.allowPrivateIps) return url;

  const host = url.hostname.toLowerCase();

  if (host === "localhost" || host.endsWith(".localhost")) {
    throw new HttpError(403, "Refusing to fetch localhost (set ALLOW_PRIVATE_IPS=true to allow)");
  }

  // IP literal in the URL — check directly, no DNS needed.
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) {
      throw new HttpError(403, `Refusing private/loopback address ${host} (set ALLOW_PRIVATE_IPS=true to allow)`);
    }
    return url;
  }

  // Resolve the hostname and reject if any record is private.
  let records: { address: string }[];
  try {
    records = await dns.lookup(host, { all: true });
  } catch {
    throw new HttpError(400, `Cannot resolve host: ${host}`);
  }
  for (const { address } of records) {
    if (isPrivateAddress(address)) {
      throw new HttpError(
        403,
        `Refusing ${host}: resolves to private address ${address} (set ALLOW_PRIVATE_IPS=true to allow)`,
      );
    }
  }

  return url;
}
