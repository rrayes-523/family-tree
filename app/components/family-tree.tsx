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
import {
  addChildTo,
  addParentTo,
  addPartnerTo,
  type PersonChoice,
} from "@/lib/relationship-actions";
import { loadFamilyState, saveFamilyState } from "@/lib/storage";
import {
  collapseAllBranches,
  collapseInfoFor,
  revealPathTo,
  visibleFamily,
} from "@/lib/visibility";
import type {
  FamilyTreeData,
  Person,
  PersonDraft,
  PositionOverrides,
} from "@/lib/types";

import AddChildDialog from "./add-child-dialog";
import AddParentDialog from "./add-parent-dialog";
import AddPartnerDialog, { type PartnerDetails } from "./add-partner-dialog";
import { CollapseContext } from "./collapse-context";
import Dialog from "./dialog";
import PersonDetails from "./person-details";
import PersonForm from "./person-form";
import PersonNode from "./person-node";
import UnionNode from "./union-node";

/**
 * Which editor is open, if any. Closed means no pending changes exist — every
 * dialog keeps its draft in its own state until the domain accepts it.
 */
type Editor =
  | { mode: "add" }
  | { mode: "edit"; person: Person }
  | { mode: "parent"; person: Person }
  | { mode: "partner"; person: Person }
  | { mode: "child"; person: Person };

/**
 * Attaches branch-collapse state to the person nodes. Kept out of `layoutTree`
 * so the layout stays a pure function of the family it is handed.
 */
function decorateNodes(
  nodes: FamilyFlowNode[],
  family: FamilyTreeData,
  collapsed: ReadonlySet<string>,
  selectId?: string,
): FamilyFlowNode[] {
  return nodes.map((node) => {
    if (node.type !== "person") return node;
    return {
      ...node,
      selected: selectId === undefined ? node.selected : node.id === selectId,
      data: { ...node.data, ...collapseInfoFor(family, collapsed, node.id) },
    };
  });
}

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

  // Branch collapse is view state: it is deliberately not persisted and never
  // reaches the family document. Holding ids rather than one flag is what makes
  // nested collapse survive an ancestor being folded and unfolded.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );

  const [initial] = useState(() => {
    const projected = layoutTree(restored.family, restored.positions);
    return {
      nodes: decorateNodes(projected.nodes, restored.family, new Set<string>()),
      edges: projected.edges,
    };
  });

  const [nodes, setNodes] = useState<FamilyFlowNode[]>(initial.nodes);
  const [edges, setEdges] = useState<Edge[]>(initial.edges);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [editorError, setEditorError] = useState<string | undefined>();

  const { setCenter, fitView } = useReactFlow();

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

  /**
   * Rebuilds the canvas from the authoritative document plus the current view
   * state. Everything that changes either one goes through here, so the graph
   * can never drift from the family it is meant to be showing.
   *
   * Hidden people are removed before layout runs, which is why a collapsed
   * branch leaves no blank space behind — the layout simply never sees them.
   */
  const project = useCallback(
    (
      nextFamily: FamilyTreeData,
      nextCollapsed: ReadonlySet<string>,
      nextPositions: PositionOverrides,
      selectId?: string,
    ) => {
      const projected = layoutTree(
        visibleFamily(nextFamily, nextCollapsed),
        nextPositions,
      );
      const decorated = decorateNodes(
        projected.nodes,
        nextFamily,
        nextCollapsed,
        selectId,
      );

      setNodes(decorated);
      setEdges(projected.edges);

      if (selectId) {
        setSelectedId(selectId);
        // Read the position from the projection just built: React Flow's own
        // store has not seen these nodes yet, so getNode would come back empty.
        const node = decorated.find((candidate) => candidate.id === selectId);
        if (node) {
          setCenter(
            node.position.x + NODE_WIDTH / 2,
            node.position.y + NODE_HEIGHT / 2,
            { zoom: 1, duration: 500 },
          );
        }
      }
    },
    [setCenter],
  );

  /**
   * Focuses anyone, including someone currently folded away: the branches
   * hiding them are opened first, so navigation is never told "not found" for
   * what is only a view-state decision.
   */
  const focusPerson = useCallback(
    (personId: string) => {
      const revealed = revealPathTo(family, collapsed, personId);
      if (revealed.size !== collapsed.size) setCollapsed(revealed);
      project(family, revealed, positions, personId);
    },
    [collapsed, family, positions, project],
  );

  const toggleCollapse = useCallback(
    (personId: string) => {
      const next = new Set(collapsed);
      if (!next.delete(personId)) next.add(personId);
      setCollapsed(next);
      project(family, next, positions);
    },
    [collapsed, family, positions, project],
  );

  const collapseAll = useCallback(() => {
    const next = collapseAllBranches(family);
    setCollapsed(next);
    project(family, next, positions);
    requestAnimationFrame(() => void fitView({ padding: 0.15, duration: 400 }));
  }, [family, fitView, positions, project]);

  const expandAll = useCallback(() => {
    const next = new Set<string>();
    setCollapsed(next);
    project(family, next, positions);
    requestAnimationFrame(() => void fitView({ padding: 0.15, duration: 400 }));
  }, [family, fitView, positions, project]);

  /**
   * The single path by which family data changes: replace the document,
   * re-project it, and persist it alongside the existing manual positions so a
   * structural edit never wipes someone's layout.
   *
   * `reveal` opens only the branches hiding that person, so the result of an
   * edit is always visible without throwing away the rest of the user's
   * collapse state.
   */
  const commitFamily = useCallback(
    (
      nextFamily: FamilyTreeData,
      options: { select?: string; reveal?: string } = {},
    ) => {
      const { select, reveal } = options;

      const nextCollapsed = reveal
        ? revealPathTo(nextFamily, collapsed, reveal)
        : collapsed;
      if (nextCollapsed.size !== collapsed.size) setCollapsed(nextCollapsed);

      setFamily(nextFamily);
      saveFamilyState({ family: nextFamily, positions });
      project(nextFamily, nextCollapsed, positions, select);
    },
    [collapsed, positions, project],
  );

  /**
   * Runs a relationship action and commits only if it succeeds. The action
   * builds a candidate document — including any brand-new person — and a
   * rejection discards that document whole, so a failed step can never leave a
   * person behind who was created only to be related.
   */
  const runRelationship = useCallback(
    (action: () => { data: FamilyTreeData; personId: string }, keepSelected: string) => {
      try {
        const { data, personId } = action();
        commitFamily(data, { select: keepSelected, reveal: personId });
        setEditor(null);
        setEditorError(undefined);
      } catch (error) {
        if (error instanceof FamilyDataError) {
          setEditorError(error.message);
          return;
        }
        throw error;
      }
    },
    [commitFamily],
  );

  const openEditor = useCallback((next: Editor) => {
    setEditorError(undefined);
    setEditor(next);
  }, []);

  const closeEditor = useCallback(() => {
    // Cancelling touches neither the family nor storage — the draft only ever
    // existed in the dialog's own state.
    setEditor(null);
    setEditorError(undefined);
  }, []);

  const submitParent = useCallback(
    (childId: string, choice: PersonChoice) =>
      // The child stays selected; the new parent is what must become visible.
      runRelationship(() => addParentTo(family, childId, choice), childId),
    [family, runRelationship],
  );

  const submitPartner = useCallback(
    (personId: string, choice: PersonChoice, details: PartnerDetails) =>
      runRelationship(
        () => addPartnerTo(family, personId, choice, details.status, details.year),
        personId,
      ),
    [family, runRelationship],
  );

  const submitChild = useCallback(
    (parentId: string, choice: PersonChoice, otherParentId?: string) =>
      runRelationship(
        () => addChildTo(family, parentId, choice, otherParentId),
        parentId,
      ),
    [family, runRelationship],
  );

  const submitEditor = useCallback(
    (draft: PersonDraft) => {
      if (!editor) return;
      try {
        if (editor.mode === "add") {
          const { data, personId } = createPerson(family, draft);
          commitFamily(data, { select: personId, reveal: personId });
        } else if (editor.mode === "edit") {
          commitFamily(updatePerson(family, editor.person.id, draft), {
            select: editor.person.id,
          });
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
    // Clears manual placement only — the family document and what is currently
    // folded away are both left untouched.
    setPositions({});
    saveFamilyState({ family, positions: {} });
    project(family, collapsed, {});
    // Let the new positions land before framing them.
    requestAnimationFrame(() => void fitView({ padding: 0.15, duration: 500 }));
  }, [collapsed, family, fitView, project]);

  const selectedPerson = useMemo(
    () => (selectedId ? family.people.find((p) => p.id === selectedId) : undefined),
    [family.people, selectedId],
  );

  return (
    <CollapseContext.Provider value={toggleCollapse}>
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
            onClick={() => openEditor({ mode: "add" })}
            className="rounded-md bg-zinc-900 px-2 py-1 font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Add person
          </button>
          <button
            type="button"
            onClick={collapseAll}
            className="rounded-md px-2 py-1 font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
          >
            Collapse all
          </button>
          <button
            type="button"
            onClick={expandAll}
            className="rounded-md px-2 py-1 font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
          >
            Expand all
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
              onEdit={(person) => openEditor({ mode: "edit", person })}
              onAddParent={(person) => openEditor({ mode: "parent", person })}
              onAddPartner={(person) => openEditor({ mode: "partner", person })}
              onAddChild={(person) => openEditor({ mode: "child", person })}
              onClose={() => setSelectedId(null)}
            />
          </Panel>
        )}
      </ReactFlow>

      {/* Outside the flow so the overlay never competes with pane interactions. */}
      {(editor?.mode === "add" || editor?.mode === "edit") && (
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

      {editor?.mode === "parent" && (
        <AddParentDialog
          family={family}
          child={editor.person}
          formError={editorError}
          onSubmit={(choice) => submitParent(editor.person.id, choice)}
          onCancel={closeEditor}
        />
      )}

      {editor?.mode === "partner" && (
        <AddPartnerDialog
          family={family}
          person={editor.person}
          formError={editorError}
          onSubmit={(choice, details) =>
            submitPartner(editor.person.id, choice, details)
          }
          onCancel={closeEditor}
        />
      )}

      {editor?.mode === "child" && (
        <AddChildDialog
          family={family}
          parent={editor.person}
          formError={editorError}
          onSubmit={(choice, otherParentId) =>
            submitChild(editor.person.id, choice, otherParentId)
          }
          onCancel={closeEditor}
        />
      )}
    </CollapseContext.Provider>
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
