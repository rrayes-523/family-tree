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
import {
  FamilyDataError,
  createPerson,
  updatePerson,
} from "@/lib/family-operations";
import { toFormValues } from "@/lib/person-form";
import { loadFamilyState, saveFamilyState } from "@/lib/storage";
import type {
  FamilyTreeData,
  Person,
  PersonDraft,
  PositionOverrides,
} from "@/lib/types";

import Dialog from "./dialog";
import PersonDetails from "./person-details";
import PersonForm from "./person-form";
import PersonNode from "./person-node";
import UnionNode from "./union-node";

/** Which editor is open, if any. Closed means no pending changes exist. */
type Editor = { mode: "add" } | { mode: "edit"; person: Person };

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
  // Safe to touch storage in an initialiser: this component only ever mounts
  // after hydration (see FamilyTree below). The state returned is always
  // usable — a fresh seed copy if nothing valid was persisted.
  const [restored] = useState(loadFamilyState);

  // The family is the authoritative genealogy; nodes and edges below are only
  // a projection of it, rebuilt whenever it changes.
  const [family, setFamily] = useState(restored.family);
  const [positions, setPositions] = useState(restored.positions);
  const [initial] = useState(() => layoutTree(restored.family, restored.positions));

  const [nodes, setNodes] = useState<FamilyFlowNode[]>(initial.nodes);
  const [edges, setEdges] = useState<Edge[]>(initial.edges);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [editorError, setEditorError] = useState<string | undefined>();

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
      // Family and positions are written together, so persisting a drag can
      // never overwrite the family document beside it.
      const next = { ...positions, ...moved };
      setPositions(next);
      saveFamilyState({ family, positions: next });
    },
    [family, positions],
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

  /**
   * The single path by which family data changes: replace the document,
   * re-project it to nodes and edges, and persist it alongside the existing
   * manual positions so a structural edit never wipes someone's layout.
   */
  const commitFamily = useCallback(
    (nextFamily: FamilyTreeData, selectId?: string) => {
      const projected = layoutTree(nextFamily, positions);
      const nextNodes = selectId
        ? projected.nodes.map((node) =>
            node.selected === (node.id === selectId)
              ? node
              : { ...node, selected: node.id === selectId },
          )
        : projected.nodes;

      setFamily(nextFamily);
      setNodes(nextNodes);
      setEdges(projected.edges);
      saveFamilyState({ family: nextFamily, positions });

      if (selectId) {
        setSelectedId(selectId);
        // Read the position from the projection just built: React Flow's own
        // store has not seen these nodes yet, so getNode would come back empty.
        const node = projected.nodes.find((candidate) => candidate.id === selectId);
        if (node) {
          setCenter(
            node.position.x + NODE_WIDTH / 2,
            node.position.y + NODE_HEIGHT / 2,
            { zoom: 1, duration: 500 },
          );
        }
      }
    },
    [positions, setCenter],
  );

  const closeEditor = useCallback(() => {
    // Cancelling touches neither the family nor storage — the draft only ever
    // existed in the form's own state.
    setEditor(null);
    setEditorError(undefined);
  }, []);

  const submitEditor = useCallback(
    (draft: PersonDraft) => {
      if (!editor) return;
      try {
        if (editor.mode === "add") {
          const { data, personId } = createPerson(family, draft);
          commitFamily(data, personId);
        } else {
          commitFamily(updatePerson(family, editor.person.id, draft), editor.person.id);
        }
        setEditor(null);
        setEditorError(undefined);
      } catch (error) {
        // Domain rejections are expected input problems, not crashes. Anything
        // else is a real bug and is left to surface.
        if (error instanceof FamilyDataError) {
          setEditorError(error.message);
          return;
        }
        throw error;
      }
    },
    [commitFamily, editor, family],
  );

  const resetLayout = useCallback(() => {
    // Clears manual placement only — the family document is left untouched.
    setPositions({});
    saveFamilyState({ family, positions: {} });
    const fresh = layoutTree(family, {});
    setNodes(fresh.nodes);
    setEdges(fresh.edges);
    // Let the new positions land before framing them.
    requestAnimationFrame(() => void fitView({ padding: 0.15, duration: 500 }));
  }, [family, fitView]);

  const selectedPerson = useMemo(
    () => (selectedId ? family.people.find((p) => p.id === selectedId) : undefined),
    [family.people, selectedId],
  );

  return (
    <>
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
            onClick={() => {
              setEditorError(undefined);
              setEditor({ mode: "add" });
            }}
            className="rounded-md bg-zinc-900 px-2 py-1 font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Add person
          </button>
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
              data={family}
              person={selectedPerson}
              onSelect={focusPerson}
              onEdit={(person) => {
                setEditorError(undefined);
                setEditor({ mode: "edit", person });
              }}
              onClose={() => setSelectedId(null)}
            />
          </Panel>
        )}
      </ReactFlow>

      {/* Outside the flow so the overlay never competes with pane interactions. */}
      {editor && (
        <Dialog
          title={editor.mode === "add" ? "Add person" : "Edit person"}
          onClose={closeEditor}
        >
          <PersonForm
            initialValues={
              editor.mode === "edit" ? toFormValues(editor.person) : undefined
            }
            submitLabel={editor.mode === "add" ? "Add person" : "Save changes"}
            formError={editorError}
            onSubmit={submitEditor}
            onCancel={closeEditor}
          />
        </Dialog>
      )}
    </>
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
