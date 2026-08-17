import type { FamilyTreeData, Person, Union } from "./types";
import { isDeclaredCouple } from "./types";

/** Someone reached through a union, plus the union that connects them. */
export interface RelatedThroughUnion {
  person: Person;
  union: Union;
}

export interface Relations {
  parents: Person[];
  /**
   * People this person is recorded as being — or having been — a couple with.
   * Divorced partners belong here: a former relationship is still a declared
   * relationship, and the union's status says which.
   */
  partners: RelatedThroughUnion[];
  /**
   * People who share a child with this person and nothing more. A union with
   * two partners and no status records co-parenthood alone, so these people
   * must never be presented as partners.
   */
  coParents: RelatedThroughUnion[];
  children: Person[];
  siblings: Person[];
}

/** Everyone directly connected to `personId`, for the detail panel. */
export function relationsOf(data: FamilyTreeData, personId: string): Relations {
  const peopleById = new Map(data.people.map((p) => [p.id, p]));
  const resolve = (id: string) => peopleById.get(id);
  const present = (p: Person | undefined): p is Person => p !== undefined;

  const parentUnion = data.unions.find((u) => u.childIds.includes(personId));
  const ownUnions = data.unions.filter((u) => u.partnerIds.includes(personId));

  const parents = (parentUnion?.partnerIds ?? []).map(resolve).filter(present);

  const siblings = (parentUnion?.childIds ?? [])
    .filter((id) => id !== personId)
    .map(resolve)
    .filter(present);

  // A single-parent union has nobody on the other side, so it contributes to
  // neither list — a lone parent gets no phantom partner or co-parent.
  const othersIn = (union: Union): RelatedThroughUnion[] =>
    union.partnerIds
      .filter((id) => id !== personId)
      .map(resolve)
      .filter(present)
      .map((person) => ({ person, union }));

  const partners = ownUnions.filter(isDeclaredCouple).flatMap(othersIn);

  const coParents = ownUnions
    .filter((union) => !isDeclaredCouple(union))
    .flatMap(othersIn);

  const children = ownUnions.flatMap((union) =>
    union.childIds.map(resolve).filter(present),
  );

  return { parents, partners, coParents, children, siblings };
}
