// Stacked MRs: a layer targets the source branch of the layer below it. The
// stack is rebuilt from the open MR list on every poll, nothing is stored.

// iid -> { id, depth, position, size, parentIid, childIids, baseBranch, layers }.
// `id` is the root layer's branch, `baseBranch` is the branch the root targets,
// `layers` lists the whole stack bottom to top ({ iid, title, source_branch, depth }).
// A lone MR gets size 1. Branching stacks (two MRs on the same parent) are kept
// as one stack ordered by depth, then iid.
export function analyzeStacks(mrs) {
  const bySource = new Map(mrs.map((mr) => [mr.source_branch, mr]));
  const parentOf = (mr) => {
    const p = bySource.get(mr.target_branch);
    return p && p.iid !== mr.iid ? p : null;
  };

  const root = (mr) => {
    const seen = new Set([mr.iid]);
    let cur = mr;
    for (let p = parentOf(cur); p && !seen.has(p.iid); p = parentOf(cur)) {
      seen.add(p.iid);
      cur = p;
    }
    return cur;
  };
  const depth = (mr) => {
    const seen = new Set([mr.iid]);
    let d = 0;
    for (let p = parentOf(mr); p && !seen.has(p.iid); p = parentOf(p)) {
      seen.add(p.iid);
      d += 1;
    }
    return d;
  };

  const groups = new Map();
  for (const mr of mrs) {
    const r = root(mr);
    if (!groups.has(r.iid)) groups.set(r.iid, { root: r, members: [] });
    groups.get(r.iid).members.push({ mr, depth: depth(mr) });
  }

  const out = new Map();
  for (const { root: r, members } of groups.values()) {
    members.sort((a, b) => a.depth - b.depth || a.mr.iid - b.mr.iid);
    const layers = members.map(({ mr, depth: d }) => ({ iid: mr.iid, title: mr.title, source_branch: mr.source_branch, depth: d }));
    members.forEach(({ mr, depth: d }, i) => {
      out.set(mr.iid, {
        id: r.source_branch,
        depth: d,
        position: i + 1,
        size: members.length,
        parentIid: parentOf(mr)?.iid ?? null,
        childIids: members.filter((m) => parentOf(m.mr)?.iid === mr.iid).map((m) => m.mr.iid),
        baseBranch: r.target_branch,
        layers,
      });
    });
  }
  return out;
}

// Every layer above `iid`, nearest first, from the map analyzeStacks() returned.
export function layersAbove(stacks, iid) {
  const out = [];
  const seen = new Set([iid]);
  const queue = [...(stacks.get(iid)?.childIids ?? [])];
  while (queue.length) {
    const next = queue.shift();
    if (seen.has(next)) continue;
    seen.add(next);
    out.push(next);
    queue.push(...(stacks.get(next)?.childIids ?? []));
  }
  return out;
}

// Instructions appended to the review run for a layer of a stack.
// `reviewPaths` maps iid -> path of that layer's existing review, when there is one.
export function stackPrompt(mr, info, { reviewPaths = {}, upperRefs = {} } = {}) {
  const lines = [
    `Stack context: this MR (!${mr.iid}) is layer ${info.position} of ${info.size} in a stacked series on ${info.baseBranch}. Each layer targets the branch of the layer below it.`,
    'Layers, bottom to top:',
    ...info.layers.map((l) => {
      const bits = [`${l.iid === mr.iid ? '-> ' : '   '}!${l.iid} "${l.title}" (${l.source_branch})`];
      if (reviewPaths[l.iid]) bits.push(`review: ${reviewPaths[l.iid]}`);
      return bits.join('  ');
    }),
    '',
    'Review this layer with the whole stack in mind:',
    `- Review only this MR's own diff (against ${mr.target_branch}). Code that lower layers introduced is already in the target branch: do not report it here.`,
    '- Lower layers have already been reviewed; read their review files above (if listed) for decisions and open issues before judging this one.',
  ];
  const upper = Object.entries(upperRefs);
  if (upper.length) {
    lines.push(
      '- Before filing an issue as Critical or Important, check whether a later layer settles it. The later layers are fetched locally:',
      ...upper.map(([iid, ref]) => `  - !${iid}: \`git diff HEAD...${ref}\``),
    );
  }
  lines.push(
    '- Add a final `### Across layers` section. One bullet per issue that involves another layer, formatted exactly `- [<kind> !<iid>] <text>`, where !<iid> is the layer concerned and <kind> is one of:',
    '  - `settled-later`: looks wrong here but a later layer fixes or uses it (then it is not a blocker for this layer);',
    '  - `belongs-lower`: the root cause sits in a lower layer (name the file:line there);',
    '  - `assumes-upper`: this layer is only correct if a later layer behaves a given way.',
    '  Write `- None` when no issue crosses layers. Issues listed there must not be repeated under Critical or Important.',
  );
  return lines.join('\n');
}

const CROSS_RE = /^-\s*\[(settled-later|belongs-lower|assumes-upper)\s+!(\d+)\]\s*(.+)$/;

// The `### Across layers` bullets of a review: [{ kind, iid, text }].
export function parseAcrossLayers(md) {
  const out = [];
  let inside = false;
  let fence = false;
  for (const line of md.split('\n')) {
    if (/^```/.test(line)) fence = !fence;
    if (fence) continue;
    if (/^#{2,3}\s/.test(line)) {
      inside = /across layers/i.test(line);
      continue;
    }
    if (!inside) continue;
    const m = line.trim().match(CROSS_RE);
    if (m) out.push({ kind: m[1], iid: Number(m[2]), text: m[3].trim() });
  }
  return out;
}
