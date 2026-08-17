export type Sex = "male" | "female" | "other";

export type UnionStatus = "married" | "partners" | "divorced";

/**
 * The editable fields of a person — everything except their identity. Editing
 * works on a draft so a person's `id` can never be reassigned by a form.
 */
export interface PersonDraft {
  firstName: string;
  lastName: string;
  sex: Sex;
  birthYear?: number;
  deathYear?: number;
  birthPlace?: string;
  notes?: string;
}

export interface Person extends PersonDraft {
  id: string;
}

/**
 * A couple (or a single parent) plus the children that descend from them.
 * Modelling parenthood through a union rather than person-to-person edges keeps
 * siblings grouped and lets the layout hang children off one shared point.
 *
 * `status` carries how much is actually known about the couple:
 * - `"married"` / `"partners"` — a declared relationship;
 * - `"divorced"` — a declared former relationship;
 * - absent with two partners — the two are known co-parents and nothing more.
 *   Sharing a child is never on its own evidence of a partnership;
 * - absent with one partner — a single known parent, second parent unknown.
 */
export interface Union {
  id: string;
  /** One partner for a single parent, two for a couple. */
  partnerIds: string[];
  childIds: string[];
  status?: UnionStatus;
  year?: number;
}

/** Whether a union records an actual relationship rather than co-parenthood. */
export function isDeclaredCouple(union: Union): boolean {
  return union.partnerIds.length >= 2 && union.status !== undefined;
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
