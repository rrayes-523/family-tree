import { isDeclaredCouple } from "./types";
import type { FamilyTreeData, Union } from "./types";

/**
 * Branch collapse — view state only.
 *
 * Nothing here edits genealogy. Collapse is expressed as a set of person ids
 * whose descendants are hidden, and `visibleFamily` projects the authoritative
 * document down to what should be drawn. The layout then runs on that
 * projection unchanged, so hidden people reserve no space by construction
 * rather than by the layout knowing anything about collapse.
 *
 *   FamilyTreeData → visibleFamily() → layoutTree() → React Flow
 *
 * A "branch" follows parent-child genealogy, never raw graph connectivity, so
 * collapsing someone can never hide their parents, their siblings, or an
 * unrelated family elsewhere on the canvas.
 */

/** Person ids whose descendant branches are hidden. */
export type CollapsedSet = ReadonlySet<string>;

interface Index {
  people: Set<string>;
  unionsByPartner: Map<string, Union[]>;
  parentUnionByChild: Map<string, Union>;
}

function indexFamily(family: FamilyTreeData): Index {
  const people = new Set(family.people.map((p) => p.id));
  const unionsByPartner = new Map<string, Union[]>();
  const parentUnionByChild = new Map<string, Union>();

  for (const union of family.unions) {
    for (const partnerId of union.partnerIds) {
      const existing = unionsByPartner.get(partnerId);
      if (existing) existing.push(union);
      else unionsByPartner.set(partnerId, [union]);
    }
    for (const childId of union.childIds) {
      if (!parentUnionByChild.has(childId)) parentUnionByChild.set(childId, union);
    }
  }

  return { people, unionsByPartner, parentUnionByChild };
}

/** Every child of a person, across all the unions they parent in. */
export function childIdsOf(family: FamilyTreeData, personId: string): string[] {
  const children: string[] = [];
  for (const union of family.unions) {
    if (!union.partnerIds.includes(personId)) continue;
    for (const childId of union.childIds) {
      if (!children.includes(childId)) children.push(childId);
    }
  }
  return children;
}

export function hasDescendants(family: FamilyTreeData, personId: string): boolean {
  return childIdsOf(family, personId).length > 0;
}

/** Everyone below a person, walking down parent-child links. Excludes them. */
export function descendantIds(
  family: FamilyTreeData,
  personId: string,
): Set<string> {
  const index = indexFamily(family);
  return descendantsWith(index, personId);
}

function descendantsWith(index: Index, personId: string): Set<string> {
  const found = new Set<string>();
  const queue = [personId];
  const seen = new Set<string>([personId]);

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    for (const union of index.unionsByPartner.get(currentId) ?? []) {
      for (const childId of union.childIds) {
        if (seen.has(childId)) continue;
        seen.add(childId);
        found.add(childId);
        queue.push(childId);
      }
    }
  }

  return found;
}

/** Parents, partners and children of a person, as one set. */
function relativesOf(index: Index, personId: string): Set<string> {
  const related = new Set<string>();

  const parentUnion = index.parentUnionByChild.get(personId);
  for (const parentId of parentUnion?.partnerIds ?? []) related.add(parentId);

  for (const union of index.unionsByPartner.get(personId) ?? []) {
    for (const partnerId of union.partnerIds) related.add(partnerId);
    for (const childId of union.childIds) related.add(childId);
  }

  related.delete(personId);
  return related;
}

/**
 * Everyone hidden when `personId`'s branch collapses: their descendants, plus
 * the partners who married in through those descendants.
 *
 * A partner is only taken along when *every* relation they have lies inside the
 * branch — otherwise they would be left with no visible family and a marriage
 * connector pointing at nothing. Anyone with independent standing (their own
 * visible parents, or a partner or child outside the branch) stays put, which
 * is why collapsing a matriarch never drags her own spouse down with her.
 *
 * Membership is judged against the descendant set alone, so the result does not
 * depend on iteration order, and a married-in partner can never pull their own
 * parents in after them — collapsing a branch must not hide ancestors.
 */
export function branchOf(family: FamilyTreeData, personId: string): Set<string> {
  const index = indexFamily(family);
  return branchWith(index, personId);
}

function branchWith(index: Index, personId: string): Set<string> {
  const descendants = descendantsWith(index, personId);
  const branch = new Set(descendants);

  for (const descendantId of descendants) {
    for (const union of index.unionsByPartner.get(descendantId) ?? []) {
      for (const partnerId of union.partnerIds) {
        if (partnerId === descendantId || branch.has(partnerId)) continue;

        const relatives = relativesOf(index, partnerId);
        const marriedIn =
          relatives.size > 0 && [...relatives].every((id) => descendants.has(id));
        if (marriedIn) branch.add(partnerId);
      }
    }
  }

  return branch;
}

/** Everyone hidden by the current collapse state. */
export function hiddenPeopleIds(
  family: FamilyTreeData,
  collapsed: CollapsedSet,
): Set<string> {
  const hidden = new Set<string>();
  if (collapsed.size === 0) return hidden;

  const index = indexFamily(family);
  for (const personId of collapsed) {
    if (!index.people.has(personId)) continue;
    for (const hiddenId of branchWith(index, personId)) hidden.add(hiddenId);
  }
  return hidden;
}

/**
 * The family as it should be drawn. Hidden people are dropped, and so are the
 * unions that would be left dangling:
 *
 * - a union whose partners are not all visible is dropped, so no marriage
 *   connector ever points at someone who is not there;
 * - a union with no visible children survives only if it records a declared
 *   couple. A lone parent whose children are hidden would otherwise render a
 *   connector to an empty marker.
 *
 * Children are filtered rather than the union removed, so a couple with some
 * children hidden keeps its marriage line and loses only the hidden branches.
 */
export function visibleFamily(
  family: FamilyTreeData,
  collapsed: CollapsedSet,
): FamilyTreeData {
  // Nothing collapsed is the common case, and returning the document untouched
  // guarantees the projection cannot perturb the default view.
  if (collapsed.size === 0) return family;

  const hidden = hiddenPeopleIds(family, collapsed);
  if (hidden.size === 0) return family;

  const people = family.people.filter((person) => !hidden.has(person.id));
  const visible = new Set(people.map((person) => person.id));

  const unions = family.unions
    .filter(
      (union) =>
        union.partnerIds.length > 0 &&
        union.partnerIds.every((id) => visible.has(id)),
    )
    .map((union) => ({
      ...union,
      childIds: union.childIds.filter((id) => visible.has(id)),
    }))
    .filter((union) => union.childIds.length > 0 || isDeclaredCouple(union));

  return { people, unions };
}

export interface CollapseInfo {
  /** Whether this person has a branch that could be collapsed at all. */
  canCollapse: boolean;
  collapsed: boolean;
  /** Unique people hidden when this branch is collapsed — never node counts. */
  hiddenCount: number;
}

export function collapseInfoFor(
  family: FamilyTreeData,
  collapsed: CollapsedSet,
  personId: string,
): CollapseInfo {
  const index = indexFamily(family);
  const branch = branchWith(index, personId);

  return {
    canCollapse: branch.size > 0,
    collapsed: collapsed.has(personId),
    hiddenCount: branch.size,
  };
}

/**
 * Collapse state with whatever was hiding `personId` opened up, so navigation
 * can reach anyone regardless of what is currently folded away.
 *
 * Every collapsed person whose branch contains the target is released at once,
 * which is enough in a single pass: afterwards no remaining branch contains
 * them, so they are visible.
 */
export function revealPathTo(
  family: FamilyTreeData,
  collapsed: CollapsedSet,
  personId: string,
): Set<string> {
  const next = new Set(collapsed);
  if (collapsed.size === 0) return next;

  const index = indexFamily(family);
  for (const collapsedId of collapsed) {
    if (branchWith(index, collapsedId).has(personId)) next.delete(collapsedId);
  }
  return next;
}

/**
 * Branch roots for "Collapse all": everyone who has descendants *and* recorded
 * parents. That keeps the oldest generation on screen and folds the branches
 * hanging beneath them, which reads as an overview rather than an empty canvas.
 *
 * A tree too shallow to have any such person — parents and children only —
 * falls back to collapsing whoever has descendants, so the action always does
 * something.
 */
export function collapseAllBranches(family: FamilyTreeData): Set<string> {
  const index = indexFamily(family);

  const withDescendants = family.people.filter(
    (person) => descendantsWith(index, person.id).size > 0,
  );

  const belowTheTop = withDescendants.filter((person) =>
    index.parentUnionByChild.has(person.id),
  );

  const chosen = belowTheTop.length > 0 ? belowTheTop : withDescendants;
  return new Set(chosen.map((person) => person.id));
}
