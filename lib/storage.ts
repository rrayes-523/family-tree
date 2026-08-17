import { seedData } from "./seed";
import type { FamilyTreeData, PositionOverrides } from "./types";

/**
 * Persistence boundary.
 *
 * localStorage is infrastructure, not architecture: it is the temporary
 * implementation behind these four functions. Swapping it for a real backend
 * means rewriting this module and nothing else — no domain module imports it,
 * and no caller outside it touches `window`.
 *
 * Family data and positions live in one versioned payload under one key. They
 * are written together so a position save can never race with, or clobber, a
 * newer family document.
 */

export const STORAGE_KEY = "family-tree:state";
export const STORAGE_VERSION = 1;

// Pre-release keys from before the payload was versioned: a bare
// FamilyTreeData and a bare PositionOverrides, each under its own key.
const LEGACY_FAMILY_KEY = "family-tree:data:v1";
const LEGACY_POSITIONS_KEY = "family-tree:positions:v1";

/**
 * What callers work with. The on-disk `version` stays inside this module —
 * consumers should never have to think about the wire format.
 */
export interface FamilyState {
  family: FamilyTreeData;
  positions: PositionOverrides;
}

// ---------------------------------------------------------------------------
// Browser access — the only place `window` is touched
// ---------------------------------------------------------------------------

function hasKey(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

function readRaw(key: string): unknown {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    // Absent, blocked, or not JSON at all.
    return null;
  }
}

function writeRaw(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded or storage disabled; the in-memory tree still works.
  }
}

function removeRaw(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to do — the caller only wanted it gone.
  }
}

// ---------------------------------------------------------------------------
// Runtime validation
//
// Stored JSON is untrusted: it may be hand-edited, half-written, or left over
// from an older build. Nothing parsed here is assumed to match its TypeScript
// type until checked.
// ---------------------------------------------------------------------------

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isId(value: unknown): boolean {
  return typeof value === "string" && value.trim() !== "";
}

function isStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isPersonLike(value: unknown): boolean {
  return (
    isObject(value) &&
    isId(value.id) &&
    typeof value.firstName === "string" &&
    typeof value.lastName === "string"
  );
}

function isUnionLike(value: unknown): boolean {
  return (
    isObject(value) &&
    isId(value.id) &&
    isStringArray(value.partnerIds) &&
    isStringArray(value.childIds)
  );
}

/**
 * Genealogy is validated all-or-nothing. Salvaging the readable half of a
 * damaged family would silently produce a document that looks fine but has
 * lost people — better to fall back to the seed than to show a quiet lie.
 *
 * This checks structure only. Domain rules (no cycles, one parental union per
 * person, and so on) belong to family-operations, not to deserialization.
 */
function readFamily(value: unknown): FamilyTreeData | null {
  if (!isObject(value)) return null;

  const { people, unions } = value;
  if (!Array.isArray(people) || !Array.isArray(unions)) return null;
  if (!people.every(isPersonLike)) return null;
  if (!unions.every(isUnionLike)) return null;

  // Duplicate ids make the document ill-formed rather than merely incomplete:
  // two records would collapse onto one node and edges would attach to
  // whichever happened to be first.
  const seen = new Set<string>();
  for (const entry of [...people, ...unions] as { id: string }[]) {
    if (seen.has(entry.id)) return null;
    seen.add(entry.id);
  }

  return { people, unions } as FamilyTreeData;
}

/**
 * Positions are validated leniently, entry by entry. They are cosmetic, and
 * each one is independent, so a single corrupt override should cost that one
 * node's placement — never the family document it sits beside.
 */
function readPositions(value: unknown): PositionOverrides {
  if (!isObject(value)) return {};

  const positions: PositionOverrides = {};
  for (const [id, position] of Object.entries(value)) {
    if (!isObject(position)) continue;
    const { x, y } = position;
    if (typeof x !== "number" || !Number.isFinite(x)) continue;
    if (typeof y !== "number" || !Number.isFinite(y)) continue;
    positions[id] = { x, y };
  }
  return positions;
}

function readState(value: unknown): FamilyState | null {
  if (!isObject(value)) return null;

  // The version is checked before anything else is read, so an unsupported
  // payload is rejected deliberately rather than partly interpreted as current.
  if (value.version !== STORAGE_VERSION) return null;

  const family = readFamily(value.family);
  if (!family) return null;

  return { family, positions: readPositions(value.positions) };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * An independent copy of the seed family, safe to edit. `seedData` is an
 * imported module constant — handing it out directly would let one session's
 * edits leak into every later load.
 */
export function freshSeedState(): FamilyState {
  return { family: structuredClone(seedData), positions: {} };
}

/**
 * Folds the pre-release keys into the current payload, keeping whatever was
 * readable, then removes them. Called only when no current payload exists.
 */
function migrateLegacyState(): FamilyState | null {
  const hasLegacy = hasKey(LEGACY_FAMILY_KEY) || hasKey(LEGACY_POSITIONS_KEY);
  if (!hasLegacy) return null;

  const state: FamilyState = {
    family: readFamily(readRaw(LEGACY_FAMILY_KEY)) ?? structuredClone(seedData),
    positions: readPositions(readRaw(LEGACY_POSITIONS_KEY)),
  };

  saveFamilyState(state);
  removeRaw(LEGACY_FAMILY_KEY);
  removeRaw(LEGACY_POSITIONS_KEY);
  return state;
}

/**
 * The family to render. Always returns something usable: anything missing,
 * malformed, or from an unsupported version falls back to a fresh seed copy.
 */
export function loadFamilyState(): FamilyState {
  if (hasKey(STORAGE_KEY)) {
    return readState(readRaw(STORAGE_KEY)) ?? freshSeedState();
  }
  return migrateLegacyState() ?? freshSeedState();
}

/** Writes family and positions together, stamped with the current version. */
export function saveFamilyState(state: FamilyState): void {
  writeRaw(STORAGE_KEY, {
    version: STORAGE_VERSION,
    family: state.family,
    positions: state.positions,
  });
}

/**
 * Discards every persisted change, including manual positions, so the next
 * load starts from a fresh copy of the seed family.
 */
export function clearFamilyState(): void {
  removeRaw(STORAGE_KEY);
  removeRaw(LEGACY_FAMILY_KEY);
  removeRaw(LEGACY_POSITIONS_KEY);
}
