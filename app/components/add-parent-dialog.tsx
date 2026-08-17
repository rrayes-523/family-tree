"use client";

import { useMemo, useState } from "react";

import type { PersonFormErrors } from "@/lib/person-form";
import { parentCandidates, type PersonChoice } from "@/lib/relationship-actions";
import { fullName, type FamilyTreeData, type Person } from "@/lib/types";

import Dialog from "./dialog";
import RelativeChooser, {
  EMPTY_CHOOSER,
  toPersonChoice,
  type ChooserState,
} from "./relative-chooser";

interface AddParentDialogProps {
  family: FamilyTreeData;
  child: Person;
  formError?: string;
  onSubmit: (choice: PersonChoice) => void;
  onCancel: () => void;
}

export default function AddParentDialog({
  family,
  child,
  formError,
  onSubmit,
  onCancel,
}: AddParentDialogProps) {
  const [state, setState] = useState<ChooserState>(EMPTY_CHOOSER);
  const [errors, setErrors] = useState<PersonFormErrors>({});
  const [message, setMessage] = useState<string>();

  const candidates = useMemo(
    () => parentCandidates(family, child.id),
    [family, child.id],
  );

  const recordedParents = useMemo(
    () =>
      family.unions.find((union) => union.childIds.includes(child.id))?.partnerIds
        .length ?? 0,
    [family, child.id],
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
    onSubmit(result.choice);
  };

  return (
    <Dialog title={`Add a parent for ${fullName(child)}`} onClose={onCancel}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
        {recordedParents === 1 && (
          <p className="rounded-md bg-zinc-50 px-3 py-2 text-xs leading-relaxed text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-300">
            They will be recorded as a second parent alongside the one already
            known. Sharing a child is not recorded as a relationship between the
            two — add them as partners separately if that is the case.
          </p>
        )}

        <RelativeChooser
          candidates={candidates}
          state={state}
          errors={errors}
          onChange={setState}
          emptyMessage="Nobody else in the tree can be a parent for this person."
        />

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
            Add parent
          </button>
        </div>
      </form>
    </Dialog>
  );
}
