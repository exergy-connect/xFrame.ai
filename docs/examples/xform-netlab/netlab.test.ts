import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { compileFiles } from "../../src/api/compile.js";
import { emitFinal, isFinalFilesBundle } from "../../src/api/final.js";
import { DOCUMENT_EXT } from "../../src/shared/constants.js";
import { loadFilterFiles } from "../../src/pipeline/loadFilters.js";

const netlabDir = path.dirname(fileURLToPath(import.meta.url));
const filterDir = path.join(netlabDir, "filters");

async function loadNetlabFilters() {
  return loadFilterFiles([
    path.join(filterDir, "ip.js"),
    path.join(filterDir, "normalize_links.js"),
    path.join(filterDir, "assign_ips.js"),
  ]);
}

test("netlab example emits Containerlab and device configs", async () => {
  const tree = await compileFiles(
    [
      path.join(netlabDir, "netlab-fw.xpt"),
      path.join(netlabDir, `topology${DOCUMENT_EXT}`),
    ],
    { baseDir: netlabDir, execute: false },
  );
  const addressed = tree._concepts.addressed as {
    nodes: Record<string, Record<string, unknown>>;
  };
  const nodes = addressed.nodes;
  assert.equal((nodes.dut.mgmt as { ipv4: string }).ipv4, "192.168.121.101");
  assert.equal(
    (nodes.dut.interfaces as Array<{ ipv4: string }>)[0].ipv4,
    "10.1.0.1/30",
  );
  assert.equal(
    (nodes.x2.loopback as { ipv4: string }).ipv4,
    "172.42.42.1/24",
  );
  const result = await emitFinal(tree, "clab.yml", { baseDir: netlabDir });
  assert.ok(isFinalFilesBundle(result));
  const byPath = Object.fromEntries(result.files.map((f) => [f.path, f.content]));
  assert.ok(byPath["clab.yml"]);
  assert.match(byPath["clab.yml"]!, /name: ebgp-session/);
  assert.match(byPath["clab.yml"]!, /dut:eth1/);
  assert.match(byPath["clab.yml"]!, /mgmt-ipv4: 192\.168\.121\.101/);
  assert.match(byPath["config/dut.conf"]!, /router bgp 65000/);
  assert.match(byPath["config/dut.conf"]!, /ip address 10\.1\.0\.1\/30/);
  assert.match(byPath["config/x1.conf"]!, /router bgp 65100/);
  assert.match(byPath["config/x2.conf"]!, /network 172\.42\.42\.0\/24/);
  assert.match(byPath["config/x2.conf"]!, /ip address 172\.42\.42\.1\/24/);
});

test("assign_ips only fills addresses the author left out", async () => {
  const netlabFilters = await loadNetlabFilters();
  const topology = {
    nodes: {
      a: { id: 1, bgp: { as: 65000, neighbors: [{ name: "b", as: 65001 }] } },
      b: {
        id: 2,
        mgmt: { ipv4: "192.168.121.50" },
        bgp: { as: 65001, neighbors: [{ name: "a", as: 65000 }] },
      },
    },
    links: [
      { interfaces: [{ node: "a" }, { node: "b", ipv4: "192.0.2.99/24" }] },
    ],
  };
  const addressing = {
    mgmt: { ipv4: "192.168.121.0/24", start: 100 },
    loopback: { ipv4: "10.0.0.0/24", prefix: 32 },
    p2p: { ipv4: "10.1.0.0/16", prefix: 30 },
  };

  const addressed = netlabFilters.assign_ips!(
    netlabFilters.normalize_links!(topology),
    addressing,
  ) as {
    nodes: Record<
      string,
      {
        mgmt: { ipv4: string };
        interfaces: Array<{ ipv4: string }>;
        bgp: { neighbors: Array<{ name: string; ipv4: string }> };
      }
    >;
  };

  assert.equal(addressed.nodes.b!.mgmt.ipv4, "192.168.121.50");
  assert.equal(addressed.nodes.a!.mgmt.ipv4, "192.168.121.101");
  assert.equal(addressed.nodes.b!.interfaces[0]!.ipv4, "192.0.2.99/24");
  assert.equal(addressed.nodes.a!.interfaces[0]!.ipv4, "10.1.0.1/30");
  assert.equal(addressed.nodes.a!.bgp.neighbors[0]!.ipv4, "192.0.2.99");
});

test("assign_ips rejects author IPs outside the pool or reserved", async () => {
  const netlabFilters = await loadNetlabFilters();
  const addressing = {
    mgmt: { ipv4: "192.168.121.0/24", start: 100 },
    loopback: { ipv4: "10.0.0.0/24", prefix: 32 },
    p2p: { ipv4: "10.1.0.0/16", prefix: 30 },
  };
  const assign = (topology: unknown) =>
    netlabFilters.assign_ips!(
      netlabFilters.normalize_links!(topology),
      addressing,
    );

  assert.throws(
    () =>
      assign({
        nodes: { a: { id: 1, mgmt: { ipv4: "10.9.9.9" } } },
        links: [],
      }),
    /mgmt\.ipv4 10\.9\.9\.9 is not in pool/,
  );

  assert.throws(
    () =>
      assign({
        nodes: { a: { id: 1, mgmt: { ipv4: "192.168.121.0" } } },
        links: [],
      }),
    /reserved address/,
  );

  assert.throws(
    () =>
      assign({
        nodes: { a: { id: 1, mgmt: { ipv4: "192.168.121.255" } } },
        links: [],
      }),
    /reserved address/,
  );

  assert.throws(
    () =>
      assign({
        nodes: {
          a: { id: 1 },
          b: { id: 2 },
        },
        links: [
          {
            interfaces: [
              { node: "a", ipv4: "10.1.0.0/30" },
              { node: "b" },
            ],
          },
        ],
      }),
    /reserved address \(network or broadcast\)/,
  );

  assert.throws(
    () =>
      assign({
        nodes: {
          a: { id: 1 },
          b: { id: 2 },
        },
        links: [
          {
            interfaces: [
              { node: "a", ipv4: "10.1.0.5" },
              { node: "b" },
            ],
          },
        ],
      }),
    /not in pool 10\.1\.0\.0\/30/,
  );

  // Custom loopback CIDR outside the pool is allowed if it is a usable host.
  const ok = assign({
    nodes: {
      a: { id: 1, loopback: { ipv4: "172.42.42.1/24" } },
    },
    links: [],
  }) as { nodes: { a: { loopback: { ipv4: string } } } };
  assert.equal(ok.nodes.a.loopback.ipv4, "172.42.42.1/24");

  assert.throws(
    () =>
      assign({
        nodes: { a: { id: 1, loopback: { ipv4: "172.42.42.0/24" } } },
        links: [],
      }),
    /reserved address \(network or broadcast\)/,
  );
});
