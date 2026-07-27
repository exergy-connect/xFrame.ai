/**
 * IPv4/IPv6 host and subnet carving helpers (also exposed as Jinja filters).
 */

function parseIPv4(cidr) {
  const text = String(cidr);
  const slash = text.indexOf("/");
  if (slash < 0) {
    throw new Error(`Expected IPv4 CIDR, got: ${text}`);
  }
  const addr = text.slice(0, slash);
  const prefix = Number(text.slice(slash + 1));
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    throw new Error(`Invalid IPv4 prefix length in: ${text}`);
  }
  const num = parseIPv4Address(addr);
  return { num, prefix };
}

function parseIPv4Address(addr) {
  const text = String(addr);
  const parts = text.split(".").map((p) => Number(p));
  if (
    parts.length !== 4 ||
    parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)
  ) {
    throw new Error(`Invalid IPv4 address: ${text}`);
  }
  return (
    (((parts[0] << 24) >>> 0) +
      ((parts[1] << 16) >>> 0) +
      ((parts[2] << 8) >>> 0) +
      (parts[3] >>> 0)) >>>
    0
  );
}

function formatIPv4(num) {
  const n = num >>> 0;
  return `${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`;
}

function ipv4Mask(prefix) {
  return prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
}

function parseIPv6(cidr) {
  const text = String(cidr);
  const slash = text.indexOf("/");
  if (slash < 0) {
    throw new Error(`Expected IPv6 CIDR, got: ${text}`);
  }
  const addr = text.slice(0, slash);
  const prefix = Number(text.slice(slash + 1));
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 128) {
    throw new Error(`Invalid IPv6 prefix length in: ${text}`);
  }
  const num = parseIPv6Address(addr);
  return { num, prefix };
}

function parseIPv6Address(addr) {
  const expanded = expandIPv6(String(addr));
  const parts = expanded.split(":").map((h) => BigInt(parseInt(h, 16)));
  let num = 0n;
  for (const part of parts) {
    num = (num << 16n) + part;
  }
  return num;
}

function expandIPv6(addr) {
  const halves = addr.split("::");
  if (halves.length > 2) {
    throw new Error(`Invalid IPv6 address: ${addr}`);
  }
  let head = halves[0] ? halves[0].split(":") : [];
  let tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  if (halves.length === 1) {
    head = addr.split(":");
    tail = [];
  }
  const missing = 8 - head.length - tail.length;
  if (missing < 0) {
    throw new Error(`Invalid IPv6 address: ${addr}`);
  }
  const mid = halves.length === 2 ? Array(missing).fill("0") : [];
  const full = [...head, ...mid, ...tail].map((h) => h || "0");
  if (full.length !== 8) {
    throw new Error(`Invalid IPv6 address: ${addr}`);
  }
  return full.map((h) => h.padStart(4, "0")).join(":");
}

function formatIPv6(num) {
  const parts = [];
  let n = num;
  for (let i = 0; i < 8; i++) {
    parts.unshift((n & 0xffffn).toString(16));
    n >>= 16n;
  }
  return parts.join(":");
}

function ipv6Mask(prefix) {
  if (prefix === 0) {
    return 0n;
  }
  if (prefix === 128) {
    return (1n << 128n) - 1n;
  }
  return ((1n << BigInt(prefix)) - 1n) << BigInt(128 - prefix);
}

function splitAddrPrefix(value) {
  const text = String(value);
  const slash = text.indexOf("/");
  if (slash < 0) {
    return { addr: text, prefix: undefined };
  }
  const prefix = Number(text.slice(slash + 1));
  if (!Number.isInteger(prefix) || prefix < 0) {
    throw new Error(`Invalid prefix length in: ${text}`);
  }
  return { addr: text.slice(0, slash), prefix };
}

/**
 * Validate an author-assigned IPv4 host.
 * - With a CIDR: host must not be the network/broadcast address of that prefix
 *   (/31 and /32 have no reserved hosts). If `pool` is set, the host must also
 *   fall inside that pool.
 * - Bare address: `pool` is required; host must be inside it and not reserved.
 */
export function assert_ipv4_usable(value, { pool, label } = {}) {
  const where = label ?? "IPv4 address";
  const { addr, prefix: ownPrefix } = splitAddrPrefix(value);
  const host = parseIPv4Address(addr);

  if (ownPrefix !== undefined) {
    if (ownPrefix > 32) {
      throw new Error(`${where} ${value} has invalid prefix length`);
    }
    if (ownPrefix < 31) {
      const mask = ipv4Mask(ownPrefix);
      const network = (host & mask) >>> 0;
      const broadcast = (network | (~mask >>> 0)) >>> 0;
      if (host === network || host === broadcast) {
        throw new Error(
          `${where} ${value} is a reserved address (network or broadcast)`,
        );
      }
    }
    if (pool) {
      assertHostInIPv4Pool(host, pool, where, value);
    }
    return;
  }

  if (!pool) {
    throw new Error(
      `${where} ${value} needs a prefix length or an addressing pool to validate against`,
    );
  }
  assertHostInIPv4Pool(host, pool, where, value);
}

function assertHostInIPv4Pool(host, pool, where, value) {
  const { num: poolNet, prefix } = parseIPv4(pool);
  const mask = ipv4Mask(prefix);
  const network = (poolNet & mask) >>> 0;
  if ((host & mask) >>> 0 !== network) {
    throw new Error(`${where} ${value} is not in pool ${pool}`);
  }
  if (prefix < 31) {
    const broadcast = (network | (~mask >>> 0)) >>> 0;
    if (host === network || host === broadcast) {
      throw new Error(
        `${where} ${value} is a reserved address in pool ${pool}`,
      );
    }
  }
}

/**
 * Validate an author-assigned IPv6 host.
 * - With a CIDR: host must not be the all-zeros subnet-router anycast address
 *   for prefixes shorter than /127.
 * - Bare address: must fall inside `pool` and not be that reserved address.
 */
export function assert_ipv6_usable(value, { pool, label } = {}) {
  const where = label ?? "IPv6 address";
  const { addr, prefix: ownPrefix } = splitAddrPrefix(value);
  const host = parseIPv6Address(addr);

  if (ownPrefix !== undefined) {
    if (ownPrefix > 128) {
      throw new Error(`${where} ${value} has invalid prefix length`);
    }
    if (ownPrefix < 127) {
      const mask = ipv6Mask(ownPrefix);
      const network = host & mask;
      if (host === network) {
        throw new Error(
          `${where} ${value} is a reserved address (subnet-router anycast)`,
        );
      }
    }
    if (pool) {
      assertHostInIPv6Pool(host, pool, where, value);
    }
    return;
  }

  if (!pool) {
    throw new Error(
      `${where} ${value} needs a prefix length or an addressing pool to validate against`,
    );
  }
  assertHostInIPv6Pool(host, pool, where, value);
}

function assertHostInIPv6Pool(host, pool, where, value) {
  const { num: poolNet, prefix } = parseIPv6(pool);
  const mask = ipv6Mask(prefix);
  const network = poolNet & mask;
  if ((host & mask) !== network) {
    throw new Error(`${where} ${value} is not in pool ${pool}`);
  }
  if (prefix < 127 && host === network) {
    throw new Error(
      `${where} ${value} is a reserved address in pool ${pool}`,
    );
  }
}

export function ipv4_host(cidr, index) {
  const { num } = parseIPv4(cidr);
  return formatIPv4(num + Number(index));
}

export function ipv4_subnet(cidr, newPrefix, index) {
  const { num, prefix } = parseIPv4(cidr);
  const np = Number(newPrefix);
  if (np < prefix || np > 32) {
    throw new Error(`Cannot carve /${np} from ${cidr}`);
  }
  const size = 2 ** (32 - np);
  return `${formatIPv4(num + Number(index) * size)}/${np}`;
}

export function ipv4_subnet_host(cidr, newPrefix, subnetIndex, hostIndex) {
  const subnet = ipv4_subnet(cidr, newPrefix, subnetIndex);
  const { num } = parseIPv4(subnet);
  return `${formatIPv4(num + Number(hostIndex))}/${newPrefix}`;
}

export function ipv4_network(cidr) {
  const { num, prefix } = parseIPv4(cidr);
  const mask = ipv4Mask(prefix);
  return `${formatIPv4(num & mask)}/${prefix}`;
}

export function ipv6_host(cidr, index) {
  const { num } = parseIPv6(cidr);
  return formatIPv6(num + BigInt(index));
}

export function ipv6_subnet(cidr, newPrefix, index) {
  const { num, prefix } = parseIPv6(cidr);
  const np = Number(newPrefix);
  if (np < prefix || np > 128) {
    throw new Error(`Cannot carve /${np} from ${cidr}`);
  }
  const size = 1n << BigInt(128 - np);
  return `${formatIPv6(num + BigInt(index) * size)}/${np}`;
}

export function ipv6_subnet_host(cidr, newPrefix, subnetIndex, hostIndex) {
  const subnet = ipv6_subnet(cidr, newPrefix, subnetIndex);
  const { num } = parseIPv6(subnet);
  return `${formatIPv6(num + BigInt(hostIndex))}/${newPrefix}`;
}

export function ip_address(addr) {
  const text = String(addr);
  const slash = text.indexOf("/");
  return slash < 0 ? text : text.slice(0, slash);
}

export default {
  ipv4_host,
  ipv4_subnet,
  ipv4_subnet_host,
  ipv4_network,
  ipv6_host,
  ipv6_subnet,
  ipv6_subnet_host,
  ip_address,
  assert_ipv4_usable,
  assert_ipv6_usable,
};
