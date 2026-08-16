"use client";

import "@xyflow/react/dist/style.css";

import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type NodeMouseHandler,
  type NodeTypes,
  type OnNodeDrag,
} from "@xyflow/react";
import {
  useCallback,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import {
  NODE_HEIGHT,
  NODE_WIDTH,
  layoutTree,
  repositionUnions,
  type FamilyFlowNode,
} from "@/lib/layout";
import { seedData } from "@/lib/seed";
import { loadPositions, loadTree, savePositions } from "@/lib/storage";
import type { PositionOverrides } from "@/lib/types";

import PersonDetails from "./person-details";
import PersonNode from "./person-node";
import UnionNode from "./union-node";

const nodeTypes: NodeTypes = { person: PersonNode, union: UnionNode };

const legend = [
  { label: "Female", className: "bg-rose-400 dark:bg-rose-500" },
  { label: "Male", className: "bg-sky-400 dark:bg-sky-500" },
  { label: "Other", className: "bg-violet-400 dark:bg-violet-500" },
];

// Nothing to subscribe to — this only flips false → true once React hydrates,
// which is what gates the localStorage reads below.
const neverChanges = () => () => {};
const onClient = () => true;
const onServer = () => false;

function FamilyTreeCanvas() {
  // Safe to touch localStorage in an initialiser: this component only ever
  // mounts after hydration (see FamilyTree below).
  const [data] = useState(() => loadTree() ?? seedData);
  const [initial] = useState(() => layoutTree(data, loadPositions()));

  const [nodes, setNodes] = useState<FamilyFlowNode[]>(initial.nodes);
  const [edges, setEdges] = useState<Edge[]>(initial.edges);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { getNode, setCenter, fitView } = useReactFlow();

  const onNodesChange = useCallback((changes: NodeChange<FamilyFlowNode>[]) => {
    const moved = changes.some((change) => change.type === "position");
    setNodes((current) => {
      const next = applyNodeChanges(changes, current);
      return moved ? repositionUnions(next) : next;
    });
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((current) => applyEdgeChanges(changes, current));
  }, []);

  const onNodeDragStop: OnNodeDrag<FamilyFlowNode> = useCallback(
    (_event, _node, draggedNodes) => {
      const moved: PositionOverrides = {};
      for (const node of draggedNodes) {
        moved[node.id] = { x: node.position.x, y: node.position.y };
      }
      savePositions({ ...loadPositions(), ...moved });
    },
    [],
  );

  const onNodeClick: NodeMouseHandler<FamilyFlowNode> = useCallback(
    (_event, node) => {
      setSelectedId(node.type === "person" ? node.id : null);
    },
    [],
  );

  const focusPerson = useCallback(
    (personId: string) => {
      setSelectedId(personId);
      setNodes((current) =>
        current.map((node) =>
          node.selected === (node.id === personId)
            ? node
            : { ...node, selected: node.id === personId },
        ),
      );
      const node = getNode(personId);
      if (node) {
        setCenter(
          node.position.x + NODE_WIDTH / 2,
          node.position.y + NODE_HEIGHT / 2,
          { zoom: 1, duration: 500 },
        );
      }
    },
    [getNode, setCenter],
  );

  const resetLayout = useCallback(() => {
    savePositions({});
    const fresh = layoutTree(data, {});
    setNodes(fresh.nodes);
    setEdges(fresh.edges);
    // Let the new positions land before framing them.
    requestAnimationFrame(() => void fitView({ padding: 0.15, duration: 500 }));
  }, [data, fitView]);

  const selectedPerson = useMemo(
    () => (selectedId ? data.people.find((p) => p.id === selectedId) : undefined),
    [data.people, selectedId],
  );

  return (
    <ReactFlow<FamilyFlowNode>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeDragStop={onNodeDragStop}
      onNodeClick={onNodeClick}
      onPaneClick={() => setSelectedId(null)}
      nodesConnectable={false}
      edgesFocusable={false}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      minZoom={0.15}
      maxZoom={2}
      defaultEdgeOptions={{ style: { stroke: "#a1a1aa", strokeWidth: 1.5 } }}
      className="bg-zinc-50 dark:bg-zinc-950"
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
      <Controls showInteractive={false} />
      <MiniMap
        pannable
        zoomable
        nodeStrokeWidth={2}
        nodeColor={(node) => (node.type === "union" ? "#d4d4d8" : "#71717a")}
      />

      <Panel
        position="top-left"
        className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white/90 px-3 py-2 text-xs shadow-sm backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/90"
      >
        {legend.map((item) => (
          <span key={item.label} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-sm ${item.className}`} aria-hidden />
            <span className="text-zinc-600 dark:text-zinc-300">{item.label}</span>
          </span>
        ))}
        <span className="h-4 w-px bg-zinc-200 dark:bg-zinc-700" aria-hidden />
        <button
          type="button"
          onClick={resetLayout}
          className="rounded-md px-2 py-1 font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
        >
          Reset layout
        </button>
      </Panel>

      {selectedPerson && (
        <Panel position="top-right" className="!m-4">
          <PersonDetails
            data={data}
            person={selectedPerson}
            onSelect={focusPerson}
            onClose={() => setSelectedId(null)}
          />
        </Panel>
      )}
    </ReactFlow>
  );
}

export default function FamilyTree() {
  // The canvas measures the DOM and restores saved positions from localStorage,
  // so it is held back until hydration. Both renders agree on the placeholder,
  // which keeps the server and client markup identical.
  const hydrated = useSyncExternalStore(neverChanges, onClient, onServer);

  if (!hydrated) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-zinc-400 dark:text-zinc-500">
        Loading family tree…
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <FamilyTreeCanvas />
    </ReactFlowProvider>
  );
}
