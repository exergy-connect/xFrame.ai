/**
 * Assign mgmt/loopback/link addresses and BGP neighbor IPs from pools.
 * Expects `normalize_links` first (links as `interfaces: [{ node }, ...]`,
 * and each node with a `type: loopback` entry on `interfaces`).
 * Author-specified addresses are kept, but must be usable hosts in the
 * relevant pool / link subnet (not network or broadcast).
 */

import {
  ipv4_host,
  ipv4_network,
  ipv4_subnet,
  ipv4_subnet_host,
  ipv6_host,
  ipv6_subnet,
  ipv6_subnet_host,
  ip_address,
  assert_ipv4_usable,
  assert_ipv6_usable,
} from "./ip.js";

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isAssignedAddress(value) {
  return typeof value === "string" && value.trim() !== "";
}

function validateAuthorIPv4(value, { pool, label }) {
  if (!isAssignedAddress(value)) {
    return;
  }
  assert_ipv4_usable(value, { pool, label });
}

function validateAuthorIPv6(value, { pool, label }) {
  if (!isAssignedAddress(value)) {
    return;
  }
  assert_ipv6_usable(value, { pool, label });
}

export function ip_assign(topology, addressing) {
  if (!isPlainObject(topology)) {
    throw new Error("ip_assign requires a topology mapping with nodes/links");
  }
  if (!isPlainObject(addressing)) {
    throw new Error("ip_assign requires addressing pools");
  }

  const inputNodes = topology.nodes ?? {};
  const inputLinks = topology.links ?? [];
  const mgmt = addressing.mgmt ?? {};
  const loopbackPool = addressing.loopback ?? {};
  const p2p = addressing.p2p ?? {};
  const mgmtStart = Number(mgmt.start ?? 100);
  const p2pPrefix = Number(p2p.prefix ?? 30);
  const loopbackPrefix = Number(loopbackPool.prefix ?? 32);

  const nodes = {};
  for (const [nname, raw] of Object.entries(inputNodes)) {
    const node = clone(raw) ?? {};
    node.name = node.name ?? nname;
    node.device = node.device ?? "frr";
    node.module = node.module ?? topology.module ?? ["bgp"];
    node.interfaces = Array.isArray(node.interfaces) ? node.interfaces : [];
    node.mgmt = node.mgmt ?? {};

    const id = Number(node.id);
    if (!Number.isInteger(id) || id < 1) {
      throw new Error(`Node ${nname} needs a positive integer id`);
    }

    if (isAssignedAddress(node.mgmt.ipv4)) {
      validateAuthorIPv4(node.mgmt.ipv4, {
        pool: mgmt.ipv4,
        label: `Node ${nname} mgmt.ipv4`,
      });
    } else if (mgmt.ipv4 && node.mgmt.ipv4 == null) {
      node.mgmt.ipv4 = ipv4_host(mgmt.ipv4, mgmtStart + id);
    }

    if (isAssignedAddress(node.mgmt.ipv6)) {
      validateAuthorIPv6(node.mgmt.ipv6, {
        pool: mgmt.ipv6,
        label: `Node ${nname} mgmt.ipv6`,
      });
    } else if (mgmt.ipv6 && node.mgmt.ipv6 == null) {
      node.mgmt.ipv6 = ipv6_host(mgmt.ipv6, mgmtStart + id);
    }

    // Loopback addressing targets the loopback interface created by normalize_links.
    const lb = node.interfaces.find((iface) => iface?.type === "loopback");
    if (!lb) {
      throw new Error(
        `Node ${nname} is missing a loopback interface (run normalize_links first)`,
      );
    }
    node.loopback = lb;

    // Loopback may intentionally sit outside the pool (e.g. a custom advertise
    // prefix). When the author supplies a CIDR, only check it is a usable host
    // in that prefix; bare addresses still require the loopback pool.
    if (isAssignedAddress(lb.ipv4)) {
      const hasPrefix = String(lb.ipv4).includes("/");
      validateAuthorIPv4(lb.ipv4, {
        pool: hasPrefix ? undefined : loopbackPool.ipv4,
        label: `Node ${nname} loopback.ipv4`,
      });
    } else if (loopbackPool.ipv4 && lb.ipv4 == null) {
      lb.ipv4 = `${ipv4_host(loopbackPool.ipv4, id)}/${loopbackPrefix}`;
    }

    if (isAssignedAddress(lb.ipv6)) {
      const hasPrefix = String(lb.ipv6).includes("/");
      validateAuthorIPv6(lb.ipv6, {
        pool: hasPrefix ? undefined : loopbackPool.ipv6,
        label: `Node ${nname} loopback.ipv6`,
      });
    } else if (loopbackPool.ipv6 && lb.ipv6 == null) {
      const p6 = Number(loopbackPool.prefix6 ?? 128);
      lb.ipv6 = `${ipv6_host(loopbackPool.ipv6, id)}/${p6}`;
    }

    node.bgp = node.bgp ?? {};
    if (node.bgp.router_id == null && lb.ipv4) {
      node.bgp.router_id = ip_address(lb.ipv4);
    }
    if (node.bgp.ipv4 == null && lb.ipv4) {
      node.bgp.ipv4 = true;
    }
    if (node.bgp.ipv6 == null && lb.ipv6) {
      node.bgp.ipv6 = true;
    }
    if (
      (node.bgp.advertise == null || node.bgp.advertise.length === 0) &&
      lb.ipv4
    ) {
      node.bgp.advertise = [{ ipv4: ipv4_network(lb.ipv4) }];
    }

    nodes[nname] = node;
  }

  const ifcounts = Object.fromEntries(Object.keys(nodes).map((n) => [n, 0]));
  const peerAddr = {};
  const links = [];

  inputLinks.forEach((rawLink, idx) => {
    const linkindex = idx + 1;
    if (!isPlainObject(rawLink) || !Array.isArray(rawLink.interfaces)) {
      throw new Error(
        `Link ${linkindex} must be normalized (dict with interfaces[]); run normalize_links first`,
      );
    }

    const carvedV4 = p2p.ipv4
      ? ipv4_subnet(p2p.ipv4, p2pPrefix, idx)
      : undefined;
    const p6 = Number(p2p.prefix6 ?? 64);
    const carvedV6 = p2p.ipv6 ? ipv6_subnet(p2p.ipv6, p6, idx) : undefined;

    const linkIfaces = [];
    rawLink.interfaces.forEach((ep, epIndex) => {
      const nname = ep?.node;
      if (typeof nname !== "string" || nname.trim() === "") {
        throw new Error(
          `Link ${linkindex}.interfaces[${epIndex + 1}] is missing a "node" attribute`,
        );
      }
      const node = nodes[nname];
      if (!node) {
        throw new Error(`Link ${linkindex} references unknown node ${nname}`);
      }
      ifcounts[nname] += 1;
      const ifindex = ifcounts[nname];
      const ifname = `eth${ifindex}`;
      const iface = { ...clone(ep), ifname, ifindex, node: nname };
      const loc = `Link ${linkindex} node ${nname}`;

      // Pools fill gaps only; an author-specified address wins, and an explicit
      // `false` keeps the interface unaddressed for that family.
      if (isAssignedAddress(iface.ipv4)) {
        // CIDR overrides may leave the p2p pool (custom link subnet). Bare
        // addresses must land in this link's carved subnet.
        const hasPrefix = String(iface.ipv4).includes("/");
        validateAuthorIPv4(iface.ipv4, {
          pool: hasPrefix ? undefined : carvedV4,
          label: `${loc} ipv4`,
        });
      } else if (p2p.ipv4 && iface.ipv4 == null) {
        iface.ipv4 = ipv4_subnet_host(p2p.ipv4, p2pPrefix, idx, epIndex + 1);
      }

      if (isAssignedAddress(iface.ipv6)) {
        const hasPrefix = String(iface.ipv6).includes("/");
        validateAuthorIPv6(iface.ipv6, {
          pool: hasPrefix ? undefined : carvedV6,
          label: `${loc} ipv6`,
        });
      } else if (p2p.ipv6 && iface.ipv6 == null) {
        iface.ipv6 = ipv6_subnet_host(p2p.ipv6, p6, idx, epIndex + 1);
      }

      linkIfaces.push({
        node: nname,
        ifname,
        ...(iface.ipv4 ? { ipv4: iface.ipv4 } : {}),
        ...(iface.ipv6 ? { ipv6: iface.ipv6 } : {}),
      });

      node.interfaces.push({
        ifname,
        ifindex,
        ...(iface.ipv4 ? { ipv4: iface.ipv4 } : {}),
        ...(iface.ipv6 ? { ipv6: iface.ipv6 } : {}),
      });

      peerAddr[nname] = peerAddr[nname] ?? {};
    });

    for (let i = 0; i < linkIfaces.length; i++) {
      for (let j = 0; j < linkIfaces.length; j++) {
        if (i === j) {
          continue;
        }
        const a = linkIfaces[i];
        const b = linkIfaces[j];
        peerAddr[a.node][b.node] = {
          ipv4: b.ipv4 ? ip_address(b.ipv4) : undefined,
          ipv6: b.ipv6 ? ip_address(b.ipv6) : undefined,
        };
      }
    }

    links.push({
      ...clone(rawLink),
      linkindex: rawLink.linkindex ?? linkindex,
      interfaces: linkIfaces,
    });
  });

  for (const [, node] of Object.entries(nodes)) {
    const neighbors = Array.isArray(node.bgp?.neighbors)
      ? node.bgp.neighbors
      : [];
    for (const nbr of neighbors) {
      const peer = peerAddr[node.name]?.[nbr.name];
      if (!peer) {
        continue;
      }
      if (nbr.ipv4 == null && peer.ipv4) {
        nbr.ipv4 = peer.ipv4;
      }
      if (nbr.ipv6 == null && peer.ipv6) {
        nbr.ipv6 = peer.ipv6;
      }
      nbr.activate = nbr.activate ?? {};
      if (nbr.ipv4 && nbr.activate.ipv4 == null) {
        nbr.activate.ipv4 = true;
      }
      if (nbr.ipv6 && nbr.activate.ipv6 == null) {
        nbr.activate.ipv6 = true;
      }
    }
  }

  return { nodes, links };
}

/** Alias used by create._transform. */
export const assign_ips = ip_assign;

export default {
  ip_assign,
  assign_ips,
};
