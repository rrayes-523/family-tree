"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { memo } from "react";
import { UNION_SIZE, type UnionFlowNode } from "@/lib/layout";
import type { Union } from "@/lib/types";

const HIDDEN_HANDLE = {
  width: 1,
  height: 1,
  minWidth: 1,
  minHeight: 1,
  border: "none",
  background: "transparent",
  opacity: 0,
} as const;

/** Spells out on hover what the marker between two people actually records. */
function unionLabel(union: Union): string {
  if (union.partnerIds.length < 2) return "Parent";

  switch (union.status) {
    case "divorced":
      return union.year ? `Former partners · married ${union.year}` : "Former partners";
    case "married":
      return union.year ? `Married ${union.year}` : "Married";
    case "partners":
      return union.year ? `Partners since ${union.year}` : "Partners";
    default:
      return "Co-parents · no relationship recorded";
  }
}

/** Matches the connector styling: hollow for a divorce, faded for co-parents. */
function markerClass(union: Union): string {
  if (union.status === "divorced") {
    return "border-zinc-300 bg-white dark:border-zinc-600 dark:bg-zinc-900";
  }
  if (union.partnerIds.length >= 2 && union.status === undefined) {
    return "border-zinc-300 bg-zinc-300 dark:border-zinc-600 dark:bg-zinc-600";
  }
  return "border-zinc-400 bg-zinc-400 dark:border-zinc-500 dark:bg-zinc-500";
}

/**
 * The small marker where a couple's lines meet and their children hang from.
 * Not a person — it just gives the edges a shared anchor point.
 */
function UnionNode({ data }: NodeProps<UnionFlowNode>) {
  const { union } = data;
  const label = unionLabel(union);

  return (
    <div
      style={{ width: UNION_SIZE, height: UNION_SIZE }}
      className="relative flex items-center justify-center"
      title={label}
    >
      <Handle type="target" position={Position.Left} id="left" style={HIDDEN_HANDLE} />
      <Handle type="target" position={Position.Right} id="right" style={HIDDEN_HANDLE} />
      <Handle type="target" position={Position.Top} id="top" style={HIDDEN_HANDLE} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={HIDDEN_HANDLE} />

      <span
        className={`h-2.5 w-2.5 rounded-full border-2 ${markerClass(union)}`}
        aria-hidden
      />
    </div>
  );
}

export default memo(UnionNode);
