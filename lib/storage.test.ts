import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { seedData } from "./seed";
import {
  STORAGE_KEY,
  STORAGE_VERSION,
  clearFamilyState,
  freshSeedState,
  loadFamilyState,
  saveFamilyState,
} from "./storage";
import type { FamilyTreeData } from "./types";

const LEGACY_FAMILY_KEY = "family-tree:data:v1";
const LEGACY_POSITIONS_KEY = "family-tree:positions:v1";

/** Enough of the Storage interface for this module; no DOM dependency needed. */
function createLocalStorage() {
  const entries = new Map<string, string>();
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => void entries.set(key, String(value)),
    removeItem: (key: string) => void entries.delete(key),
    clear: () => entries.clear(),
  };
}

let storage: ReturnType<typeof createLocalStorage>;

beforeEach(() => {
  storage = createLocalStorage();
  vi.stubGlobal("window", { localStorage: storage });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Writes a payload straight past the API, as a corrupt browser would hold it. */
const putRaw = (value: unknown) =>
  storage.setItem(STORAGE_KEY, JSON.stringify(value));

const readRaw = () => JSON.parse(storage.getItem(STORAGE_KEY)!);

const simpleFamily = (): FamilyTreeData => ({
  people: [
    { id: "x", firstName: "Ada", lastName: "Byron", sex: "female" },
    { id: "y", firstName: "Bo", lastName: "Byron", sex: "other" },
  ],
  unions: [{ id: "u", partnerIds: ["x", "y"], childIds: [], status: "married" }],
});

describe("loading with nothing stored", () => {
  it("returns the seed family", () => {
    const { family } = loadFamilyState();

    expect(family.people).toHaveLength(seedData.people.length);
    expect(family.unions).toHaveLength(seedData.unions.length);
  });

  it("returns no position overrides", () => {
    expect(loadFamilyState().positions).toEqual({});
  });

  it("does not hand out the imported seed object", () => {
    const { family } = loadFamilyState();

    expect(family).toEqual(seedData);
    expect(family).not.toBe(seedData);
    expect(family.people).not.toBe(seedData.people);
    expect(family.people[0]).not.toBe(seedData.people[0]);
    expect(family.unions[0].childIds).not.toBe(seedData.unions[0].childIds);
  });

  it("does not let one load's edits reach the next", () => {
    const first = loadFamilyState();
    first.family.people.push({
      id: "intruder",
      firstName: "Should",
      lastName: "Vanish",
      sex: "other",
    });
    first.family.unions[0].childIds.push("intruder");

    const second = loadFamilyState();

    expect(second.family.people.map((p) => p.id)).not.toContain("intruder");
    expect(second.family.unions[0].childIds).not.toContain("intruder");
    expect(seedData.people.map((p) => p.id)).not.toContain("intruder");
    expect(seedData.unions[0].childIds).not.toContain("intruder");
  });
});

describe("round trips", () => {
  it("restores a saved family", () => {
    const family = simpleFamily();
    saveFamilyState({ family, positions: {} });

    expect(loadFamilyState().family).toEqual(family);
  });

  it("restores saved position overrides", () => {
    saveFamilyState({
      family: simpleFamily(),
      positions: { x: { x: 10, y: 20 } },
    });

    expect(loadFamilyState().positions).toEqual({ x: { x: 10, y: 20 } });
  });

  it("restores family and positions together", () => {
    const family = simpleFamily();
    const positions = { x: { x: 1, y: 2 }, y: { x: 3, y: 4 } };
    saveFamilyState({ family, positions });

    const restored = loadFamilyState();

    expect(restored.family).toEqual(family);
    expect(restored.positions).toEqual(positions);
  });

  it("survives repeated reloads unchanged", () => {
    const family = simpleFamily();
    saveFamilyState({ family, positions: { x: { x: 5, y: 6 } } });

    const once = loadFamilyState();
    const twice = loadFamilyState();

    expect(twice).toEqual(once);
    expect(twice.family).toEqual(family);
  });

  it("stamps the payload with the current version", () => {
    saveFamilyState({ family: simpleFamily(), positions: {} });

    expect(readRaw().version).toBe(STORAGE_VERSION);
  });

  it("writes family and positions to one key, so neither can clobber the other", () => {
    saveFamilyState({ family: simpleFamily(), positions: { x: { x: 7, y: 8 } } });

    const payload = readRaw();
    expect(payload.family).toBeDefined();
    expect(payload.positions).toBeDefined();
  });
});

describe("falling back safely", () => {
  const expectSeed = () => {
    const { family } = loadFamilyState();
    expect(family.people).toHaveLength(seedData.people.length);
    expect(family).not.toBe(seedData);
  };

  it("falls back when the stored value is not JSON", () => {
    storage.setItem(STORAGE_KEY, "{ this is not json");
    expectSeed();
  });

  it("falls back when the payload is not an object", () => {
    putRaw("a string");
    expectSeed();
  });

  it("falls back on an unsupported future version", () => {
    putRaw({ version: 99, family: simpleFamily(), positions: {} });
    expectSeed();
  });

  it("falls back when the version is missing", () => {
    putRaw({ family: simpleFamily(), positions: {} });
    expectSeed();
  });

  it("falls back when people is not an array", () => {
    putRaw({ version: 1, family: { people: "nope", unions: [] }, positions: {} });
    expectSeed();
  });

  it("falls back when unions is missing", () => {
    putRaw({ version: 1, family: { people: [] }, positions: {} });
    expectSeed();
  });

  it("falls back when a person has no usable id", () => {
    putRaw({
      version: 1,
      family: {
        people: [{ id: "  ", firstName: "No", lastName: "Id", sex: "other" }],
        unions: [],
      },
      positions: {},
    });
    expectSeed();
  });

  it("falls back when a union's partnerIds is not an array", () => {
    putRaw({
      version: 1,
      family: {
        people: [],
        unions: [{ id: "u", partnerIds: "x", childIds: [] }],
      },
      positions: {},
    });
    expectSeed();
  });

  it("falls back when two records share an id", () => {
    putRaw({
      version: 1,
      family: {
        people: [
          { id: "dup", firstName: "One", lastName: "A", sex: "other" },
          { id: "dup", firstName: "Two", lastName: "B", sex: "other" },
        ],
        unions: [],
      },
      positions: {},
    });
    expectSeed();
  });

  it("never returns half a family", () => {
    // One bad record must not leave the readable people behind on their own.
    putRaw({
      version: 1,
      family: {
        people: [
          { id: "ok", firstName: "Fine", lastName: "Person", sex: "other" },
          { id: 42, firstName: "Broken", lastName: "Person", sex: "other" },
        ],
        unions: [],
      },
      positions: {},
    });

    expect(loadFamilyState().family.people.map((p) => p.id)).not.toContain("ok");
  });
});

describe("malformed positions", () => {
  it("keeps the family and drops only the bad overrides", () => {
    const family = simpleFamily();
    putRaw({
      version: 1,
      family,
      positions: {
        good: { x: 1, y: 2 },
        missingY: { x: 3 },
        stringly: { x: "3", y: "4" },
        nan: { x: Number.NaN, y: 0 },
        nested: null,
      },
    });

    const restored = loadFamilyState();

    expect(restored.family).toEqual(family);
    expect(restored.positions).toEqual({ good: { x: 1, y: 2 } });
  });

  it("does not crash when positions is not an object", () => {
    const family = simpleFamily();
    putRaw({ version: 1, family, positions: "nope" });

    const restored = loadFamilyState();

    expect(restored.family).toEqual(family);
    expect(restored.positions).toEqual({});
  });
});

describe("clearFamilyState", () => {
  it("returns the next load to seed data", () => {
    saveFamilyState({ family: simpleFamily(), positions: { x: { x: 1, y: 1 } } });
    expect(loadFamilyState().family.people).toHaveLength(2);

    clearFamilyState();
    const restored = loadFamilyState();

    expect(restored.family.people).toHaveLength(seedData.people.length);
    expect(restored.positions).toEqual({});
    expect(restored.family).not.toBe(seedData);
  });

  it("removes the stored payload entirely", () => {
    saveFamilyState({ family: simpleFamily(), positions: {} });
    clearFamilyState();

    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe("pre-release keys", () => {
  it("adopts an old family and its positions, then removes the old keys", () => {
    const family = simpleFamily();
    storage.setItem(LEGACY_FAMILY_KEY, JSON.stringify(family));
    storage.setItem(LEGACY_POSITIONS_KEY, JSON.stringify({ x: { x: 9, y: 9 } }));

    const restored = loadFamilyState();

    expect(restored.family).toEqual(family);
    expect(restored.positions).toEqual({ x: { x: 9, y: 9 } });
    expect(storage.getItem(LEGACY_FAMILY_KEY)).toBeNull();
    expect(storage.getItem(LEGACY_POSITIONS_KEY)).toBeNull();
    expect(readRaw().version).toBe(STORAGE_VERSION);
  });

  it("keeps old positions even when only positions were stored", () => {
    storage.setItem(LEGACY_POSITIONS_KEY, JSON.stringify({ p1: { x: 4, y: 5 } }));

    const restored = loadFamilyState();

    expect(restored.positions).toEqual({ p1: { x: 4, y: 5 } });
    expect(restored.family.people).toHaveLength(seedData.people.length);
  });

  it("does not crash on an old key holding rubbish", () => {
    storage.setItem(LEGACY_FAMILY_KEY, "not json at all");

    const restored = loadFamilyState();

    expect(restored.family.people).toHaveLength(seedData.people.length);
    expect(restored.positions).toEqual({});
  });

  it("ignores old keys once a current payload exists", () => {
    const family = simpleFamily();
    saveFamilyState({ family, positions: {} });
    storage.setItem(LEGACY_FAMILY_KEY, JSON.stringify({ people: [], unions: [] }));

    expect(loadFamilyState().family).toEqual(family);
  });
});

describe("server rendering", () => {
  it("returns seed data without touching storage", () => {
    vi.unstubAllGlobals();

    const { family, positions } = loadFamilyState();

    expect(family.people).toHaveLength(seedData.people.length);
    expect(positions).toEqual({});
  });

  it("saving is a no-op rather than a crash", () => {
    vi.unstubAllGlobals();

    expect(() => saveFamilyState(freshSeedState())).not.toThrow();
    expect(() => clearFamilyState()).not.toThrow();
  });
});
