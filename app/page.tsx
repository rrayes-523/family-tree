import FamilyTree from "./components/family-tree";

export default function Home() {
  return (
    // React Flow sizes itself to 100% of its parent, so the column needs a
    // definite height to resolve against — flex-1 alone collapses it to zero.
    <div className="flex h-dvh flex-col">
      <header className="flex items-baseline gap-3 border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <h1 className="text-lg font-semibold tracking-tight">Family Tree</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Click a person for details · drag to rearrange
        </p>
      </header>
      <main className="relative min-h-0 flex-1">
        <FamilyTree />
      </main>
    </div>
  );
}
