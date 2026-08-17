import type {
  FamilyTreeData,
  Person,
  PersonDraft,
  Union,
  UnionStatus,
} from "./types";
import { isDeclaredCouple } from "./types";

/**
 * Family editing operations.
 *
 * Every operation is pure: it takes the current `FamilyTreeData`, returns a new
 * one, and never mutates its input. A rejected operation throws before anything
 * is produced, so a caller that discards the result on error leaves the existing
 * data untouched — which is what makes "cancel changes nothing" free.
 *
 * This module knows nothing about React or React Flow. The graph is a
 * projection of this data, never the other way round.
 */

export class FamilyDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FamilyDataError";
  }
}

function reject(message: string): never {
  throw new FamilyDataError(message);
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Non-secure contexts do not expose randomUUID; ids only need to be unique
  // within one family document, and the caller re-rolls on collision.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function uniqueId(prefix: string, taken: Set<string>): string {
  let id = `${prefix}_${randomId()}`;
  while (taken.has(id)) id = `${prefix}_${randomId()}`;
  return id;
}

function allIds(data: FamilyTreeData): Set<string> {
  const ids = new Set<string>();
  for (const person of data.people) ids.add(person.id);
  for (const union of data.unions) ids.add(union.id);
  return ids;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** The union a person descends from, if their parentage is recorded. */
export function parentUnionOf(
  data: FamilyTreeData,
  personId: string,
): Union | undefined {
  return data.unions.find((union) => union.childIds.includes(personId));
}

/** Every union a person takes part in as a partner or parent. */
export function unionsOf(data: FamilyTreeData, personId: string): Union[] {
  return data.unions.filter((union) => union.partnerIds.includes(personId));
}

/** The union whose partners are exactly this set of people, if one exists. */
function findUnionByPartners(
  data: FamilyTreeData,
  partnerIds: string[],
): Union | undefined {
  return data.unions.find(
    (union) =>
      union.partnerIds.length === partnerIds.length &&
      partnerIds.every((id) => union.partnerIds.includes(id)),
  );
}

function requirePerson(data: FamilyTreeData, personId: string): Person {
  const person = data.people.find((p) => p.id === personId);
  if (!person) reject(`No such person: ${personId}`);
  return person;
}

/**
 * Whether `candidateId` descends from `ancestorId`, walking down through the
 * unions each generation parents. The visited set means an already-corrupt
 * document cannot spin this forever.
 */
export function isDescendantOf(
  data: FamilyTreeData,
  candidateId: string,
  ancestorId: string,
): boolean {
  const visited = new Set<string>([ancestorId]);
  const queue = [ancestorId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    for (const union of data.unions) {
      if (!union.partnerIds.includes(currentId)) continue;
      for (const childId of union.childIds) {
        if (childId === candidateId) return true;
        if (visited.has(childId)) continue;
        visited.add(childId);
        queue.push(childId);
      }
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function normaliseDraft(draft: PersonDraft): PersonDraft {
  const firstName = draft.firstName.trim();
  const lastName = draft.lastName.trim();

  if (firstName === "" && lastName === "") {
    reject("A person needs at least a first or last name.");
  }

  const { birthYear, deathYear } = draft;
  if (
    birthYear !== undefined &&
    deathYear !== undefined &&
    deathYear < birthYear
  ) {
    reject("A person cannot die before they are born.");
  }

  // Drop blank optional strings so absent and empty are not two ways of saying
  // "unknown". Nothing here is required — genealogy is mostly missing data.
  const birthPlace = draft.birthPlace?.trim();
  const notes = draft.notes?.trim();

  return {
    firstName,
    lastName,
    sex: draft.sex,
    ...(birthYear !== undefined ? { birthYear } : {}),
    ...(deathYear !== undefined ? { deathYear } : {}),
    ...(birthPlace ? { birthPlace } : {}),
    ...(notes ? { notes } : {}),
  };
}

/**
 * A union stops being worth keeping once it records nothing: no children, and
 * not a declared couple either. Pruning these keeps removals from leaving
 * invisible empty unions behind.
 */
function isMeaningful(union: Union): boolean {
  return union.childIds.length > 0 || isDeclaredCouple(union);
}

function withUnions(data: FamilyTreeData, unions: Union[]): FamilyTreeData {
  return { people: data.people, unions: unions.filter(isMeaningful) };
}

/** Replaces one union by id, leaving the rest untouched. */
function replaceUnion(unions: Union[], next: Union): Union[] {
  return unions.map((union) => (union.id === next.id ? next : union));
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export interface CreatePersonResult {
  data: FamilyTreeData;
  personId: string;
}

/** Adds a person with no relationships. */
export function createPerson(
  data: FamilyTreeData,
  draft: PersonDraft,
): CreatePersonResult {
  const person: Person = {
    id: uniqueId("p", allIds(data)),
    ...normaliseDraft(draft),
  };

  return {
    data: { people: [...data.people, person], unions: data.unions },
    personId: person.id,
  };
}

/** Edits a person's details. Their id is never reassigned. */
export function updatePerson(
  data: FamilyTreeData,
  personId: string,
  draft: PersonDraft,
): FamilyTreeData {
  requirePerson(data, personId);
  const fields = normaliseDraft(draft);

  return {
    people: data.people.map((person) =>
      person.id === personId ? { id: person.id, ...fields } : person,
    ),
    unions: data.unions,
  };
}

// ---------------------------------------------------------------------------
// Partners
// ---------------------------------------------------------------------------

/**
 * Records a declared relationship between two people. If they already share a
 * union — including one that so far only recorded co-parenthood — that union is
 * updated rather than duplicated.
 */
export function addPartner(
  data: FamilyTreeData,
  personId: string,
  partnerId: string,
  status: UnionStatus = "partners",
): FamilyTreeData {
  if (personId === partnerId) reject("A person cannot be their own partner.");
  requirePerson(data, personId);
  requirePerson(data, partnerId);

  const existing = findUnionByPartners(data, [personId, partnerId]);
  if (existing) {
    return withUnions(data, replaceUnion(data.unions, { ...existing, status }));
  }

  const union: Union = {
    id: uniqueId("u", allIds(data)),
    partnerIds: [personId, partnerId],
    childIds: [],
    status,
  };

  return withUnions(data, [...data.unions, union]);
}

// ---------------------------------------------------------------------------
// Parents
// ---------------------------------------------------------------------------

/**
 * Records `parentId` as a parent of `childId`.
 *
 * When the child already has one known parent, the new parent joins that same
 * union rather than a second parallel one — but the union's status is left
 * alone. Two people raising the same child are co-parents; whether they were
 * ever a couple is a separate fact the user has to state themselves.
 */
export function addParent(
  data: FamilyTreeData,
  childId: string,
  parentId: string,
): FamilyTreeData {
  if (childId === parentId) reject("A person cannot be their own parent.");
  requirePerson(data, childId);
  requirePerson(data, parentId);

  if (isDescendantOf(data, parentId, childId)) {
    reject("That person descends from this one, so they cannot also be a parent.");
  }

  const existing = parentUnionOf(data, childId);

  if (!existing) {
    const union: Union = {
      id: uniqueId("u", allIds(data)),
      partnerIds: [parentId],
      childIds: [childId],
    };
    return withUnions(data, [...data.unions, union]);
  }

  if (existing.partnerIds.includes(parentId)) {
    reject("That person is already recorded as a parent.");
  }

  if (existing.partnerIds.length >= 2) {
    reject("This person already has two recorded parents.");
  }

  return withUnions(
    data,
    replaceUnion(data.unions, {
      ...existing,
      partnerIds: [...existing.partnerIds, parentId],
    }),
  );
}

// ---------------------------------------------------------------------------
// Children
// ---------------------------------------------------------------------------

/**
 * Records `childId` as a child of `parentId`, optionally alongside a second
 * parent. Omitting `otherParentId` means the other parent is unknown, which is
 * a legitimate answer rather than a missing one.
 *
 * A person descends from at most one union, so a child who already has recorded
 * parents is rejected instead of being quietly given a second parentage.
 */
export function addChild(
  data: FamilyTreeData,
  parentId: string,
  childId: string,
  otherParentId?: string,
): FamilyTreeData {
  if (parentId === childId) reject("A person cannot be their own parent.");
  requirePerson(data, parentId);
  requirePerson(data, childId);

  if (otherParentId !== undefined) {
    if (otherParentId === parentId) {
      reject("Both parents cannot be the same person.");
    }
    if (otherParentId === childId) {
      reject("A person cannot be their own parent.");
    }
    requirePerson(data, otherParentId);
  }

  if (isDescendantOf(data, parentId, childId)) {
    reject("That person is an ancestor of this one, so they cannot also be a child.");
  }

  if (parentUnionOf(data, childId)) {
    reject("That person already has recorded parents.");
  }

  const partnerIds =
    otherParentId === undefined ? [parentId] : [parentId, otherParentId];
  const existing = findUnionByPartners(data, partnerIds);

  if (existing) {
    return withUnions(
      data,
      replaceUnion(data.unions, {
        ...existing,
        childIds: [...existing.childIds, childId],
      }),
    );
  }

  const union: Union = {
    id: uniqueId("u", allIds(data)),
    partnerIds,
    childIds: [childId],
  };

  return withUnions(data, [...data.unions, union]);
}

// ---------------------------------------------------------------------------
// Removal — relationships only, never people
// ---------------------------------------------------------------------------

/**
 * Ends a declared relationship. Both people are kept, and so is their shared
 * parenthood: if the couple has children the union survives with its status
 * cleared, which downgrades the record from "a couple" to "co-parents" rather
 * than erasing anyone's children.
 */
export function removePartnerRelationship(
  data: FamilyTreeData,
  personId: string,
  partnerId: string,
): FamilyTreeData {
  const existing = findUnionByPartners(data, [personId, partnerId]);
  if (!existing) reject("These two people do not share a recorded relationship.");

  if (existing.childIds.length > 0) {
    // Rebuilt without `status`/`year` so the relationship claim is dropped while
    // the co-parenthood it also recorded survives.
    return withUnions(
      data,
      replaceUnion(data.unions, {
        id: existing.id,
        partnerIds: existing.partnerIds,
        childIds: existing.childIds,
      }),
    );
  }

  return withUnions(
    data,
    data.unions.filter((union) => union.id !== existing.id),
  );
}

/**
 * Removes one parent-child link. The child keeps their other parent, if any, by
 * moving to a union recording just that parent. Nobody is deleted.
 */
export function removeParentChildRelationship(
  data: FamilyTreeData,
  parentId: string,
  childId: string,
): FamilyTreeData {
  const existing = data.unions.find(
    (union) =>
      union.partnerIds.includes(parentId) && union.childIds.includes(childId),
  );
  if (!existing) reject("That parent-child relationship is not recorded.");

  const detached: Union = {
    ...existing,
    childIds: existing.childIds.filter((id) => id !== childId),
  };
  let unions = replaceUnion(data.unions, detached);

  // The other parent did not stop being a parent, so re-home the child under
  // them alone rather than dropping their parentage too.
  const remaining = existing.partnerIds.filter((id) => id !== parentId);
  if (remaining.length > 0) {
    const target = findUnionByPartners({ ...data, unions }, remaining);
    if (target) {
      unions = replaceUnion(unions, {
        ...target,
        childIds: [...target.childIds, childId],
      });
    } else {
      unions = [
        ...unions,
        {
          id: uniqueId("u", allIds(data)),
          partnerIds: remaining,
          childIds: [childId],
        },
      ];
    }
  }

  return withUnions(data, unions);
}
