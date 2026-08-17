"use client";

import { createContext, useContext } from "react";

/**
 * Lets a person node ask for its branch to be folded without the callback
 * riding along in node data, where it would go stale every time the projection
 * is rebuilt.
 */
export const CollapseContext = createContext<(personId: string) => void>(() => {});

export function useToggleCollapse() {
  return useContext(CollapseContext);
}
