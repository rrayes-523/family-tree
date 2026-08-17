"use client";

import { useMemo } from "react";
import { relationsOf } from "@/lib/relations";
import { canAddParent as canAddParentTo } from "@/lib/relationship-actions";
import {
  fullName,
  lifespan,
  type FamilyTreeData,
  type Person,
  type Union,
} from "@/lib/types";

/**
 * How a declared relationship reads next to a name. Divorced partners stay in
 * the partners list and are marked former, rather than being demoted to
 * co-parents — the couple was real, it just ended.
 */
function partnerNote(union: Union): string {
  switch (union.status) {
    case "divorced":
      return "former partner";
    case "married":
      return union.year ? `married ${union.year}` : "married";
    case "partners":
      return union.year ? `together since ${union.year}` : "";
    default:
      return "";
  }
}

interface PersonDetailsProps {
  data: FamilyTreeData;
  person: Person;
  onSelect: (personId: string) => void;
  onEdit: (person: Person) => void;
  onAddParent: (person: Person) => void;
  onAddPartner: (person: Person) => void;
  onAddChild: (person: Person) => void;
  onClose: () => void;
}

/** The "+ Add …" affordance under each relationship section. */
function AddRelativeButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="self-start rounded-md px-2 py-1 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
    >
      {label}
    </button>
  );
}

function RelationList({
  title,
  hint,
  people,
  onSelect,
  suffixes,
}: {
  title: string;
  hint?: string;
  people: Person[];
  onSelect: (personId: string) => void;
  suffixes?: Record<string, string>;
}) {
  if (people.length === 0) return null;

  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
        {title}
      </h3>
      {hint && (
        <p className="text-xs leading-snug text-zinc-400 dark:text-zinc-500">
          {hint}
        </p>
      )}
      <ul className="flex flex-col">
        {people.map((person) => (
          <li key={person.id}>
            <button
              type="button"
              onClick={() => onSelect(person.id)}
              className="w-full rounded-md px-2 py-1 text-left text-sm text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {fullName(person)}
              {suffixes?.[person.id] && (
                <span className="ml-1.5 text-xs text-zinc-400 dark:text-zinc-500">
                  {suffixes[person.id]}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function PersonDetails({
  data,
  person,
  onSelect,
  onEdit,
  onAddParent,
  onAddPartner,
  onAddChild,
  onClose,
}: PersonDetailsProps) {
  const relations = useMemo(() => relationsOf(data, person.id), [data, person.id]);
  // A person descends from at most one union, so two parents is the ceiling.
  const canAddParent = useMemo(() => canAddParentTo(data, person.id), [data, person.id]);

  const partnerSuffixes = Object.fromEntries(
    relations.partners.map(({ person: partner, union }) => [
      partner.id,
      partnerNote(union),
    ]),
  );

  const years = lifespan(person);

  return (
    <aside className="pointer-events-auto flex w-72 flex-col gap-4 rounded-xl border border-zinc-200 bg-white/95 p-4 shadow-lg backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-zinc-900 dark:text-zinc-50">
            {fullName(person)}
          </h2>
          {person.nickname && (
            <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">
              “{person.nickname}”
            </p>
          )}
          {years && (
            <p className="text-sm tabular-nums text-zinc-500 dark:text-zinc-400">
              {years}
            </p>
          )}
          {person.birthPlace && (
            <p className="truncate text-sm text-zinc-400 dark:text-zinc-500">
              {person.birthPlace}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="shrink-0 rounded-md px-2 py-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        >
          ✕
        </button>
      </header>

      <button
        type="button"
        onClick={() => onEdit(person)}
        className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        Edit person
      </button>

      <div className="flex flex-col gap-1">
        <RelationList
          title="Parents"
          people={relations.parents}
          onSelect={onSelect}
        />
        {canAddParent && (
          <AddRelativeButton
            label="+ Add parent"
            onClick={() => onAddParent(person)}
          />
        )}
      </div>

      <div className="flex flex-col gap-1">
        <RelationList
          title={relations.partners.length > 1 ? "Partners" : "Partner"}
          people={relations.partners.map((p) => p.person)}
          suffixes={partnerSuffixes}
          onSelect={onSelect}
        />
        <AddRelativeButton
          label="+ Add partner"
          onClick={() => onAddPartner(person)}
        />
      </div>
      <RelationList
        title={relations.coParents.length > 1 ? "Co-parents" : "Co-parent"}
        hint="Shares a child. No relationship recorded between them."
        people={relations.coParents.map((p) => p.person)}
        onSelect={onSelect}
      />
      <RelationList
        title="Siblings"
        people={relations.siblings}
        onSelect={onSelect}
      />
      <div className="flex flex-col gap-1">
        <RelationList
          title="Children"
          people={relations.children}
          onSelect={onSelect}
        />
        <AddRelativeButton
          label="+ Add child"
          onClick={() => onAddChild(person)}
        />
      </div>

      {person.notes && (
        <p className="border-t border-zinc-100 pt-3 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
          {person.notes}
        </p>
      )}
    </aside>
  );
}
