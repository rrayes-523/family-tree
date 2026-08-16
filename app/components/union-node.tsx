"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { memo } from "react";
import { UNION_SIZE, type UnionFlowNode } from "@/lib/layout";

const HIDDEN_HANDLE = {
  width: 1,
  height: 1,
  minWidth: 1,
  minHeight: 1,
  border: "none",
  background: "transparent",
  opacity: 0,
} as const;

/**
 * The small marker where a couple's lines meet and their children hang from.
 * Not a person — it just gives the edges a shared anchor point.
 */
function UnionNode({ data }: NodeProps<UnionFlowNode>) {
  const { union } = data;
  const label = union.year
    ? `${union.status ?? "union"} ${union.year}`
    : (union.status ?? "union");

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
        className={`h-2.5 w-2.5 rounded-full border-2 ${
          union.status === "divorced"
            ? "border-zinc-300 bg-white dark:border-zinc-600 dark:bg-zinc-900"
            : "border-zinc-400 bg-zinc-400 dark:border-zinc-500 dark:bg-zinc-500"
        }`}
        aria-hidden
      />
    </div>
  );
}

export default memo(UnionNode);
