import { describe, expect, it } from "vitest";

import { seedData } from "./seed";
import type { FamilyTreeData } from "./types";
import {
  branchOf,
  collapseAllBranches,
  collapseInfoFor,
  descendantIds,
  hasDescendants,
  hiddenPeopleIds,
  revealPathTo,
  visibleFamily,
} from "./visibility";

/**
 * Seed shape, for reference:
 *   p1 Eleanor + p2 Walter        → p3 Margaret, p5 Thomas, p7 Linda
 *   p4 David   + p3 Margaret      → p8 Amara, p9 Ben
 *   p5 Thomas  + p6 Susan (div.)  → p11 Nathan
 *   p7 Linda   (single parent)    → p13 Grace
 *   p9 Ben     + p10 Chloe        → p14 Isla, p15 Theo
 *   p11 Nathan + p12 Priya        → p16 Maya
 */

const collapse = (...ids: string[]) => new Set(ids);
const visibleIds = (family: FamilyTreeData, collapsed: Set<string>) =>
  new Set(visibleFamily(family, collapsed).people.map((p) => p.id));

/** The seed plus an unrelated pair and a person with no relationships at all. */
function seedPlusOutsiders(): FamilyTreeData {
  return {
    people: [
      ...seedData.people,
      { id: "o1", firstName: "Otto", lastName: "Other", sex: "other" },
      { id: "o2", firstName: "Ora", lastName: "Other", sex: "other" },
      { id: "o3", firstName: "Kid", lastName: "Other", sex: "other" },
      { id: "solo", firstName: "Solo", lastName: "Alone", sex: "other" },
    ],
    unions: [
      ...seedData.unions,
      { id: "uo", partnerIds: ["o1", "o2"], childIds: ["o3"], status: "married" },
    ],
  };
}

describe("descendants", () => {
  it("follows parent-child links across generations", () => {
    expect(descendantIds(seedData, "p3")).toEqual(
      new Set(["p8", "p9", "p14", "p15"]),
    );
  });

  it("excludes the person themselves", () => {
    expect(descendantIds(seedData, "p3").has("p3")).toBe(false);
  });

  it("reaches every generation from the top", () => {
    expect(descendantIds(seedData, "p1").size).toBe(10);
  });

  it("is empty for someone with no children", () => {
    expect(descendantIds(seedData, "p14")).toEqual(new Set());
    expect(hasDescendants(seedData, "p14")).toBe(false);
  });
});

describe("collapsing a branch", () => {
  it("hides the descendants but keeps the person", () => {
    const visible = visibleIds(seedData, collapse("p3"));

    expect(visible.has("p3")).toBe(true);
    expect(visible.has("p8")).toBe(false);
    expect(visible.has("p9")).toBe(false);
    expect(visible.has("p14")).toBe(false);
    expect(visible.has("p15")).toBe(false);
  });

  it("keeps ancestors visible", () => {
    const visible = visibleIds(seedData, collapse("p3"));

    expect(visible.has("p1")).toBe(true);
    expect(visible.has("p2")).toBe(true);
  });

  it("keeps siblings visible", () => {
    const visible = visibleIds(seedData, collapse("p3"));

    expect(visible.has("p5")).toBe(true);
    expect(visible.has("p7")).toBe(true);
  });

  it("keeps the collapsed person's own partner visible", () => {
    // David married in; his children are hidden but he is not a descendant.
    expect(visibleIds(seedData, collapse("p3")).has("p4")).toBe(true);
  });

  it("keeps the matriarch's spouse visible when she collapses", () => {
    const visible = visibleIds(seedData, collapse("p1"));

    expect(visible.has("p1")).toBe(true);
    expect(visible.has("p2")).toBe(true);
    expect(visible.size).toBe(2);
  });

  it("does not mutate the family document", () => {
    const before = structuredClone(seedData);

    visibleFamily(seedData, collapse("p1"));
    hiddenPeopleIds(seedData, collapse("p3"));
    branchOf(seedData, "p3");

    expect(seedData).toEqual(before);
  });

  it("returns the document untouched when nothing is collapsed", () => {
    expect(visibleFamily(seedData, new Set())).toBe(seedData);
  });
});

describe("partners of hidden descendants", () => {
  it("hides a spouse who married into the hidden branch", () => {
    // Chloe's only relations are Ben and their children, all hidden with p3.
    expect(visibleIds(seedData, collapse("p3")).has("p10")).toBe(false);
  });

  it("keeps a spouse who has family of their own outside the branch", () => {
    // Susan is Thomas's partner. Collapsing Thomas hides Nathan and Maya, but
    // Susan still has a visible partner, so she stays.
    const visible = visibleIds(seedData, collapse("p5"));

    expect(visible.has("p6")).toBe(true);
    expect(visible.has("p11")).toBe(false);
    expect(visible.has("p16")).toBe(false);
  });

  it("hides the spouse of a hidden grandchild", () => {
    // Priya married in through Nathan, who is hidden when Thomas collapses.
    expect(visibleIds(seedData, collapse("p5")).has("p12")).toBe(false);
  });

  it("never hides a married-in spouse's own parents", () => {
    const family = seedPlusOutsiders();
    // o3 marries into the Hart line by partnering hidden Amara (p8).
    family.unions.push({ id: "ux", partnerIds: ["p8", "o3"], childIds: [] });

    const visible = visibleIds(family, collapse("p3"));

    expect(visible.has("p8")).toBe(false);
    // o3 has visible parents, so they keep their place...
    expect(visible.has("o3")).toBe(true);
    // ...and their parents are certainly not dragged down.
    expect(visible.has("o1")).toBe(true);
    expect(visible.has("o2")).toBe(true);
  });
});

describe("single parents", () => {
  it("hides the child of a lone parent", () => {
    const visible = visibleIds(seedData, collapse("p7"));

    expect(visible.has("p7")).toBe(true);
    expect(visible.has("p13")).toBe(false);
  });

  it("drops the lone parent's union so no connector dangles", () => {
    const projection = visibleFamily(seedData, collapse("p7"));

    expect(projection.unions.some((u) => u.id === "u4")).toBe(false);
  });

  it("keeps a childless marriage marker when its children are hidden", () => {
    const projection = visibleFamily(seedData, collapse("p3"));
    const marriage = projection.unions.find((u) => u.id === "u2");

    expect(marriage).toBeDefined();
    expect(marriage?.childIds).toEqual([]);
  });

  it("drops unions whose partners are not all visible", () => {
    const projection = visibleFamily(seedData, collapse("p3"));

    // Ben + Chloe are both hidden, so their union goes with them.
    expect(projection.unions.some((u) => u.id === "u5")).toBe(false);
  });
});

describe("divorced branches", () => {
  it("collapses through a divorced union like any other", () => {
    const visible = visibleIds(seedData, collapse("p5"));

    expect(visible.has("p11")).toBe(false);
    expect(visible.has("p16")).toBe(false);
  });

  it("keeps the divorce marker between two visible former partners", () => {
    const projection = visibleFamily(seedData, collapse("p5"));
    const divorce = projection.unions.find((u) => u.id === "u3");

    expect(divorce?.status).toBe("divorced");
    expect(divorce?.childIds).toEqual([]);
  });
});

describe("unrelated components", () => {
  it("leaves another family untouched", () => {
    const family = seedPlusOutsiders();
    const visible = visibleIds(family, collapse("p1"));

    expect(visible.has("o1")).toBe(true);
    expect(visible.has("o2")).toBe(true);
    expect(visible.has("o3")).toBe(true);
  });

  it("never hides a person with no relationships", () => {
    const family = seedPlusOutsiders();

    expect(visibleIds(family, collapse("p1")).has("solo")).toBe(true);
    expect(visibleIds(family, collapse("o1")).has("solo")).toBe(true);
  });

  it("collapsing one component does not touch the other", () => {
    const family = seedPlusOutsiders();
    const visible = visibleIds(family, collapse("o1"));

    expect(visible.has("o3")).toBe(false);
    expect(visible.has("p8")).toBe(true);
    expect(visible.has("p14")).toBe(true);
  });
});

describe("hidden counts", () => {
  it("counts unique people, not nodes or union markers", () => {
    // Amara, Ben, Isla, Theo, plus Chloe who married in: five people.
    expect(collapseInfoFor(seedData, collapse("p3"), "p3").hiddenCount).toBe(5);
  });

  it("counts a lone parent's single child once", () => {
    expect(collapseInfoFor(seedData, collapse("p7"), "p7").hiddenCount).toBe(1);
  });

  it("matches what actually disappears", () => {
    const before = seedData.people.length;
    const after = visibleFamily(seedData, collapse("p3")).people.length;

    expect(before - after).toBe(
      collapseInfoFor(seedData, collapse("p3"), "p3").hiddenCount,
    );
  });

  it("offers no control to someone without descendants", () => {
    expect(collapseInfoFor(seedData, new Set(), "p14").canCollapse).toBe(false);
    expect(collapseInfoFor(seedData, new Set(), "p3").canCollapse).toBe(true);
  });

  it("reports whether this particular person is collapsed", () => {
    expect(collapseInfoFor(seedData, collapse("p3"), "p3").collapsed).toBe(true);
    expect(collapseInfoFor(seedData, collapse("p3"), "p5").collapsed).toBe(false);
  });
});

describe("nested collapse", () => {
  it("keeps an inner branch collapsed after the outer one reopens", () => {
    // Ben (p9) is collapsed, then his ancestor Margaret (p3) as well.
    const both = collapse("p9", "p3");
    expect(visibleIds(seedData, both).has("p8")).toBe(false);

    // Re-expanding Margaret alone leaves Ben's own state intact.
    const reopened = new Set(both);
    reopened.delete("p3");
    const visible = visibleIds(seedData, reopened);

    expect(visible.has("p8")).toBe(true); // Amara is back
    expect(visible.has("p9")).toBe(true); // so is Ben
    expect(visible.has("p14")).toBe(false); // but his children stay folded
    expect(visible.has("p15")).toBe(false);
  });

  it("does not collapse into a single global flag", () => {
    const inner = visibleIds(seedData, collapse("p9"));
    const outer = visibleIds(seedData, collapse("p3"));

    expect(inner).not.toEqual(outer);
    expect(inner.has("p9")).toBe(true);
    expect(outer.has("p9")).toBe(false);
  });

  it("expanding everything restores every person", () => {
    expect(visibleFamily(seedData, new Set()).people).toHaveLength(
      seedData.people.length,
    );
  });
});

describe("revealPathTo", () => {
  it("opens the branch hiding a person", () => {
    const revealed = revealPathTo(seedData, collapse("p3"), "p14");

    expect(revealed.has("p3")).toBe(false);
    expect(visibleIds(seedData, revealed).has("p14")).toBe(true);
  });

  it("opens every branch responsible, not just the nearest", () => {
    const revealed = revealPathTo(seedData, collapse("p1", "p3", "p9"), "p14");

    expect(visibleIds(seedData, revealed).has("p14")).toBe(true);
  });

  it("leaves unrelated collapsed branches folded", () => {
    const revealed = revealPathTo(seedData, collapse("p3", "p5"), "p14");

    expect(revealed.has("p5")).toBe(true);
    expect(visibleIds(seedData, revealed).has("p11")).toBe(false);
  });

  it("reaches a spouse hidden only because they married in", () => {
    const revealed = revealPathTo(seedData, collapse("p3"), "p10");

    expect(visibleIds(seedData, revealed).has("p10")).toBe(true);
  });

  it("is a no-op for someone already visible", () => {
    const collapsed = collapse("p3");

    expect(revealPathTo(seedData, collapsed, "p5")).toEqual(collapsed);
  });
});

describe("collapse all / expand all", () => {
  it("keeps the oldest generation on screen", () => {
    const visible = visibleIds(seedData, collapseAllBranches(seedData));

    expect(visible.has("p1")).toBe(true);
    expect(visible.has("p2")).toBe(true);
  });

  it("folds the branches below them", () => {
    const visible = visibleIds(seedData, collapseAllBranches(seedData));

    expect(visible.has("p8")).toBe(false);
    expect(visible.has("p14")).toBe(false);
    expect(visible.has("p16")).toBe(false);
  });

  it("does not hide people indiscriminately", () => {
    const visible = visibleIds(seedData, collapseAllBranches(seedData));

    // The founding couple, their three children, and the two spouses who
    // remain attached to visible people.
    expect(visible.size).toBeGreaterThan(2);
    expect(visible.size).toBeLessThan(seedData.people.length);
    expect(visible.has("p3")).toBe(true);
    expect(visible.has("p5")).toBe(true);
    expect(visible.has("p7")).toBe(true);
  });

  it("leaves standalone people alone", () => {
    const family = seedPlusOutsiders();

    expect(visibleIds(family, collapseAllBranches(family)).has("solo")).toBe(true);
  });

  it("falls back to the roots when no one below them has children", () => {
    const shallow: FamilyTreeData = {
      people: [
        { id: "a", firstName: "A", lastName: "T", sex: "other" },
        { id: "b", firstName: "B", lastName: "T", sex: "other" },
      ],
      unions: [{ id: "u", partnerIds: ["a"], childIds: ["b"] }],
    };

    const collapsed = collapseAllBranches(shallow);

    expect(collapsed.has("a")).toBe(true);
    expect(visibleIds(shallow, collapsed)).toEqual(new Set(["a"]));
  });

  it("expand all clears every branch", () => {
    const expanded = new Set<string>();

    expect(visibleIds(seedData, expanded).size).toBe(seedData.people.length);
  });
});
