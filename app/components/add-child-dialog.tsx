"use client";

import { useMemo, useState } from "react";

import type { PersonFormErrors } from "@/lib/person-form";
import {
  childCandidates,
  otherParentOptions,
  type PersonChoice,
} from "@/lib/relationship-actions";
import { fullName, type FamilyTreeData, type Person } from "@/lib/types";

import Dialog from "./dialog";
import { Field } from "./person-fields";
import RelativeChooser, {
  EMPTY_CHOOSER,
  toPersonChoice,
  type ChooserState,
} from "./relative-chooser";

interface AddChildDialogProps {
  family: FamilyTreeData;
  parent: Person;
  formError?: string;
  onSubmit: (choice: PersonChoice, otherParentId?: string) => void;
  onCancel: () => void;
}

/** Sentinel for "no second parent recorded", which is a real answer. */
const UNKNOWN = "";

export default function AddChildDialog({
  family,
  parent,
  formError,
  onSubmit,
  onCancel,
}: AddChildDialogProps) {
  const [state, setState] = useState<ChooserState>(EMPTY_CHOOSER);
  const [errors, setErrors] = useState<PersonFormErrors>({});
  const [message, setMessage] = useState<string>();

  const candidates = useMemo(
    () => childCandidates(family, parent.id),
    [family, parent.id],
  );

  const otherParents = useMemo(
    () => otherParentOptions(family, parent.id),
    [family, parent.id],
  );

  // With exactly one candidate other parent the obvious answer is preselected,
  // but the choice stays on screen so the parentage being recorded is never a
  // surprise.
  const [otherParentId, setOtherParentId] = useState<string>(() =>
    otherParents.length === 2 ? (otherParents[0].personId ?? UNKNOWN) : UNKNOWN,
  );

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const result = toPersonChoice(state);
    if (!result.ok) {
      setErrors(result.errors);
      setMessage(result.message);
      return;
    }
    setErrors({});
    setMessage(undefined);
    onSubmit(result.choice, otherParentId === UNKNOWN ? undefined : otherParentId);
  };

  const chosen = otherParents.find(
    (option) => (option.personId ?? UNKNOWN) === otherParentId,
  );

  return (
    <Dialog title={`Add a child for ${fullName(parent)}`} onClose={onCancel}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
        <RelativeChooser
          candidates={candidates}
          state={state}
          errors={errors}
          onChange={setState}
          emptyMessage="Everyone else in the tree already has recorded parents."
        />

        <Field label="Other parent">
          <select
            className="w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-900 outline-none transition-colors focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-500"
            value={otherParentId}
            onChange={(event) => setOtherParentId(event.target.value)}
          >
            {otherParents.map((option) => (
              <option key={option.personId ?? UNKNOWN} value={option.personId ?? UNKNOWN}>
                {option.label}
                {option.detail ? ` — ${option.detail}` : ""}
              </option>
            ))}
          </select>
        </Field>

        <p className="rounded-md bg-zinc-50 px-3 py-2 text-xs leading-relaxed text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-300">
          {chosen?.personId
            ? `Recorded as a child of ${fullName(parent)} and ${chosen.label}.`
            : `Recorded as a child of ${fullName(parent)}, with no second parent.`}
        </p>

        {(message ?? formError) && (
          <p
            role="alert"
            className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"
          >
            {message ?? formError}
          </p>
        )}

        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Add child
          </button>
        </div>
      </form>
    </Dialog>
  );
}
