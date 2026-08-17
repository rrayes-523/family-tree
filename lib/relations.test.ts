import { describe, expect, it } from "vitest";

import {
  addChild,
  addParent,
  addPartner,
  createPerson,
  removePartnerRelationship,
} from "./family-operations";
import { relationsOf } from "./relations";
import { seedData } from "./seed";
import type { FamilyTreeData, PersonDraft } from "./types";

const empty: FamilyTreeData = { people: [], unions: [] };

function draft(firstName: string): PersonDraft {
  return { firstName, lastName: "Test", sex: "other" };
}

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

const idsOf = (entries: { person: { id: string } }[]) =>
  entries.map((entry) => entry.person.id);

describe("declared partners", () => {
  it("lists a married partner under partners", () => {
    const { data, id } = familyOf("Ada", "Bo");
    const relations = relationsOf(addPartner(data, id.Ada, id.Bo, "married"), id.Ada);

    expect(idsOf(relations.partners)).toEqual([id.Bo]);
    expect(relations.coParents).toEqual([]);
  });

  it("lists a partnered (unmarried) partner under partners", () => {
    const { data, id } = familyOf("Ada", "Bo");
    const relations = relationsOf(addPartner(data, id.Ada, id.Bo, "partners"), id.Ada);

    expect(idsOf(relations.partners)).toEqual([id.Bo]);
    expect(relations.coParents).toEqual([]);
  });

  it("keeps a divorced partner under partners and distinguishable", () => {
    const { data, id } = familyOf("Ada", "Bo");
    const relations = relationsOf(addPartner(data, id.Ada, id.Bo, "divorced"), id.Ada);

    expect(idsOf(relations.partners)).toEqual([id.Bo]);
    expect(relations.partners[0].union.status).toBe("divorced");
    expect(relations.coParents).toEqual([]);
  });

  it("reports the relationship from both sides", () => {
    const { data, id } = familyOf("Ada", "Bo");
    const married = addPartner(data, id.Ada, id.Bo, "married");

    expect(idsOf(relationsOf(married, id.Bo).partners)).toEqual([id.Ada]);
  });
});

describe("co-parents", () => {
  it("does not call a status-less two-parent union a partnership", () => {
    const { data, id } = familyOf("Kid", "Mum", "Dad");
    const twoParents = addParent(addParent(data, id.Kid, id.Mum), id.Kid, id.Dad);

    expect(relationsOf(twoParents, id.Mum).partners).toEqual([]);
  });

  it("returns the other parent separately as a co-parent", () => {
    const { data, id } = familyOf("Kid", "Mum", "Dad");
    const twoParents = addParent(addParent(data, id.Kid, id.Mum), id.Kid, id.Dad);
    const relations = relationsOf(twoParents, id.Mum);

    expect(idsOf(relations.coParents)).toEqual([id.Dad]);
    expect(relations.coParents[0].union.status).toBeUndefined();
  });

  it("treats a child added with a second parent the same way", () => {
    const { data, id } = familyOf("Mum", "Dad", "Kid");
    const relations = relationsOf(addChild(data, id.Mum, id.Kid, id.Dad), id.Mum);

    expect(relations.partners).toEqual([]);
    expect(idsOf(relations.coParents)).toEqual([id.Dad]);
  });

  it("moves a couple to co-parents once their relationship is removed", () => {
    const { data, id } = familyOf("Mum", "Dad", "Kid");
    const family = addChild(
      addPartner(data, id.Mum, id.Dad, "married"),
      id.Mum,
      id.Kid,
      id.Dad,
    );

    expect(idsOf(relationsOf(family, id.Mum).partners)).toEqual([id.Dad]);

    const separated = removePartnerRelationship(family, id.Mum, id.Dad);
    const relations = relationsOf(separated, id.Mum);

    expect(relations.partners).toEqual([]);
    expect(idsOf(relations.coParents)).toEqual([id.Dad]);
    expect(relations.children.map((c) => c.id)).toEqual([id.Kid]);
  });

  it("promotes a co-parent to a partner once a relationship is declared", () => {
    const { data, id } = familyOf("Mum", "Dad", "Kid");
    const coParenting = addChild(data, id.Mum, id.Kid, id.Dad);
    const declared = addPartner(coParenting, id.Mum, id.Dad, "married");
    const relations = relationsOf(declared, id.Mum);

    expect(idsOf(relations.partners)).toEqual([id.Dad]);
    expect(relations.coParents).toEqual([]);
  });
});

describe("single parents", () => {
  it("creates no phantom partner or co-parent", () => {
    const { data, id } = familyOf("Mum", "Kid");
    const relations = relationsOf(addChild(data, id.Mum, id.Kid), id.Mum);

    expect(relations.partners).toEqual([]);
    expect(relations.coParents).toEqual([]);
    expect(relations.children.map((c) => c.id)).toEqual([id.Kid]);
  });

  it("gives the child exactly one parent and no phantom second", () => {
    const { data, id } = familyOf("Mum", "Kid");
    const relations = relationsOf(addChild(data, id.Mum, id.Kid), id.Kid);

    expect(relations.parents.map((p) => p.id)).toEqual([id.Mum]);
    expect(relations.siblings).toEqual([]);
  });
});

describe("against the seed family", () => {
  it("reports Margaret's marriage as a partnership, with no co-parents", () => {
    const relations = relationsOf(seedData, "p3");

    expect(idsOf(relations.partners)).toEqual(["p4"]);
    expect(relations.coParents).toEqual([]);
  });

  it("keeps Thomas's divorce visible as a former partnership", () => {
    const relations = relationsOf(seedData, "p5");

    expect(idsOf(relations.partners)).toEqual(["p6"]);
    expect(relations.partners[0].union.status).toBe("divorced");
    expect(relations.coParents).toEqual([]);
  });

  it("leaves Linda a lone parent with no co-parent", () => {
    const relations = relationsOf(seedData, "p7");

    expect(relations.partners).toEqual([]);
    expect(relations.coParents).toEqual([]);
    expect(relations.children.map((c) => c.id)).toEqual(["p13"]);
  });

  it("still reports parents, siblings and children unchanged", () => {
    const relations = relationsOf(seedData, "p3");

    expect(relations.parents.map((p) => p.id)).toEqual(["p2", "p1"]);
    expect(relations.siblings.map((p) => p.id)).toEqual(["p5", "p7"]);
    expect(relations.children.map((p) => p.id)).toEqual(["p8", "p9"]);
  });
});
