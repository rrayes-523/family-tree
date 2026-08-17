import {
  addChild,
  addParent,
  addPartner,
  createPerson,
  isDescendantOf,
  parentUnionOf,
  unionsOf,
} from "./family-operations";
import { relationsOf } from "./relations";
import { fullName } from "./types";
import type {
  FamilyTreeData,
  Person,
  PersonDraft,
  UnionStatus,
} from "./types";

/**
 * Application layer between the relationship dialogs and the domain.
 *
 * Two jobs: joining "create this person" to "and relate them" as one atomic
 * step, and working out which people are sensible to offer for each
 * relationship so the UI never presents a choice the domain would reject.
 *
 * Nothing here knows about React, storage, or React Flow.
 */

/** Either someone already in the tree, or someone about to be created. */
export type PersonChoice =
  | { kind: "existing"; personId: string }
  | { kind: "new"; draft: PersonDraft };

export interface RelationshipResult {
  data: FamilyTreeData;
  /** The person on the far end of the new relationship. */
  personId: string;
}

/**
 * Turns a choice into an id, creating the person in a *candidate* document
 * first when they are new.
 *
 * Atomicity falls out of the operations being pure: the candidate is a separate
 * value, so if the relationship step below throws, that document is discarded
 * whole and the person created a moment earlier never existed as far as the
 * committed family is concerned. There is no half-written state to undo.
 */
function resolveChoice(
  family: FamilyTreeData,
  choice: PersonChoice,
): RelationshipResult {
  if (choice.kind === "existing") {
    return { data: family, personId: choice.personId };
  }
  const { data, personId } = createPerson(family, choice.draft);
  return { data, personId };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export function addParentTo(
  family: FamilyTreeData,
  childId: string,
  choice: PersonChoice,
): RelationshipResult {
  const candidate = resolveChoice(family, choice);
  return {
    data: addParent(candidate.data, childId, candidate.personId),
    personId: candidate.personId,
  };
}

export function addPartnerTo(
  family: FamilyTreeData,
  personId: string,
  choice: PersonChoice,
  status: UnionStatus,
  year?: number,
): RelationshipResult {
  const candidate = resolveChoice(family, choice);
  return {
    data: addPartner(candidate.data, personId, candidate.personId, status, year),
    personId: candidate.personId,
  };
}

export function addChildTo(
  family: FamilyTreeData,
  parentId: string,
  choice: PersonChoice,
  otherParentId?: string,
): RelationshipResult {
  const candidate = resolveChoice(family, choice);
  return {
    data: addChild(candidate.data, parentId, candidate.personId, otherParentId),
    personId: candidate.personId,
  };
}

// ---------------------------------------------------------------------------
// Who is worth offering
//
// The domain rejects bad relationships regardless; keeping them out of the
// picker means the user meets a shorter list rather than an error message.
// ---------------------------------------------------------------------------

/** A person descends from at most one union, so two parents is the ceiling. */
export function canAddParent(family: FamilyTreeData, childId: string): boolean {
  return (parentUnionOf(family, childId)?.partnerIds.length ?? 0) < 2;
}

export function parentCandidates(
  family: FamilyTreeData,
  childId: string,
): Person[] {
  const recorded = parentUnionOf(family, childId)?.partnerIds ?? [];

  return family.people.filter(
    (person) =>
      person.id !== childId &&
      !recorded.includes(person.id) &&
      // Someone who descends from this child cannot also sit above them.
      !isDescendantOf(family, person.id, childId),
  );
}

export function partnerCandidates(
  family: FamilyTreeData,
  personId: string,
): Person[] {
  const alreadyPartnered = new Set(
    unionsOf(family, personId).flatMap((union) => union.partnerIds),
  );

  return family.people.filter(
    (person) => person.id !== personId && !alreadyPartnered.has(person.id),
  );
}

export function childCandidates(
  family: FamilyTreeData,
  parentId: string,
): Person[] {
  return family.people.filter(
    (person) =>
      person.id !== parentId &&
      // Somebody with recorded parents already descends from a union.
      parentUnionOf(family, person.id) === undefined &&
      // This parent must not already descend from the proposed child.
      !isDescendantOf(family, parentId, person.id),
  );
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/**
 * Filters people for the picker. Every whitespace-separated term has to appear
 * somewhere in the person's names or nickname, so "hart mar" finds Margaret
 * Hart without the user having to type the parts in order.
 */
export function searchPeople(people: Person[], query: string): Person[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === "") return people;

  const terms = trimmed.split(/\s+/);

  return people.filter((person) => {
    const haystack = [
      person.firstName,
      person.lastName,
      fullName(person),
      person.nickname ?? "",
    ]
      .join(" ")
      .toLowerCase();

    return terms.every((term) => haystack.includes(term));
  });
}

// ---------------------------------------------------------------------------
// Other-parent choices for "add child"
// ---------------------------------------------------------------------------

export interface OtherParentOption {
  /** Absent means no second parent is recorded, which is a valid answer. */
  personId?: string;
  label: string;
  detail?: string;
}

function partnerDetail(status: UnionStatus | undefined, year?: number): string {
  switch (status) {
    case "divorced":
      return "former partner";
    case "married":
      return year ? `married ${year}` : "married";
    case "partners":
      return year ? `together since ${year}` : "partner";
    default:
      return "shares a child";
  }
}

/**
 * The other parent a child could be recorded under: anyone this person is
 * already partnered or co-parenting with, plus the option of recording nobody.
 *
 * The UI shows this list rather than guessing, so a person with two partners is
 * never silently assigned one of them.
 */
export function otherParentOptions(
  family: FamilyTreeData,
  personId: string,
): OtherParentOption[] {
  const relations = relationsOf(family, personId);
  const options: OtherParentOption[] = [];
  const seen = new Set<string>();

  for (const { person, union } of [...relations.partners, ...relations.coParents]) {
    if (seen.has(person.id)) continue;
    seen.add(person.id);
    options.push({
      personId: person.id,
      label: fullName(person),
      detail: partnerDetail(union.status, union.year),
    });
  }

  options.push({ label: "Unknown / no other parent recorded" });
  return options;
}
