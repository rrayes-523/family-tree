import type { FamilyTreeData, PositionOverrides } from "./types";

const DATA_KEY = "family-tree:data:v1";
const POSITIONS_KEY = "family-tree:positions:v1";

function read<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    // Unparseable or blocked storage — fall back to defaults rather than crash.
    return null;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded or storage disabled; the in-memory tree still works.
  }
}

function isTreeData(value: unknown): value is FamilyTreeData {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<FamilyTreeData>;
  return Array.isArray(candidate.people) && Array.isArray(candidate.unions);
}

function isOverrides(value: unknown): value is PositionOverrides {
  if (typeof value !== "object" || value === null) return false;
  return Object.values(value).every(
    (v) =>
      typeof v === "object" &&
      v !== null &&
      typeof (v as { x?: unknown }).x === "number" &&
      typeof (v as { y?: unknown }).y === "number",
  );
}

export function loadTree(): FamilyTreeData | null {
  const stored = read<unknown>(DATA_KEY);
  return isTreeData(stored) ? stored : null;
}

export function saveTree(data: FamilyTreeData): void {
  write(DATA_KEY, data);
}

export function loadPositions(): PositionOverrides {
  const stored = read<unknown>(POSITIONS_KEY);
  return isOverrides(stored) ? stored : {};
}

export function savePositions(positions: PositionOverrides): void {
  write(POSITIONS_KEY, positions);
}
