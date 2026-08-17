import type { Edge } from "@xyflow/react";
import { describe, expect, it } from "vitest";

import { layoutTree } from "./layout";
import type { FamilyTreeData, Union } from "./types";

/**
 * These assert which relationships are drawn *differently from each other*,
 * not what any particular stroke looks like — the exact dash pattern is a
 * design choice, but "co-parents must not read as a marriage" is a contract.
 */

const UNION_ID = "u";

function familyWith(union: Partial<Union>): FamilyTreeData {
  return {
    people: [
      { id: "a", firstName: "A", lastName: "Test", sex: "other" },
      { id: "b", firstName: "B", lastName: "Test", sex: "other" },
      { id: "c", firstName: "C", lastName: "Test", sex: "other" },
    ],
    unions: [
      {
        id: UNION_ID,
        partnerIds: ["a", "b"],
        childIds: ["c"],
        ...union,
      },
    ],
  };
}

/** Connectors from the partners into the union marker. */
const partnerEdges = (edges: Edge[]) => edges.filter((e) => e.target === UNION_ID);
/** Connectors from the union marker down to the children. */
const childEdges = (edges: Edge[]) => edges.filter((e) => e.source === UNION_ID);

const dashOf = (edge: Edge) => edge.style?.strokeDasharray;

function partnerDash(union: Partial<Union>) {
  const { edges } = layoutTree(familyWith(union));
  const partners = partnerEdges(edges);
  expect(partners.length).toBeGreaterThan(0);
  // Both sides of a couple must be drawn the same way.
  const dashes = new Set(partners.map(dashOf));
  expect(dashes.size).toBe(1);
  return dashes.values().next().value;
}

describe("partner connector styling", () => {
  it("draws a marriage solid", () => {
    expect(partnerDash({ status: "married" })).toBeUndefined();
  });

  it("draws a declared partnership solid", () => {
    expect(partnerDash({ status: "partners" })).toBeUndefined();
  });

  it("draws a divorce non-solid", () => {
    expect(partnerDash({ status: "divorced" })).toBeDefined();
  });

  it("draws status-less co-parents non-solid", () => {
    expect(partnerDash({ status: undefined })).toBeDefined();
  });

  it("does not draw co-parents the same as a divorce", () => {
    expect(partnerDash({ status: undefined })).not.toBe(
      partnerDash({ status: "divorced" }),
    );
  });

  it("does not draw co-parents the same as a marriage", () => {
    expect(partnerDash({ status: undefined })).not.toBe(
      partnerDash({ status: "married" }),
    );
  });

  it("draws a lone parent's connector solid, despite having no status", () => {
    // The trap: a single-parent union is status-less too, but its connector
    // depicts parenthood, not a relationship that was never claimed.
    expect(partnerDash({ partnerIds: ["a"], status: undefined })).toBeUndefined();
  });

  it("emits one connector for a lone parent and two for a couple", () => {
    const lone = layoutTree(familyWith({ partnerIds: ["a"] }));
    const couple = layoutTree(familyWith({ status: "married" }));

    expect(partnerEdges(lone.edges)).toHaveLength(1);
    expect(partnerEdges(couple.edges)).toHaveLength(2);
  });
});

describe("parent-child edges", () => {
  it("stay solid regardless of what the union records", () => {
    for (const union of [
      { status: "married" as const },
      { status: "divorced" as const },
      { status: undefined },
      { partnerIds: ["a"] },
    ]) {
      const { edges } = layoutTree(familyWith(union));
      const children = childEdges(edges);

      expect(children).toHaveLength(1);
      expect(dashOf(children[0])).toBeUndefined();
    }
  });
});

describe("people with no relationships", () => {
  // A standalone person is legitimate domain data, so they must reach the
  // canvas rather than being skipped for belonging to no family.
  const withStandalone = (): FamilyTreeData => {
    const base = familyWith({ status: "married" });
    return {
      people: [
        ...base.people,
        { id: "loner", firstName: "Solo", lastName: "Test", sex: "other" },
      ],
      unions: base.unions,
    };
  };

  it("gives a standalone person a node", () => {
    const { nodes } = layoutTree(withStandalone());

    expect(nodes.map((n) => n.id)).toContain("loner");
  });

  it("does not invent a union for them", () => {
    const { nodes, edges } = layoutTree(withStandalone());

    expect(nodes.filter((n) => n.type === "union")).toHaveLength(1);
    expect(edges.some((e) => e.source === "loner" || e.target === "loner")).toBe(false);
  });

  it("does not stack them on top of anyone", () => {
    const { nodes } = layoutTree(withStandalone());
    const placed = nodes.map((n) => `${n.position.x},${n.position.y}`);

    expect(new Set(placed).size).toBe(placed.length);
  });

  it("lays out a family with no unions at all", () => {
    const { nodes } = layoutTree({
      people: [
        { id: "a", firstName: "A", lastName: "Test", sex: "other" },
        { id: "b", firstName: "B", lastName: "Test", sex: "other" },
      ],
      unions: [],
    });

    expect(nodes).toHaveLength(2);
    expect(nodes[0].position).not.toEqual(nodes[1].position);
  });

  it("keeps a manual position for a standalone person", () => {
    const { nodes } = layoutTree(withStandalone(), { loner: { x: 900, y: 40 } });

    expect(nodes.find((n) => n.id === "loner")?.position).toEqual({ x: 900, y: 40 });
  });
});

describe("layout positions", () => {
  it("does not depend on the union's status", () => {
    const positionsFor = (union: Partial<Union>) =>
      layoutTree(familyWith(union))
        .nodes.map((n) => `${n.id}:${n.position.x},${n.position.y}`)
        .sort();

    expect(positionsFor({ status: undefined })).toEqual(
      positionsFor({ status: "married" }),
    );
    expect(positionsFor({ status: "divorced" })).toEqual(
      positionsFor({ status: "married" }),
    );
  });
});
