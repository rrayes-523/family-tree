import { describe, expect, it } from "vitest";

import { FamilyDataError, parentUnionOf } from "./family-operations";
import { seedData } from "./seed";
import {
  addChildTo,
  addParentTo,
  addPartnerTo,
  canAddParent,
  childCandidates,
  otherParentOptions,
  parentCandidates,
  partnerCandidates,
  searchPeople,
} from "./relationship-actions";
import type { FamilyTreeData, PersonDraft } from "./types";

/**
 * Seed shape, for reference:
 *   p1 Eleanor + p2 Walter        → p3 Margaret, p5 Thomas, p7 Linda
 *   p4 David   + p3 Margaret      → p8 Amara, p9 Ben
 *   p5 Thomas  + p6 Susan (div.)  → p11 Nathan
 *   p7 Linda   (single parent)    → p13 Grace
 *   p9 Ben     + p10 Chloe        → p14 Isla, p15 Theo
 *   p11 Nathan + p12 Priya        → p16 Maya
 */

const newPerson = (firstName: string, over: Partial<PersonDraft> = {}) =>
  ({ kind: "new", draft: { firstName, lastName: "New", sex: "other", ...over } }) as const;
const existing = (personId: string) => ({ kind: "existing", personId }) as const;

const ids = (people: { id: string }[]) => people.map((p) => p.id);

describe("atomic creation", () => {
  it("creates the person and the relationship in one result", () => {
    const { data, personId } = addParentTo(seedData, "p1", newPerson("Nan"));

    expect(data.people).toHaveLength(seedData.people.length + 1);
    expect(parentUnionOf(data, "p1")?.partnerIds).toEqual([personId]);
  });

  it("leaves no orphan behind when the relationship is rejected", () => {
    // p14 is a great-grandchild of p1, so making them p1's parent is a cycle.
    expect(() => addParentTo(seedData, "p14", existing("p15"))).toThrow();

    // A rejected *new* person must not survive either.
    let thrown: unknown;
    try {
      // Amara already has two parents, so this cannot succeed.
      addParentTo(seedData, "p8", newPerson("Ghost"));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(FamilyDataError);
    expect(seedData.people.some((p) => p.firstName === "Ghost")).toBe(false);
  });

  it("does not mutate the family it was given", () => {
    const before = structuredClone(seedData);

    addPartnerTo(seedData, "p13", newPerson("Sam"), "married");
    addChildTo(seedData, "p13", newPerson("Kid"));

    expect(seedData).toEqual(before);
  });

  it("connects an existing person without duplicating them", () => {
    const { data, personId } = addPartnerTo(seedData, "p13", existing("p8"), "partners");

    expect(personId).toBe("p8");
    expect(data.people).toHaveLength(seedData.people.length);
  });
});

describe("addParentTo", () => {
  it("records a first parent as a single-parent union", () => {
    const { data, personId } = addParentTo(seedData, "p1", newPerson("Nan"));
    const union = parentUnionOf(data, "p1");

    expect(union?.partnerIds).toEqual([personId]);
    expect(union?.status).toBeUndefined();
  });

  it("joins the second parent to the same union without inventing a marriage", () => {
    const first = addParentTo(seedData, "p1", newPerson("Nan"));
    const second = addParentTo(first.data, "p1", newPerson("Pop"));
    const union = parentUnionOf(second.data, "p1");

    expect(union?.partnerIds).toHaveLength(2);
    expect(union?.status).toBeUndefined();
    expect(second.data.unions).toHaveLength(seedData.unions.length + 1);
  });

  it("surfaces a readable error for self-parenting", () => {
    expect(() => addParentTo(seedData, "p1", existing("p1"))).toThrow(
      /own parent/i,
    );
  });

  it("surfaces a readable error for an ancestry cycle", () => {
    expect(() => addParentTo(seedData, "p1", existing("p14"))).toThrow(
      /descends from/i,
    );
  });

  it("surfaces a readable error for a third parent", () => {
    expect(() => addParentTo(seedData, "p8", existing("p13"))).toThrow(
      /two recorded parents/i,
    );
  });
});

describe("addPartnerTo", () => {
  it("creates a declared union with the chosen status and year", () => {
    const { data, personId } = addPartnerTo(
      seedData,
      "p13",
      newPerson("Sam"),
      "married",
      2020,
    );
    const union = data.unions.find((u) => u.partnerIds.includes(personId));

    expect(union?.status).toBe("married");
    expect(union?.year).toBe(2020);
  });

  it("omits the year when none was given", () => {
    const { data, personId } = addPartnerTo(seedData, "p13", newPerson("Sam"), "partners");
    const union = data.unions.find((u) => u.partnerIds.includes(personId));

    expect(union?.year).toBeUndefined();
  });

  it("promotes existing co-parents instead of creating a second union", () => {
    // Give two people a child together, which records co-parenthood only.
    const coParented = addChildTo(seedData, "p13", newPerson("Kid"), "p8").data;
    const before = coParented.unions.length;

    const promoted = addPartnerTo(coParented, "p13", existing("p8"), "married", 2021);

    expect(promoted.data.unions).toHaveLength(before);
    const union = promoted.data.unions.find(
      (u) => u.partnerIds.includes("p13") && u.partnerIds.includes("p8"),
    );
    expect(union?.status).toBe("married");
    expect(union?.year).toBe(2021);
    expect(union?.childIds).toHaveLength(1);
  });

  it("surfaces a readable error for self-partnering", () => {
    expect(() => addPartnerTo(seedData, "p1", existing("p1"), "married")).toThrow(
      /own partner/i,
    );
  });
});

describe("addChildTo", () => {
  it("records a child with one parent when no other is given", () => {
    const { data, personId } = addChildTo(seedData, "p13", newPerson("Kid"));

    expect(parentUnionOf(data, personId)?.partnerIds).toEqual(["p13"]);
  });

  it("records a child under both parents when a second is chosen", () => {
    const { data, personId } = addChildTo(seedData, "p13", newPerson("Kid"), "p8");

    expect(parentUnionOf(data, personId)?.partnerIds).toEqual(
      expect.arrayContaining(["p13", "p8"]),
    );
  });

  it("adds to the couple's existing union rather than a new one", () => {
    const { data } = addChildTo(seedData, "p3", newPerson("Late"), "p4");

    expect(data.unions).toHaveLength(seedData.unions.length);
    expect(data.unions.find((u) => u.id === "u2")?.childIds).toHaveLength(3);
  });

  it("surfaces a readable error when the child already has parents", () => {
    expect(() => addChildTo(seedData, "p13", existing("p8"))).toThrow(
      /already has recorded parents/i,
    );
  });

  it("surfaces a readable error for an ancestry cycle", () => {
    expect(() => addChildTo(seedData, "p14", existing("p1"))).toThrow(
      /ancestor/i,
    );
  });
});

describe("candidate lists", () => {
  it("offers no parent slots once two are recorded", () => {
    expect(canAddParent(seedData, "p8")).toBe(false); // Margaret and David
  });

  it("still offers a slot when only one parent is known", () => {
    // Grace has Linda recorded and nobody else, so a second parent can join.
    expect(canAddParent(seedData, "p13")).toBe(true);
  });

  it("offers a slot to someone with no recorded parents", () => {
    expect(canAddParent(seedData, "p1")).toBe(true);
  });

  it("excludes self and descendants from parent candidates", () => {
    const candidates = ids(parentCandidates(seedData, "p3"));

    expect(candidates).not.toContain("p3"); // self
    expect(candidates).not.toContain("p8"); // her child
    expect(candidates).not.toContain("p14"); // her grandchild
    expect(candidates).toContain("p6"); // unrelated by descent
  });

  it("excludes parents already recorded", () => {
    const candidates = ids(parentCandidates(seedData, "p13"));

    expect(candidates).not.toContain("p7");
  });

  it("excludes self and current partners from partner candidates", () => {
    const candidates = ids(partnerCandidates(seedData, "p3"));

    expect(candidates).not.toContain("p3");
    expect(candidates).not.toContain("p4");
    expect(candidates).toContain("p13");
  });

  it("excludes people who already have parents from child candidates", () => {
    const candidates = ids(childCandidates(seedData, "p13"));

    expect(candidates).not.toContain("p8"); // has parents
    expect(candidates).not.toContain("p13"); // self
    expect(candidates).toContain("p6"); // married in, no recorded parents
  });

  it("excludes ancestors from child candidates", () => {
    expect(ids(childCandidates(seedData, "p14"))).not.toContain("p10");
  });
});

describe("searchPeople", () => {
  const people = seedData.people;

  it("returns everyone for an empty query", () => {
    expect(searchPeople(people, "   ")).toHaveLength(people.length);
  });

  it("matches on first name, last name and full name", () => {
    expect(ids(searchPeople(people, "margaret"))).toEqual(["p3"]);
    expect(ids(searchPeople(people, "okafor"))).toEqual(
      expect.arrayContaining(["p4", "p8", "p9"]),
    );
    expect(ids(searchPeople(people, "margaret hart"))).toEqual(["p3"]);
  });

  it("ignores case and term order", () => {
    expect(ids(searchPeople(people, "HART margaret"))).toEqual(["p3"]);
  });

  it("matches on nickname", () => {
    const withNickname: FamilyTreeData = {
      ...seedData,
      people: seedData.people.map((p) =>
        p.id === "p3" ? { ...p, nickname: "Peggy" } : p,
      ),
    };

    expect(ids(searchPeople(withNickname.people, "peggy"))).toEqual(["p3"]);
  });

  it("returns nothing when nobody matches", () => {
    expect(searchPeople(people, "zzzz")).toHaveLength(0);
  });
});

describe("otherParentOptions", () => {
  it("offers a declared partner and the unknown option", () => {
    const options = otherParentOptions(seedData, "p3");

    expect(options).toHaveLength(2);
    expect(options[0]).toMatchObject({ personId: "p4", detail: "married 1977" });
    expect(options[1].personId).toBeUndefined();
  });

  it("offers only the unknown option for someone with no partners", () => {
    const options = otherParentOptions(seedData, "p13");

    expect(options).toHaveLength(1);
    expect(options[0].personId).toBeUndefined();
  });

  it("includes a former partner, since children predate the divorce", () => {
    const options = otherParentOptions(seedData, "p5");

    expect(options[0]).toMatchObject({ personId: "p6", detail: "former partner" });
  });

  it("includes co-parents and labels them honestly", () => {
    const coParented = addChildTo(seedData, "p13", newPerson("Kid"), "p8").data;
    const options = otherParentOptions(coParented, "p13");

    expect(options[0]).toMatchObject({ personId: "p8", detail: "shares a child" });
  });

  it("lists every partner when there is more than one, so the user must choose", () => {
    const remarried = addPartnerTo(seedData, "p5", newPerson("Second"), "married").data;
    const options = otherParentOptions(remarried, "p5");

    expect(options.filter((o) => o.personId)).toHaveLength(2);
  });
});
