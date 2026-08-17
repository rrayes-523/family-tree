"use client";

import { useState } from "react";

import {
  EMPTY_PERSON_FORM,
  toPersonDraft,
  type PersonFormErrors,
  type PersonFormValues,
} from "@/lib/person-form";
import type { PersonDraft } from "@/lib/types";

import PersonFields from "./person-fields";

interface PersonFormProps {
  /** Pre-filled values when editing; omitted when adding someone new. */
  initialValues?: PersonFormValues;
  submitLabel: string;
  /** Thrown domain errors, surfaced above the buttons rather than crashing. */
  formError?: string;
  onSubmit: (draft: PersonDraft) => void;
  onCancel: () => void;
}

/**
 * Standalone Add/Edit person form. Values live here as strings and only become
 * a `PersonDraft` on submit, so nothing typed reaches the family data until it
 * validates.
 */
export default function PersonForm({
  initialValues,
  submitLabel,
  formError,
  onSubmit,
  onCancel,
}: PersonFormProps) {
  const [values, setValues] = useState<PersonFormValues>(
    initialValues ?? EMPTY_PERSON_FORM,
  );
  const [errors, setErrors] = useState<PersonFormErrors>({});

  const set = <K extends keyof PersonFormValues>(
    key: K,
    value: PersonFormValues[K],
  ) => {
    setValues((current) => ({ ...current, [key]: value }));
    // Clear a field's complaint as soon as it is touched again.
    setErrors((current) => (current[key] ? { ...current, [key]: undefined } : current));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const result = toPersonDraft(values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    onSubmit(result.draft);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
      <PersonFields values={values} errors={errors} onChange={set} />

      {formError && (
        <p
          role="alert"
          className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"
        >
          {formError}
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
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
