"use client";

import { useMemo, useState } from "react";

import type { PersonFormErrors } from "@/lib/person-form";
import { partnerCandidates, type PersonChoice } from "@/lib/relationship-actions";
import {
  fullName,
  type FamilyTreeData,
  type Person,
  type UnionStatus,
} from "@/lib/types";

import Dialog from "./dialog";
import { Field, fieldClass } from "./person-fields";
import RelativeChooser, {
  EMPTY_CHOOSER,
  toPersonChoice,
  type ChooserState,
} from "./relative-chooser";

export interface PartnerDetails {
  status: UnionStatus;
  year?: number;
}

interface AddPartnerDialogProps {
  family: FamilyTreeData;
  person: Person;
  formError?: string;
  onSubmit: (choice: PersonChoice, details: PartnerDetails) => void;
  onCancel: () => void;
}

/** Only relationships someone would declare as current. */
const statusOptions: { value: UnionStatus; label: string }[] = [
  { value: "married", label: "Married" },
  { value: "partners", label: "Partners" },
];

export default function AddPartnerDialog({
  family,
  person,
  formError,
  onSubmit,
  onCancel,
}: AddPartnerDialogProps) {
  const [state, setState] = useState<ChooserState>(EMPTY_CHOOSER);
  const [errors, setErrors] = useState<PersonFormErrors>({});
  const [message, setMessage] = useState<string>();
  const [status, setStatus] = useState<UnionStatus>("married");
  const [year, setYear] = useState("");

  const candidates = useMemo(
    () => partnerCandidates(family, person.id),
    [family, person.id],
  );

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    const trimmedYear = year.trim();
    if (trimmedYear !== "" && !/^\d{1,4}$/.test(trimmedYear)) {
      setMessage("Enter the year as digits, e.g. 1977.");
      return;
    }

    const result = toPersonChoice(state);
    if (!result.ok) {
      setErrors(result.errors);
      setMessage(result.message);
      return;
    }

    setErrors({});
    setMessage(undefined);
    onSubmit(result.choice, {
      status,
      ...(trimmedYear ? { year: Number(trimmedYear) } : {}),
    });
  };

  return (
    <Dialog title={`Add a partner for ${fullName(person)}`} onClose={onCancel}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
        <RelativeChooser
          candidates={candidates}
          state={state}
          errors={errors}
          onChange={setState}
          emptyMessage="Everyone else in the tree is already a partner of this person."
        />

        <div className="grid grid-cols-2 gap-3">
          <Field label="Relationship">
            <select
              className={fieldClass}
              value={status}
              onChange={(event) => setStatus(event.target.value as UnionStatus)}
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Since" hint="year, optional">
            <input
              className={fieldClass}
              value={year}
              onChange={(event) => setYear(event.target.value)}
              inputMode="numeric"
              placeholder="unknown"
              autoComplete="off"
            />
          </Field>
        </div>

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
            Add partner
          </button>
        </div>
      </form>
    </Dialog>
  );
}
