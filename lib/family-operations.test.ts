import { describe, expect, it } from "vitest";

import {
  FamilyDataError,
  addChild,
  addParent,
  addPartner,
  createPerson,
  isDescendantOf,
  parentUnionOf,
  removeParentChildRelationship,
  removePartnerRelationship,
  unionsOf,
  updatePerson,
} from "./family-operations";
import { seedData } from "./seed";
import type { FamilyTreeData, PersonDraft } from "./types";

const empty: FamilyTreeData = { people: [], unions: [] };

function draft(firstName: string, over: Partial<PersonDraft> = {}): PersonDraft {
  return { firstName, lastName: "Test", sex: "other", ...over };
}

/** Builds a family from names, returning the data plus a name → id lookup. */
function familyOf(...names: string[]) {
  let data = empty;
  const id: Record<string, string> = {};
  for (const name of names) {
    const result = createPerson(data, draft(name));
    data = result.data;
    id[name] = result.personId;
  }
  return { data, id };
}

describe("createPerson", () => {
  it("adds a standalone person with no relationships", () => {
    const { data, personId } = createPerson(empty, draft("Ada"));

    expect(data.people).toHaveLength(1);
    expect(data.unions).toHaveLength(0);
    expect(data.people[0]).toMatchObject({ id: personId, firstName: "Ada" });
  });

  it("does not mutate the data it was given", () => {
    const before = structuredClone(seedData);
    createPerson(seedData, draft("Ada"));

    expect(seedData).toEqual(before);
  });

  it("gives every person a distinct id", () => {
    const { data } = familyOf("Ada", "Bo", "Cy", "Di", "Eli");
    const ids = new Set(data.people.map((p) => p.id));

    expect(ids.size).toBe(data.people.length);
  });

  it("does not use the name as the identifier", () => {
    const { data, personId } = createPerson(empty, draft("Ada"));

    expect(personId).not.toContain("Ada");
    expect(data.people[0].id).toBe(personId);
  });

  it("requires at least one name", () => {
    expect(() => createPerson(empty, { firstName: "  ", lastName: "", sex: "other" })).toThrow(
      FamilyDataError,
    );
  });

  it("rejects dying before being born", () => {
    expect(() =>
      createPerson(empty, draft("Ada", { birthYear: 1990, deathYear: 1980 })),
    ).toThrow(FamilyDataError);
  });

  it("allows unknown birth and death years", () => {
    const { data } = createPerson(empty, draft("Ada"));

    expect(data.people[0].birthYear).toBeUndefined();
    expect(data.people[0].deathYear).toBeUndefined();
  });
});

describe("updatePerson", () => {
  it("preserves the person's id", () => {
    const { data, personId } = createPerson(empty, draft("Ada"));
    const next = updatePerson(data, personId, draft("Ada", { lastName: "Lovelace" }));

    expect(next.people[0].id).toBe(personId);
    expect(next.people[0].lastName).toBe("Lovelace");
  });

  it("leaves other people alone", () => {
    const { data, id } = familyOf("Ada", "Bo");
    const next = updatePerson(data, id.Ada, draft("Ada", { birthPlace: "London" }));

    expect(next.people.find((p) => p.id === id.Bo)).toEqual(
      data.people.find((p) => p.id === id.Bo),
    );
  });

  it("rejects an unknown person", () => {
    expect(() => updatePerson(empty, "nobody", draft("Ada"))).toThrow(FamilyDataError);
  });
});

describe("addPartner", () => {
  it("creates a union recording the declared relationship", () => {
    const { data, id } = familyOf("Ada", "Bo");
    const next = addPartner(data, id.Ada, id.Bo, "married");

    expect(next.unions).toHaveLength(1);
    expect(next.unions[0].partnerIds).toEqual(expect.arrayContaining([id.Ada, id.Bo]));
    expect(next.unions[0].status).toBe("married");
    expect(next.unions[0].childIds).toEqual([]);
  });

  it("rejects a person partnering with themselves", () => {
    const { data, id } = familyOf("Ada");

    expect(() => addPartner(data, id.Ada, id.Ada)).toThrow(FamilyDataError);
  });

  it("does not create a duplicate union for the same two people", () => {
    const { data, id } = familyOf("Ada", "Bo");
    const once = addPartner(data, id.Ada, id.Bo, "married");
    const twice = addPartner(once, id.Bo, id.Ada, "married");

    expect(twice.unions).toHaveLength(1);
  });

  it("updates the status of an existing union instead of duplicating it", () => {
    const { data, id } = familyOf("Ada", "Bo");
    const married = addPartner(data, id.Ada, id.Bo, "married");
    const divorced = addPartner(married, id.Ada, id.Bo, "divorced");

    expect(divorced.unions).toHaveLength(1);
    expect(divorced.unions[0].status).toBe("divorced");
  });

  it("promotes known co-parents to a declared couple without a second union", () => {
    const { data, id } = familyOf("Ada", "Bo", "Cy");
    const coParents = addChild(data, id.Ada, id.Cy, id.Bo);
    expect(coParents.unions[0].status).toBeUndefined();

    const declared = addPartner(coParents, id.Ada, id.Bo, "married");

    expect(declared.unions).toHaveLength(1);
    expect(declared.unions[0].status).toBe("married");
    expect(declared.unions[0].childIds).toEqual([id.Cy]);
  });
});

describe("addParent", () => {
  it("records a single known parent", () => {
    const { data, id } = familyOf("Kid", "Mum");
    const next = addParent(data, id.Kid, id.Mum);

    expect(next.unions).toHaveLength(1);
    expect(next.unions[0].partnerIds).toEqual([id.Mum]);
    expect(next.unions[0].childIds).toEqual([id.Kid]);
  });

  it("adds a second parent to the existing union rather than a new one", () => {
    const { data, id } = familyOf("Kid", "Mum", "Dad");
    const next = addParent(addParent(data, id.Kid, id.Mum), id.Kid, id.Dad);

    expect(next.unions).toHaveLength(1);
    expect(next.unions[0].partnerIds).toEqual(
      expect.arrayContaining([id.Mum, id.Dad]),
    );
  });

  it("does not infer a partnership from two people sharing a child", () => {
    const { data, id } = familyOf("Kid", "Mum", "Dad");
    const next = addParent(addParent(data, id.Kid, id.Mum), id.Kid, id.Dad);

    expect(next.unions[0].status).toBeUndefined();
  });

  it("rejects a person parenting themselves", () => {
    const { data, id } = familyOf("Ada");

    expect(() => addParent(data, id.Ada, id.Ada)).toThrow(FamilyDataError);
  });

  it("rejects a third parent", () => {
    const { data, id } = familyOf("Kid", "Mum", "Dad", "Other");
    const twoParents = addParent(addParent(data, id.Kid, id.Mum), id.Kid, id.Dad);

    expect(() => addParent(twoParents, id.Kid, id.Other)).toThrow(FamilyDataError);
  });

  it("rejects re-adding the same parent", () => {
    const { data, id } = familyOf("Kid", "Mum");
    const once = addParent(data, id.Kid, id.Mum);

    expect(() => addParent(once, id.Kid, id.Mum)).toThrow(FamilyDataError);
  });

  it("rejects an ancestry cycle", () => {
    // Grandparent → Parent → Kid, then try to make Kid the grandparent's parent.
    const { data, id } = familyOf("Grandparent", "Parent", "Kid");
    const line = addChild(
      addChild(data, id.Grandparent, id.Parent),
      id.Parent,
      id.Kid,
    );

    expect(() => addParent(line, id.Grandparent, id.Kid)).toThrow(FamilyDataError);
  });
});

describe("addChild", () => {
  it("lets a single parent have a child with no second parent", () => {
    const { data, id } = familyOf("Mum", "Kid");
    const next = addChild(data, id.Mum, id.Kid);

    expect(next.unions).toHaveLength(1);
    expect(next.unions[0].partnerIds).toEqual([id.Mum]);
    expect(next.unions[0].childIds).toEqual([id.Kid]);
    expect(next.unions[0].status).toBeUndefined();
  });

  it("records a child of two known parents in one union", () => {
    const { data, id } = familyOf("Mum", "Dad", "Kid");
    const next = addChild(data, id.Mum, id.Kid, id.Dad);

    expect(next.unions).toHaveLength(1);
    expect(next.unions[0].partnerIds).toEqual(
      expect.arrayContaining([id.Mum, id.Dad]),
    );
    expect(next.unions[0].childIds).toEqual([id.Kid]);
  });

  it("adds the child to the couple's existing union", () => {
    const { data, id } = familyOf("Mum", "Dad", "First", "Second");
    const married = addPartner(data, id.Mum, id.Dad, "married");
    const next = addChild(
      addChild(married, id.Mum, id.First, id.Dad),
      id.Mum,
      id.Second,
      id.Dad,
    );

    expect(next.unions).toHaveLength(1);
    expect(next.unions[0].childIds).toEqual([id.First, id.Second]);
    expect(next.unions[0].status).toBe("married");
  });

  it("connects a person who already exists rather than duplicating them", () => {
    const { data, id } = familyOf("Mum", "Kid");
    const next = addChild(data, id.Mum, id.Kid);

    expect(next.people).toHaveLength(2);
    expect(next.people.map((p) => p.id)).toEqual([id.Mum, id.Kid]);
  });

  it("does not let the same child appear twice in one union", () => {
    const { data, id } = familyOf("Mum", "Kid");
    const once = addChild(data, id.Mum, id.Kid);

    expect(() => addChild(once, id.Mum, id.Kid)).toThrow(FamilyDataError);
  });

  it("rejects a child who already has recorded parents", () => {
    const { data, id } = familyOf("Mum", "Other", "Kid");
    const once = addChild(data, id.Mum, id.Kid);

    expect(() => addChild(once, id.Other, id.Kid)).toThrow(FamilyDataError);
  });

  it("rejects a person being their own child", () => {
    const { data, id } = familyOf("Ada");

    expect(() => addChild(data, id.Ada, id.Ada)).toThrow(FamilyDataError);
  });

  it("rejects naming the same person as both parents", () => {
    const { data, id } = familyOf("Mum", "Kid");

    expect(() => addChild(data, id.Mum, id.Kid, id.Mum)).toThrow(FamilyDataError);
  });

  it("rejects an ancestry cycle", () => {
    const { data, id } = familyOf("Grandparent", "Parent", "Kid");
    const line = addChild(
      addChild(data, id.Grandparent, id.Parent),
      id.Parent,
      id.Kid,
    );

    expect(() => addChild(line, id.Kid, id.Grandparent)).toThrow(FamilyDataError);
  });
});

describe("removePartnerRelationship", () => {
  it("keeps both people", () => {
    const { data, id } = familyOf("Ada", "Bo");
    const married = addPartner(data, id.Ada, id.Bo, "married");
    const next = removePartnerRelationship(married, id.Ada, id.Bo);

    expect(next.people.map((p) => p.id)).toEqual([id.Ada, id.Bo]);
  });

  it("drops a childless union entirely", () => {
    const { data, id } = familyOf("Ada", "Bo");
    const married = addPartner(data, id.Ada, id.Bo, "married");

    expect(removePartnerRelationship(married, id.Ada, id.Bo).unions).toHaveLength(0);
  });

  it("keeps shared children by downgrading the couple to co-parents", () => {
    const { data, id } = familyOf("Mum", "Dad", "Kid");
    const family = addChild(
      addPartner(data, id.Mum, id.Dad, "married"),
      id.Mum,
      id.Kid,
      id.Dad,
    );
    const next = removePartnerRelationship(family, id.Mum, id.Dad);

    expect(next.people).toHaveLength(3);
    expect(next.unions).toHaveLength(1);
    expect(next.unions[0].status).toBeUndefined();
    expect(next.unions[0].childIds).toEqual([id.Kid]);
    expect(next.unions[0].partnerIds).toEqual(
      expect.arrayContaining([id.Mum, id.Dad]),
    );
  });

  it("rejects removing a relationship that was never recorded", () => {
    const { data, id } = familyOf("Ada", "Bo");

    expect(() => removePartnerRelationship(data, id.Ada, id.Bo)).toThrow(
      FamilyDataError,
    );
  });
});

describe("removeParentChildRelationship", () => {
  it("keeps the child as a person", () => {
    const { data, id } = familyOf("Mum", "Kid");
    const family = addChild(data, id.Mum, id.Kid);
    const next = removeParentChildRelationship(family, id.Mum, id.Kid);

    expect(next.people.map((p) => p.id)).toEqual([id.Mum, id.Kid]);
    expect(parentUnionOf(next, id.Kid)).toBeUndefined();
  });

  it("leaves the child with their other parent", () => {
    const { data, id } = familyOf("Mum", "Dad", "Kid");
    const family = addChild(data, id.Mum, id.Kid, id.Dad);
    const next = removeParentChildRelationship(family, id.Dad, id.Kid);

    expect(next.people).toHaveLength(3);
    const parentUnion = parentUnionOf(next, id.Kid);
    expect(parentUnion?.partnerIds).toEqual([id.Mum]);
  });

  it("leaves siblings attached to both parents", () => {
    const { data, id } = familyOf("Mum", "Dad", "Kid", "Sibling");
    const family = addChild(
      addChild(data, id.Mum, id.Kid, id.Dad),
      id.Mum,
      id.Sibling,
      id.Dad,
    );
    const next = removeParentChildRelationship(family, id.Dad, id.Kid);

    expect(parentUnionOf(next, id.Sibling)?.partnerIds).toEqual(
      expect.arrayContaining([id.Mum, id.Dad]),
    );
    expect(parentUnionOf(next, id.Kid)?.partnerIds).toEqual([id.Mum]);
  });

  it("keeps a childless marriage intact after its only child is detached", () => {
    const { data, id } = familyOf("Mum", "Dad", "Kid");
    const family = addChild(
      addPartner(data, id.Mum, id.Dad, "married"),
      id.Mum,
      id.Kid,
      id.Dad,
    );
    const next = removeParentChildRelationship(family, id.Mum, id.Kid);

    const marriage = next.unions.find((u) => u.status === "married");
    expect(marriage?.partnerIds).toEqual(expect.arrayContaining([id.Mum, id.Dad]));
    expect(marriage?.childIds).toEqual([]);
    expect(parentUnionOf(next, id.Kid)?.partnerIds).toEqual([id.Dad]);
  });

  it("rejects removing a link that was never recorded", () => {
    const { data, id } = familyOf("Mum", "Kid");

    expect(() => removeParentChildRelationship(data, id.Mum, id.Kid)).toThrow(
      FamilyDataError,
    );
  });
});

describe("working against the seed family", () => {
  it("treats Linda's single-parent union as valid parentage", () => {
    // u4 records Linda (p7) raising Grace (p13) with no second parent.
    expect(parentUnionOf(seedData, "p13")?.partnerIds).toEqual(["p7"]);
  });

  it("sees descendants across generations", () => {
    expect(isDescendantOf(seedData, "p14", "p1")).toBe(true); // great-grandchild
    expect(isDescendantOf(seedData, "p1", "p14")).toBe(false);
  });

  it("rejects making a great-grandchild the matriarch's parent", () => {
    expect(() => addParent(seedData, "p1", "p14")).toThrow(FamilyDataError);
  });

  it("adds a second union for a remarriage, leaving the first intact", () => {
    // Thomas (p5) is already recorded as divorced from Susan (p6) in u3.
    const { data, personId } = createPerson(seedData, draft("New"));
    const next = addPartner(data, "p5", personId, "married");

    expect(unionsOf(next, "p5")).toHaveLength(2);
    expect(next.unions.find((u) => u.id === "u3")).toEqual(
      seedData.unions.find((u) => u.id === "u3"),
    );
    expect(next.people).toHaveLength(seedData.people.length + 1);
  });

  it("removes a marriage without losing anybody", () => {
    const next = removePartnerRelationship(seedData, "p2", "p1");

    expect(next.people).toHaveLength(seedData.people.length);
    expect(parentUnionOf(next, "p3")?.childIds).toEqual(["p3", "p5", "p7"]);
    expect(next.unions.find((u) => u.id === "u1")?.status).toBeUndefined();
  });
});
