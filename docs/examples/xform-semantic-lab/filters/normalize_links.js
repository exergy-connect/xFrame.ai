/**
 * Normalize topology.links into dicts with interfaces[].
 */

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function adjustLinkObject(link, linkname, nodes) {
  if (isPlainObject(link) && Array.isArray(link.interfaces)) {
    const out = clone(link);
    out.interfaces = adjustInterfaceList(out.interfaces, linkname, nodes);
    return out;
  }

  if (isPlainObject(link)) {
    const linkData = {};
    const linkIntf = [];
    for (const [key, value] of Object.entries(link)) {
      if (Object.prototype.hasOwnProperty.call(nodes, key)) {
        const intf = isPlainObject(value)
          ? { ...clone(value), node: key }
          : { node: key };
        linkIntf.push(intf);
      } else {
        linkData[key] = clone(value);
      }
    }
    return { ...linkData, interfaces: linkIntf };
  }

  if (Array.isArray(link)) {
    return {
      interfaces: adjustInterfaceList(link, linkname, nodes),
    };
  }

  if (typeof link === "string") {
    const linkIntf = [];
    for (const part of link.split("-")) {
      const name = part.trim();
      if (!Object.prototype.hasOwnProperty.call(nodes, name)) {
        throw new Error(
          `Link string ${JSON.stringify(link)} in ${linkname} refers to unknown node ${name}`,
        );
      }
      linkIntf.push({ node: name });
    }
    return { interfaces: linkIntf };
  }

  throw new Error(`Invalid type ${typeof link} for ${linkname}`);
}

function adjustInterfaceList(iflist, linkname, nodes) {
  const out = [];
  iflist.forEach((entry, index) => {
    const loc = `${linkname}.interfaces[${index + 1}]`;
    if (typeof entry === "string") {
      if (!Object.prototype.hasOwnProperty.call(nodes, entry)) {
        throw new Error(`${loc} refers to unknown node ${entry}`);
      }
      out.push({ node: entry });
      return;
    }
    if (!isPlainObject(entry)) {
      throw new Error(`${loc} must be a dictionary or node name`);
    }
    if (typeof entry.node !== "string" || entry.node.trim() === "") {
      throw new Error(`${loc} is missing a "node" attribute`);
    }
    if (!Object.prototype.hasOwnProperty.call(nodes, entry.node)) {
      throw new Error(`${loc} refers to unknown node ${entry.node}`);
    }
    out.push(clone(entry));
  });
  return out;
}

export function normalize_links(topology) {
  if (!isPlainObject(topology)) {
    throw new Error("normalize_links requires a topology mapping");
  }
  const nodes = topology.nodes ?? {};
  if (!isPlainObject(nodes)) {
    throw new Error("normalize_links requires topology.nodes mapping");
  }
  const rawLinks = topology.links ?? [];
  if (!Array.isArray(rawLinks)) {
    throw new Error("normalize_links requires topology.links to be a list");
  }
  const out = clone(topology);
  out.links = rawLinks.map((link, idx) =>
    adjustLinkObject(link, `links[${idx + 1}]`, nodes),
  );
  return out;
}

export default normalize_links;
