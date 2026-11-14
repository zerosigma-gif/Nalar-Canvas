import {
  BoardDocument,
  CanvasEdge,
  CanvasNode,
  ConnectorStyle,
  TemplateId,
} from '../types/canvas';

export function estimateNodeHeight(node: CanvasNode): number {
  const width = Math.max(180, node.width || 248);
  const innerW = Math.max(120, width - 32);
  const titleSize = Math.max(13, node.style.fontSize || 15);
  const charsPerTitleLine = Math.max(12, Math.floor(innerW / (titleSize * 0.56)));
  const titleLines = Math.max(1, Math.ceil((node.title || 'Ide').length / charsPerTitleLine));

  let h = 28 + titleLines * Math.ceil(titleSize * 1.38);

  if (node.body && node.body.trim().length > 0) {
    const bodySize = Math.max(12, titleSize - 2);
    const charsPerBodyLine = Math.max(16, Math.floor(innerW / (bodySize * 0.54)));
    const paragraphs = node.body.split('\n');
    let bodyLines = 0;
    for (const p of paragraphs) {
      bodyLines += Math.max(1, Math.ceil(p.length / charsPerBodyLine));
    }
    h += 8 + bodyLines * Math.ceil(bodySize * 1.45);
  }

  if (node.media?.url) {
    h += 140;
  }

  if (node.table && node.table.columns.length > 0) {
    h += 58 + node.table.rows.length * 30;
  }

  if (node.timestampStamp) {
    h += 30;
  }

  return Math.max(88, h);
}

export function getConnectorStyleForTemplate(templateId: TemplateId): ConnectorStyle {
  switch (templateId) {
    case 'fishbone':
      return 'fishbone';
    case 'tree':
      return 'orthogonal';
    case 'star-bursting':
    case 'lotus-blossom':
      return 'straight';
    case 'mind-mapping':
    default:
      return 'bezier';
  }
}

interface HierarchyGraph {
  nodeMap: Map<string, CanvasNode>;
  childrenMap: Map<string, string[]>;
  roots: string[];
}

function buildHierarchy(nodes: CanvasNode[], edges: CanvasEdge[], templateId: TemplateId): HierarchyGraph {
  const nodeMap = new Map<string, CanvasNode>();
  for (const n of nodes) nodeMap.set(n.id, n);

  const parentOf = new Map<string, string>();
  for (const n of nodes) {
    if (n.parentId && n.parentId !== n.id && nodeMap.has(n.parentId)) {
      parentOf.set(n.id, n.parentId);
    }
  }

  // Infer missing parent relationships from edges (except fishbone where categories point into head)
  if (templateId !== 'fishbone') {
    for (const e of edges) {
      if (
        nodeMap.has(e.sourceId) &&
        nodeMap.has(e.targetId) &&
        e.sourceId !== e.targetId &&
        !parentOf.has(e.targetId) &&
        parentOf.get(e.sourceId) !== e.targetId
      ) {
        parentOf.set(e.targetId, e.sourceId);
      }
    }
  } else {
    // In fishbone, edges might point cat -> head OR parent -> child
    const head = nodes.find((n) => n.kind === 'fishbone-head');
    for (const e of edges) {
      if (!nodeMap.has(e.sourceId) || !nodeMap.has(e.targetId) || e.sourceId === e.targetId) {
        continue;
      }
      if (head && e.targetId === head.id && !parentOf.has(e.sourceId)) {
        parentOf.set(e.sourceId, head.id);
      } else if (!parentOf.has(e.targetId) && e.targetId !== head?.id && parentOf.get(e.sourceId) !== e.targetId) {
        parentOf.set(e.targetId, e.sourceId);
      }
    }
  }

  // Break any accidental cycles
  const safeParentOf = new Map<string, string>();
  for (const [childId, pId] of parentOf.entries()) {
    const seen = new Set<string>([childId]);
    let curr: string | undefined = pId;
    let cycle = false;
    while (curr) {
      if (seen.has(curr)) {
        cycle = true;
        break;
      }
      seen.add(curr);
      curr = parentOf.get(curr);
    }
    if (!cycle) {
      safeParentOf.set(childId, pId);
    }
  }

  const childrenMap = new Map<string, string[]>();
  const roots: string[] = [];

  for (const n of nodes) {
    const pid = safeParentOf.get(n.id);
    if (!pid) {
      roots.push(n.id);
    } else {
      const list = childrenMap.get(pid) ?? [];
      list.push(n.id);
      childrenMap.set(pid, list);
    }
  }

  // Prioritize special core kinds first in roots
  roots.sort((a, b) => {
    const na = nodeMap.get(a)!;
    const nb = nodeMap.get(b)!;
    const isCore = (k: CanvasNode['kind']) =>
      k === 'fishbone-head' || k === 'star-center' || k === 'lotus-core';
    if (isCore(na.kind) && !isCore(nb.kind)) return -1;
    if (!isCore(na.kind) && isCore(nb.kind)) return 1;
    const ka = childrenMap.get(a)?.length ?? 0;
    const kb = childrenMap.get(b)?.length ?? 0;
    return kb - ka;
  });

  return { nodeMap, childrenMap, roots };
}

function layoutMindMapping(graph: HierarchyGraph): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const { nodeMap, childrenMap, roots } = graph;
  if (roots.length === 0) return positions;

  const V_GAP = 34;
  const H_GAP = 86;

  const spanCache = new Map<string, number>();
  const getSpan = (id: string): number => {
    if (spanCache.has(id)) return spanCache.get(id)!;
    const node = nodeMap.get(id)!;
    const selfH = estimateNodeHeight(node);
    const kids = node.collapsed ? [] : childrenMap.get(id) ?? [];
    if (kids.length === 0) {
      spanCache.set(id, selfH);
      return selfH;
    }
    let kidsTotal = 0;
    for (let i = 0; i < kids.length; i++) {
      kidsTotal += getSpan(kids[i]);
      if (i > 0) kidsTotal += V_GAP;
    }
    const span = Math.max(selfH, kidsTotal);
    spanCache.set(id, span);
    return span;
  };

  const placeSubtree = (id: string, x: number, centerY: number, dir: 1 | -1) => {
    const node = nodeMap.get(id)!;
    const selfH = estimateNodeHeight(node);
    positions.set(id, { x: Math.round(x), y: Math.round(centerY - selfH / 2) });

    const kids = node.collapsed ? [] : childrenMap.get(id) ?? [];
    if (kids.length === 0) return;

    let totalKidsSpan = 0;
    for (let i = 0; i < kids.length; i++) {
      totalKidsSpan += getSpan(kids[i]);
      if (i > 0) totalKidsSpan += V_GAP;
    }

    let cursorY = centerY - totalKidsSpan / 2;
    for (const kidId of kids) {
      const kidNode = nodeMap.get(kidId)!;
      const kidSpan = getSpan(kidId);
      const kidCenterY = cursorY + kidSpan / 2;
      const kidX = dir === 1 ? x + node.width + H_GAP : x - kidNode.width - H_GAP;
      placeSubtree(kidId, kidX, kidCenterY, dir);
      cursorY += kidSpan + V_GAP;
    }
  };

  // Primary root uses bilateral radial split; extra disconnected roots stack cleanly below
  const primaryRootId = roots[0];
  const primaryRoot = nodeMap.get(primaryRootId)!;
  const primaryH = estimateNodeHeight(primaryRoot);
  const rootX = -primaryRoot.width / 2;
  const rootCenterY = 0;
  positions.set(primaryRootId, {
    x: Math.round(rootX),
    y: Math.round(rootCenterY - primaryH / 2),
  });

  const primaryKids = primaryRoot.collapsed ? [] : childrenMap.get(primaryRootId) ?? [];
  const rightKids: string[] = [];
  const leftKids: string[] = [];

  primaryKids.forEach((kidId, idx) => {
    if (idx % 2 === 0) rightKids.push(kidId);
    else leftKids.push(kidId);
  });

  const placeSide = (sideIds: string[], dir: 1 | -1) => {
    if (sideIds.length === 0) return;
    let totalSpan = 0;
    for (let i = 0; i < sideIds.length; i++) {
      totalSpan += getSpan(sideIds[i]);
      if (i > 0) totalSpan += V_GAP * 1.25;
    }
    let cy = rootCenterY - totalSpan / 2;
    for (const kidId of sideIds) {
      const kidNode = nodeMap.get(kidId)!;
      const span = getSpan(kidId);
      const kx =
        dir === 1
          ? rootX + primaryRoot.width + H_GAP + 24
          : rootX - kidNode.width - H_GAP - 24;
      placeSubtree(kidId, kx, cy + span / 2, dir);
      cy += span + V_GAP * 1.25;
    }
  };

  placeSide(rightKids, 1);
  placeSide(leftKids, -1);

  // Place disconnected standalone roots cleanly below the primary map
  if (roots.length > 1) {
    let maxBottomY = primaryH / 2;
    for (const [nid, pos] of positions.entries()) {
      const h = estimateNodeHeight(nodeMap.get(nid)!);
      maxBottomY = Math.max(maxBottomY, pos.y + h);
    }
    let extraY = maxBottomY + 90;
    for (let i = 1; i < roots.length; i++) {
      const rId = roots[i];
      const rNode = nodeMap.get(rId)!;
      const rSpan = getSpan(rId);
      placeSubtree(rId, -rNode.width / 2, extraY + rSpan / 2, 1);
      extraY += rSpan + 60;
    }
  }

  return positions;
}

function layoutTreeDiagram(graph: HierarchyGraph): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const { nodeMap, childrenMap, roots } = graph;
  if (roots.length === 0) return positions;

  const H_GAP = 44;
  const V_GAP = 86;

  const widthCache = new Map<string, number>();
  const getSubtreeWidth = (id: string): number => {
    if (widthCache.has(id)) return widthCache.get(id)!;
    const node = nodeMap.get(id)!;
    const kids = node.collapsed ? [] : childrenMap.get(id) ?? [];
    if (kids.length === 0) {
      widthCache.set(id, node.width);
      return node.width;
    }
    let kidsW = 0;
    for (let i = 0; i < kids.length; i++) {
      kidsW += getSubtreeWidth(kids[i]);
      if (i > 0) kidsW += H_GAP;
    }
    const total = Math.max(node.width, kidsW);
    widthCache.set(id, total);
    return total;
  };

  // Compute max height per depth level so rows align cleanly
  const levelHeights = new Map<number, number>();
  const collectLevels = (id: string, depth: number) => {
    const node = nodeMap.get(id)!;
    const h = estimateNodeHeight(node);
    levelHeights.set(depth, Math.max(levelHeights.get(depth) ?? 0, h));
    const kids = node.collapsed ? [] : childrenMap.get(id) ?? [];
    for (const k of kids) collectLevels(k, depth + 1);
  };
  for (const r of roots) collectLevels(r, 0);

  const levelY = new Map<number, number>();
  let accY = -300;
  const maxDepth = Math.max(0, ...Array.from(levelHeights.keys()));
  for (let d = 0; d <= maxDepth; d++) {
    levelY.set(d, accY);
    accY += (levelHeights.get(d) ?? 120) + V_GAP;
  }

  const placeTree = (id: string, centerX: number, depth: number) => {
    const node = nodeMap.get(id)!;
    const y = levelY.get(depth) ?? -300;
    positions.set(id, {
      x: Math.round(centerX - node.width / 2),
      y: Math.round(y),
    });

    const kids = node.collapsed ? [] : childrenMap.get(id) ?? [];
    if (kids.length === 0) return;

    let kidsW = 0;
    for (let i = 0; i < kids.length; i++) {
      kidsW += getSubtreeWidth(kids[i]);
      if (i > 0) kidsW += H_GAP;
    }

    let cursorX = centerX - kidsW / 2;
    for (const kidId of kids) {
      const kw = getSubtreeWidth(kidId);
      placeTree(kidId, cursorX + kw / 2, depth + 1);
      cursorX += kw + H_GAP;
    }
  };

  let totalRootsW = 0;
  for (let i = 0; i < roots.length; i++) {
    totalRootsW += getSubtreeWidth(roots[i]);
    if (i > 0) totalRootsW += H_GAP * 2;
  }

  let rx = -totalRootsW / 2;
  for (const rId of roots) {
    const rw = getSubtreeWidth(rId);
    placeTree(rId, rx + rw / 2, 0);
    rx += rw + H_GAP * 2;
  }

  return positions;
}

function layoutFishbone(graph: HierarchyGraph): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const { nodeMap, childrenMap, roots } = graph;
  if (roots.length === 0) return positions;

  const headId = roots[0];
  const head = nodeMap.get(headId)!;
  const headH = estimateNodeHeight(head);
  const headX = 520;
  const headY = -headH / 2;
  positions.set(headId, { x: Math.round(headX), y: Math.round(headY) });

  const categories = head.collapsed ? [] : childrenMap.get(headId) ?? [];
  const ribSpacingX = 360;

  let topSlot = 0;
  let bottomSlot = 0;

  categories.forEach((catId, idx) => {
    const cat = nodeMap.get(catId)!;
    const catH = estimateNodeHeight(cat);
    const isTop =
      cat.meta?.ribDirection === 'top'
        ? true
        : cat.meta?.ribDirection === 'bottom'
        ? false
        : idx % 2 === 0;

    const slot = isTop ? topSlot++ : bottomSlot++;
    const baseCatX = headX - 420 - slot * ribSpacingX;
    const catY = isTop ? -300 - catH : 220;

    positions.set(catId, { x: Math.round(baseCatX), y: Math.round(catY) });

    // Place sub-causes cleanly staggered along the angled rib toward the spine
    const subCauses = cat.collapsed ? [] : childrenMap.get(catId) ?? [];
    let subOffsetY = isTop ? catY + catH + 34 : catY - 34;

    subCauses.forEach((subId, sIdx) => {
      const sub = nodeMap.get(subId)!;
      const subH = estimateNodeHeight(sub);
      const subX = baseCatX - 180 - sIdx * 36;
      const sy = isTop ? subOffsetY : subOffsetY - subH;
      positions.set(subId, { x: Math.round(subX), y: Math.round(sy) });
      subOffsetY = isTop ? sy + subH + 26 : sy - 26;

      // Any deeper grandchildren step cleanly left
      const grandKids = sub.collapsed ? [] : childrenMap.get(subId) ?? [];
      grandKids.forEach((gkId, gIdx) => {
        const gk = nodeMap.get(gkId)!;
        positions.set(gkId, {
          x: Math.round(subX - gk.width - 42),
          y: Math.round(sy + gIdx * (estimateNodeHeight(gk) + 20)),
        });
      });
    });
  });

  // Any extra disconnected nodes placed neatly below the fishbone
  if (roots.length > 1) {
    let extraX = -480;
    for (let i = 1; i < roots.length; i++) {
      const r = nodeMap.get(roots[i])!;
      positions.set(r.id, { x: Math.round(extraX), y: 440 });
      extraX += r.width + 40;
    }
  }

  return positions;
}

function layoutStarBursting(graph: HierarchyGraph): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const { nodeMap, childrenMap, roots } = graph;
  if (roots.length === 0) return positions;

  const centerId = roots[0];
  const center = nodeMap.get(centerId)!;
  const centerH = estimateNodeHeight(center);
  positions.set(centerId, {
    x: Math.round(-center.width / 2),
    y: Math.round(-centerH / 2),
  });

  const spokes = center.collapsed ? [] : childrenMap.get(centerId) ?? [];
  const count = spokes.length;
  const radiusX = Math.max(410, count * 68);
  const radiusY = Math.max(290, count * 48);

  spokes.forEach((spokeId, i) => {
    const spoke = nodeMap.get(spokeId)!;
    const spokeH = estimateNodeHeight(spoke);
    // Start at -90 deg (top) and distribute clockwise
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(1, count);
    const sx = Math.cos(angle) * radiusX - spoke.width / 2;
    const sy = Math.sin(angle) * radiusY - spokeH / 2;
    positions.set(spokeId, { x: Math.round(sx), y: Math.round(sy) });

    // Fan out child questions radially beyond the spoke
    const subQuestions = spoke.collapsed ? [] : childrenMap.get(spokeId) ?? [];
    const subCount = subQuestions.length;
    subQuestions.forEach((subId, j) => {
      const sub = nodeMap.get(subId)!;
      const subH = estimateNodeHeight(sub);
      const spread = subCount > 1 ? (j - (subCount - 1) / 2) * 0.36 : 0;
      const subAngle = angle + spread;
      const subRadiusX = radiusX + 320;
      const subRadiusY = radiusY + 220;
      positions.set(subId, {
        x: Math.round(Math.cos(subAngle) * subRadiusX - sub.width / 2),
        y: Math.round(Math.sin(subAngle) * subRadiusY - subH / 2),
      });
    });
  });

  // Disconnected roots placed below
  if (roots.length > 1) {
    let extraX = -400;
    for (let i = 1; i < roots.length; i++) {
      const r = nodeMap.get(roots[i])!;
      positions.set(r.id, { x: Math.round(extraX), y: Math.round(radiusY + 260) });
      extraX += r.width + 40;
    }
  }

  return positions;
}

function layoutLotusBlossom(graph: HierarchyGraph): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const { nodeMap, childrenMap, roots } = graph;
  if (roots.length === 0) return positions;

  const coreId = roots[0];
  const core = nodeMap.get(coreId)!;
  const coreH = estimateNodeHeight(core);
  positions.set(coreId, {
    x: Math.round(-core.width / 2),
    y: Math.round(-coreH / 2),
  });

  // Classic 3x3 Lotus surrounding slots (NW, N, NE, W, E, SW, S, SE)
  const slots: { dx: number; dy: number; dirX: number; dirY: number }[] = [
    { dx: -370, dy: -260, dirX: -1, dirY: -1 },
    { dx: 0, dy: -280, dirX: 0, dirY: -1 },
    { dx: 370, dy: -260, dirX: 1, dirY: -1 },
    { dx: -400, dy: 0, dirX: -1, dirY: 0 },
    { dx: 400, dy: 0, dirX: 1, dirY: 0 },
    { dx: -370, dy: 260, dirX: -1, dirY: 1 },
    { dx: 0, dy: 280, dirX: 0, dirY: 1 },
    { dx: 370, dy: 260, dirX: 1, dirY: 1 },
  ];

  const themes = core.collapsed ? [] : childrenMap.get(coreId) ?? [];

  themes.forEach((themeId, idx) => {
    const theme = nodeMap.get(themeId)!;
    const themeH = estimateNodeHeight(theme);

    let centerX = 0;
    let centerY = 0;
    let outX = 0;
    let outY = 0;

    if (idx < slots.length) {
      centerX = slots[idx].dx;
      centerY = slots[idx].dy;
      outX = slots[idx].dirX;
      outY = slots[idx].dirY;
    } else {
      const extraAngle = ((idx - slots.length) * Math.PI) / 4;
      centerX = Math.cos(extraAngle) * 620;
      centerY = Math.sin(extraAngle) * 440;
      outX = Math.cos(extraAngle);
      outY = Math.sin(extraAngle);
    }

    positions.set(themeId, {
      x: Math.round(centerX - theme.width / 2),
      y: Math.round(centerY - themeH / 2),
    });

    // Sub-petals expand outward cleanly in their sector
    const petals = theme.collapsed ? [] : childrenMap.get(themeId) ?? [];
    petals.forEach((petalId, pIdx) => {
      const petal = nodeMap.get(petalId)!;
      const petalH = estimateNodeHeight(petal);
      const stepX = outX !== 0 ? outX * (theme.width + 65) : (pIdx - (petals.length - 1) / 2) * (petal.width + 32);
      const stepY =
        outY !== 0
          ? outY * (150 + pIdx * (petalH + 24))
          : (pIdx - (petals.length - 1) / 2) * (petalH + 28);

      positions.set(petalId, {
        x: Math.round(centerX + stepX - petal.width / 2),
        y: Math.round(centerY + stepY - petalH / 2),
      });
    });
  });

  if (roots.length > 1) {
    let extraX = -420;
    for (let i = 1; i < roots.length; i++) {
      const r = nodeMap.get(roots[i])!;
      positions.set(r.id, { x: Math.round(extraX), y: 560 });
      extraX += r.width + 40;
    }
  }

  return positions;
}

export function organizeBoardByTemplate(
  doc: BoardDocument,
  targetTemplateId?: TemplateId
): BoardDocument {
  const activeTemplate = targetTemplateId ?? doc.templateId;
  const graph = buildHierarchy(doc.nodes, doc.edges, activeTemplate);

  let positions: Map<string, { x: number; y: number }>;
  switch (activeTemplate) {
    case 'fishbone':
      positions = layoutFishbone(graph);
      break;
    case 'tree':
      positions = layoutTreeDiagram(graph);
      break;
    case 'star-bursting':
      positions = layoutStarBursting(graph);
      break;
    case 'lotus-blossom':
      positions = layoutLotusBlossom(graph);
      break;
    case 'mind-mapping':
    default:
      positions = layoutMindMapping(graph);
      break;
  }

  const connectorStyle = getConnectorStyleForTemplate(activeTemplate);

  const nextNodes = doc.nodes.map((n) => {
    const pos = positions.get(n.id);
    return pos ? { ...n, x: pos.x, y: pos.y } : n;
  });

  const nextEdges = doc.edges.map((e) => ({
    ...e,
    style: connectorStyle,
  }));

  return {
    ...doc,
    templateId: activeTemplate,
    nodes: nextNodes,
    edges: nextEdges,
    updatedAt: Date.now(),
  };
}
