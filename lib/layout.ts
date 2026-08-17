import type { Edge, Node } from "@xyflow/react";
import type { CSSProperties } from "react";
import type { FamilyTreeData, Person, PositionOverrides, Union } from "./types";

export const NODE_WIDTH = 184;
export const NODE_HEIGHT = 88;
export const UNION_SIZE = 14;

/** Horizontal gap between two partners — the union marker sits in it. */
const SPOUSE_GAP = 76;
/** Horizontal gap between sibling family blocks. */
const SIBLING_GAP = 40;
/** Vertical gap between generations. */
const GENERATION_GAP = 116;
/** Drop below a lone parent for their union marker. */
const SINGLE_PARENT_DROP = 30;

export interface PersonNodeData extends Record<string, unknown> {
  person: Person;
}

export interface UnionNodeData extends Record<string, unknown> {
  union: Union;
}

export type PersonFlowNode = Node<PersonNodeData, "person">;
export type UnionFlowNode = Node<UnionNodeData, "union">;
export type FamilyFlowNode = PersonFlowNode | UnionFlowNode;

interface Placement {
  left: number;
  right: number;
  /** Everyone positioned in this subtree, so it can be shifted as a unit. */
  ids: string[];
  /** Deepest generation this subtree reaches. */
  maxDepth: number;
}

interface Index {
  peopleById: Map<string, Person>;
  unionsByPartner: Map<string, Union[]>;
  parentUnionByChild: Map<string, Union>;
}

function indexTree(data: FamilyTreeData): Index {
  const peopleById = new Map(data.people.map((p) => [p.id, p]));
  const unionsByPartner = new Map<string, Union[]>();
  const parentUnionByChild = new Map<string, Union>();

  for (const union of data.unions) {
    for (const partnerId of union.partnerIds) {
      if (!peopleById.has(partnerId)) continue;
      const existing = unionsByPartner.get(partnerId);
      if (existing) existing.push(union);
      else unionsByPartner.set(partnerId, [union]);
    }
    // A person descends from one union; later ones are ignored rather than
    // silently reparenting them mid-layout.
    for (const childId of union.childIds) {
      if (!peopleById.has(childId)) continue;
      if (!parentUnionByChild.has(childId)) parentUnionByChild.set(childId, union);
    }
  }

  return { peopleById, unionsByPartner, parentUnionByChild };
}

function rowWidth(members: number): number {
  return members * NODE_WIDTH + (members - 1) * SPOUSE_GAP;
}

/**
 * Assigns every person an (x, y) by walking down from the oldest generation:
 * children are placed first, then the couple above them is centred over the
 * block they occupy. Rows never overlap because each depth tracks its own
 * left-to-right cursor, and a centred couple is pushed right if it would
 * collide with what is already on its row.
 */
function autoPositions(data: FamilyTreeData, index: Index): Map<string, { x: number; y: number }> {
  const { peopleById, unionsByPartner, parentUnionByChild } = index;
  const positions = new Map<string, { x: number; y: number }>();
  const visited = new Set<string>();
  const cursorByDepth: number[] = [];

  function place(personId: string, depth: number): Placement | null {
    if (visited.has(personId) || !peopleById.has(personId)) return null;
    visited.add(personId);

    const ownUnions = unionsByPartner.get(personId) ?? [];

    const spouseIds: string[] = [];
    for (const union of ownUnions) {
      for (const partnerId of union.partnerIds) {
        if (partnerId === personId) continue;
        if (visited.has(partnerId) || !peopleById.has(partnerId)) continue;
        visited.add(partnerId);
        spouseIds.push(partnerId);
      }
    }

    // With more than one partner, seat this person between them so each couple
    // stays adjacent and its union marker lands in the gap.
    const row =
      spouseIds.length > 1
        ? [spouseIds[0], personId, ...spouseIds.slice(1)]
        : [personId, ...spouseIds];

    const childPlacements: Placement[] = [];
    for (const union of ownUnions) {
      for (const childId of union.childIds) {
        const placement = place(childId, depth + 1);
        if (placement) childPlacements.push(placement);
      }
    }

    const width = rowWidth(row.length);
    const cursor = cursorByDepth[depth] ?? 0;
    let left = cursor;
    const descendantIds: string[] = [];
    let maxDepth = depth;

    if (childPlacements.length > 0) {
      let childLeft = Infinity;
      let childRight = -Infinity;
      for (const placement of childPlacements) {
        if (placement.left < childLeft) childLeft = placement.left;
        if (placement.right > childRight) childRight = placement.right;
        if (placement.maxDepth > maxDepth) maxDepth = placement.maxDepth;
        descendantIds.push(...placement.ids);
      }

      const centred = (childLeft + childRight) / 2 - width / 2;
      left = Math.max(cursor, centred);

      // If this row had to move right to clear what is already on its
      // generation, carry the whole subtree along so the children stay centred
      // underneath rather than trailing off to the left.
      const shift = left - centred;
      if (shift > 0) {
        for (const id of descendantIds) {
          const position = positions.get(id);
          if (position) positions.set(id, { x: position.x + shift, y: position.y });
        }
        for (let d = depth + 1; d <= maxDepth; d++) {
          cursorByDepth[d] = (cursorByDepth[d] ?? 0) + shift;
        }
      }
    }

    cursorByDepth[depth] = left + width + SIBLING_GAP;

    const y = depth * (NODE_HEIGHT + GENERATION_GAP);
    row.forEach((id, i) => {
      positions.set(id, { x: left + i * (NODE_WIDTH + SPOUSE_GAP), y });
    });

    return {
      left,
      right: left + width,
      ids: [...row, ...descendantIds],
      maxDepth,
    };
  }

  // Start from couples where neither partner descends from anyone in the tree.
  // A spouse who married in has no parent union either, so they are only a root
  // if their partner is also unattached — otherwise they get pulled to the
  // correct depth when their partner is placed.
  const isTrueRoot = (person: Person) => {
    if (parentUnionByChild.has(person.id)) return false;
    const unions = unionsByPartner.get(person.id) ?? [];
    return unions.every((union) =>
      union.partnerIds.every((id) => id === person.id || !parentUnionByChild.has(id)),
    );
  };

  for (const person of data.people) {
    if (isTrueRoot(person)) place(person.id, 0);
  }
  // Anything still unplaced (a detached branch, or a cycle in the data) is
  // parked on the top row rather than dropped from the render.
  for (const person of data.people) {
    if (!visited.has(person.id)) place(person.id, 0);
  }

  return positions;
}

/** Where a union's marker sits, given the final positions of its partners. */
function unionPosition(
  union: Union,
  positionOf: (id: string) => { x: number; y: number } | undefined,
): { x: number; y: number } | null {
  const partners = union.partnerIds
    .map((id) => positionOf(id))
    .filter((p): p is { x: number; y: number } => p !== undefined);

  if (partners.length === 0) return null;

  if (partners.length === 1) {
    const [only] = partners;
    return {
      x: only.x + NODE_WIDTH / 2 - UNION_SIZE / 2,
      y: only.y + NODE_HEIGHT + SINGLE_PARENT_DROP,
    };
  }

  const [a, b] = partners;
  return {
    x: (a.x + b.x) / 2 + NODE_WIDTH / 2 - UNION_SIZE / 2,
    y: (a.y + b.y) / 2 + NODE_HEIGHT / 2 - UNION_SIZE / 2,
  };
}

/**
 * How the connectors into a union's marker are drawn, so the canvas claims the
 * same thing the details panel does:
 * - solid for a declared relationship, current or former-by-marriage;
 * - dashed for a divorce;
 * - dotted for two partners with no status, who are known co-parents and
 *   nothing more — that must not read as a partnership;
 * - solid for a lone parent, whose single connector depicts parenthood rather
 *   than any relationship.
 *
 * Only partner connectors use this. Parent-child edges are left alone.
 */
function partnerEdgeStyle(
  union: Union,
  partnerCount: number,
): CSSProperties | undefined {
  if (union.status === "divorced") return { strokeDasharray: "5 4" };
  if (partnerCount >= 2 && union.status === undefined) {
    return { strokeDasharray: "1 5", strokeLinecap: "round" };
  }
  return undefined;
}

export interface LayoutResult {
  nodes: FamilyFlowNode[];
  edges: Edge[];
}

/**
 * Turns family data into React Flow nodes and edges. `overrides` holds positions
 * the user has dragged; union markers are recomputed from the resulting partner
 * positions so marriage links stay attached while dragging.
 */
export function layoutTree(
  data: FamilyTreeData,
  overrides: PositionOverrides = {},
): LayoutResult {
  const index = indexTree(data);
  const auto = autoPositions(data, index);

  const positionOf = (id: string) => overrides[id] ?? auto.get(id);

  const nodes: FamilyFlowNode[] = [];
  const edges: Edge[] = [];

  for (const person of data.people) {
    const position = positionOf(person.id);
    if (!position) continue;
    nodes.push({
      id: person.id,
      type: "person",
      position,
      data: { person },
    });
  }

  for (const union of data.unions) {
    const position = overrides[union.id] ?? unionPosition(union, positionOf);
    if (!position) continue;

    nodes.push({
      id: union.id,
      type: "union",
      position,
      data: { union },
      draggable: false,
      selectable: false,
    });

    const partners = union.partnerIds
      .filter((id) => positionOf(id) !== undefined)
      .sort((a, b) => positionOf(a)!.x - positionOf(b)!.x);

    const partnerStyle = partnerEdgeStyle(union, partners.length);

    if (partners.length === 1) {
      edges.push({
        id: `${union.id}-${partners[0]}`,
        source: partners[0],
        sourceHandle: "bottom",
        target: union.id,
        targetHandle: "top",
        type: "smoothstep",
        style: partnerStyle,
      });
    } else if (partners.length >= 2) {
      const [leftId, rightId] = partners;
      edges.push(
        {
          id: `${union.id}-${leftId}`,
          source: leftId,
          sourceHandle: "right",
          target: union.id,
          targetHandle: "left",
          type: "straight",
          style: partnerStyle,
        },
        {
          id: `${union.id}-${rightId}`,
          source: rightId,
          sourceHandle: "left",
          target: union.id,
          targetHandle: "right",
          type: "straight",
          style: partnerStyle,
        },
      );
    }

    for (const childId of union.childIds) {
      if (!positionOf(childId)) continue;
      edges.push({
        id: `${union.id}->${childId}`,
        source: union.id,
        sourceHandle: "bottom",
        target: childId,
        targetHandle: "top",
        type: "smoothstep",
      });
    }
  }

  return { nodes, edges };
}

/**
 * Re-derives union marker positions from wherever the person nodes currently
 * are. Called while dragging so marriage links stay attached to their couple.
 */
export function repositionUnions(nodes: FamilyFlowNode[]): FamilyFlowNode[] {
  const personPositions = new Map<string, { x: number; y: number }>();
  for (const node of nodes) {
    if (node.type === "person") personPositions.set(node.id, node.position);
  }

  return nodes.map((node) => {
    if (node.type !== "union") return node;
    const next = unionPosition(node.data.union, (id) => personPositions.get(id));
    if (!next || (next.x === node.position.x && next.y === node.position.y)) {
      return node;
    }
    return { ...node, position: next };
  });
}
