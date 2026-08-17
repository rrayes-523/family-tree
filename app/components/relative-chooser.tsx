"use client";

import {
  EMPTY_PERSON_FORM,
  toPersonDraft,
  type PersonFormErrors,
  type PersonFormValues,
} from "@/lib/person-form";
import type { PersonChoice } from "@/lib/relationship-actions";
import type { Person } from "@/lib/types";

import PersonFields from "./person-fields";
import PersonPicker from "./person-picker";

/** Whether the relative is someone already in the tree or someone new. */
export type ChooserState =
  | { mode: "existing"; personId: string | null }
  | { mode: "new"; values: PersonFormValues };

export const EMPTY_CHOOSER: ChooserState = { mode: "existing", personId: null };

export const NEW_CHOOSER: ChooserState = {
  mode: "new",
  values: EMPTY_PERSON_FORM,
};

export type ChoiceResult =
  | { ok: true; choice: PersonChoice }
  | { ok: false; errors: PersonFormErrors; message?: string };

/**
 * Converts what the chooser holds into a domain-ready choice. Pure, so the
 * "did the user actually pick anyone" rule is testable without rendering.
 */
export function toPersonChoice(state: ChooserState): ChoiceResult {
  if (state.mode === "existing") {
    if (!state.personId) {
      return { ok: false, errors: {}, message: "Choose someone from the list." };
    }
    return { ok: true, choice: { kind: "existing", personId: state.personId } };
  }

  const draft = toPersonDraft(state.values);
  if (!draft.ok) return { ok: false, errors: draft.errors };
  return { ok: true, choice: { kind: "new", draft: draft.draft } };
}

interface RelativeChooserProps {
  candidates: Person[];
  state: ChooserState;
  errors: PersonFormErrors;
  onChange: (state: ChooserState) => void;
  /** Shown when nobody in the tree is a valid choice for this relationship. */
  emptyMessage: string;
}

/**
 * The "someone already here, or someone new" switch shared by every add-a-
 * relative dialog. Selecting an existing person and filling in a new one are
 * kept as separate modes so a half-typed new person can never be confused for
 * a selection.
 */
export default function RelativeChooser({
  candidates,
  state,
  errors,
  onChange,
  emptyMessage,
}: RelativeChooserProps) {
  const tabClass = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
      active
        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
        : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
    }`;

  return (
    <div className="flex flex-col gap-3">
      <div
        role="tablist"
        aria-label="Choose who to connect"
        className="flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800/60"
      >
        <button
          type="button"
          role="tab"
          aria-selected={state.mode === "existing"}
          className={tabClass(state.mode === "existing")}
          onClick={() => onChange(EMPTY_CHOOSER)}
        >
          Someone in the tree
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={state.mode === "new"}
          className={tabClass(state.mode === "new")}
          onClick={() => onChange(NEW_CHOOSER)}
        >
          Create new person
        </button>
      </div>

      {state.mode === "existing" ? (
        <PersonPicker
          people={candidates}
          selectedId={state.personId}
          emptyMessage={emptyMessage}
          onSelect={(personId) => onChange({ mode: "existing", personId })}
        />
      ) : (
        <PersonFields
          values={state.values}
          errors={errors}
          onChange={(key, value) =>
            onChange({ mode: "new", values: { ...state.values, [key]: value } })
          }
        />
      )}
    </div>
  );
}
