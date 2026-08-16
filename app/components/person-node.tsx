"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { memo } from "react";
import {
  NODE_HEIGHT,
  NODE_WIDTH,
  type PersonFlowNode,
} from "@/lib/layout";
import { fullName, lifespan, type Sex } from "@/lib/types";

/** Handles carry the edges; the connection dots themselves stay out of sight. */
const HIDDEN_HANDLE = {
  width: 1,
  height: 1,
  minWidth: 1,
  minHeight: 1,
  border: "none",
  background: "transparent",
  opacity: 0,
} as const;

const accentBySex: Record<Sex, string> = {
  female: "bg-rose-400 dark:bg-rose-500",
  male: "bg-sky-400 dark:bg-sky-500",
  other: "bg-violet-400 dark:bg-violet-500",
};

function PersonNode({ data, selected }: NodeProps<PersonFlowNode>) {
  const { person } = data;
  const years = lifespan(person);
  const deceased = person.deathYear !== undefined;

  return (
    <div
      style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
      className={`group relative flex overflow-hidden rounded-xl border bg-white shadow-sm transition-shadow dark:bg-zinc-900 ${
        selected
          ? "border-zinc-900 shadow-md dark:border-zinc-100"
          : "border-zinc-200 hover:shadow-md dark:border-zinc-700"
      }`}
    >
      <Handle type="target" position={Position.Top} id="top" style={HIDDEN_HANDLE} />
      <Handle type="source" position={Position.Left} id="left" style={HIDDEN_HANDLE} />
      <Handle type="source" position={Position.Right} id="right" style={HIDDEN_HANDLE} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={HIDDEN_HANDLE} />

      <span className={`w-1.5 shrink-0 ${accentBySex[person.sex]}`} aria-hidden />

      <div className="flex min-w-0 flex-col justify-center gap-0.5 px-3 py-2">
        <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {fullName(person)}
        </p>
        {years && (
          <p className="truncate text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
            {deceased && <span aria-hidden>✝ </span>}
            {years}
          </p>
        )}
        {person.birthPlace && (
          <p className="truncate text-xs text-zinc-400 dark:text-zinc-500">
            {person.birthPlace}
          </p>
        )}
      </div>
    </div>
  );
}

export default memo(PersonNode);
