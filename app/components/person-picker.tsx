"use client";

import { useMemo, useState } from "react";

import { searchPeople } from "@/lib/relationship-actions";
import { fullName, lifespan, type Person } from "@/lib/types";

import { fieldClass } from "./person-fields";

interface PersonPickerProps {
  people: Person[];
  selectedId: string | null;
  onSelect: (personId: string) => void;
  emptyMessage: string;
}

/** Enough to tell two people with the same name apart. */
function identifyingDetail(person: Person): string {
  return [person.nickname && `“${person.nickname}”`, lifespan(person), person.birthPlace]
    .filter(Boolean)
    .join(" · ");
}

/**
 * A short searchable list of people. Selecting only reports an id upward —
 * nothing is committed until the surrounding dialog is confirmed.
 */
export default function PersonPicker({
  people,
  selectedId,
  onSelect,
  emptyMessage,
}: PersonPickerProps) {
  const [query, setQuery] = useState("");
  const matches = useMemo(() => searchPeople(people, query), [people, query]);

  if (people.length === 0) {
    return (
      <p className="rounded-md bg-zinc-50 px-3 py-2 text-sm text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        className={fieldClass}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search by name or nickname"
        aria-label="Search people"
        autoComplete="off"
      />

      <ul className="max-h-56 overflow-y-auto rounded-md border border-zinc-200 dark:border-zinc-700">
        {matches.length === 0 && (
          <li className="px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400">
            Nobody matches “{query.trim()}”.
          </li>
        )}
        {matches.map((person) => {
          const detail = identifyingDetail(person);
          const isSelected = person.id === selectedId;
          return (
            <li key={person.id}>
              <button
                type="button"
                onClick={() => onSelect(person.id)}
                aria-pressed={isSelected}
                className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors ${
                  isSelected
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                <span className="text-sm font-medium">{fullName(person)}</span>
                {detail && (
                  <span
                    className={`text-xs ${
                      isSelected
                        ? "text-zinc-300 dark:text-zinc-600"
                        : "text-zinc-500 dark:text-zinc-400"
                    }`}
                  >
                    {detail}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
