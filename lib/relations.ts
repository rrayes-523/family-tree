import type { FamilyTreeData, Person, Union } from "./types";

export interface Relations {
  parents: Person[];
  partners: { person: Person; union: Union }[];
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

  const partners = ownUnions.flatMap((union) =>
    union.partnerIds
      .filter((id) => id !== personId)
      .map(resolve)
      .filter(present)
      .map((person) => ({ person, union })),
  );

  const children = ownUnions.flatMap((union) =>
    union.childIds.map(resolve).filter(present),
  );

  return { parents, partners, children, siblings };
}
