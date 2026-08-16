export type Sex = "male" | "female" | "other";

export type UnionStatus = "married" | "partners" | "divorced";

export interface Person {
  id: string;
  firstName: string;
  lastName: string;
  sex: Sex;
  birthYear?: number;
  deathYear?: number;
  birthPlace?: string;
  notes?: string;
}

/**
 * A couple (or a single parent) plus the children that descend from them.
 * Modelling parenthood through a union rather than person-to-person edges keeps
 * siblings grouped and lets the layout hang children off one shared point.
 */
export interface Union {
  id: string;
  /** One partner for a single parent, two for a couple. */
  partnerIds: string[];
  childIds: string[];
  status?: UnionStatus;
  year?: number;
}

export interface FamilyTreeData {
  people: Person[];
  unions: Union[];
}

/** Manual position overrides, keyed by node id, applied on top of the auto-layout. */
export type PositionOverrides = Record<string, { x: number; y: number }>;

export function fullName(person: Person): string {
  return `${person.firstName} ${person.lastName}`.trim();
}

export function lifespan(person: Person): string {
  const { birthYear, deathYear } = person;
  if (birthYear === undefined && deathYear === undefined) return "";
  if (deathYear === undefined) return `b. ${birthYear}`;
  if (birthYear === undefined) return `d. ${deathYear}`;
  return `${birthYear} – ${deathYear}`;
}
