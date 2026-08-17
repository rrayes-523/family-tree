"use client";

import { useState, type ReactNode } from "react";

import {
  EMPTY_PERSON_FORM,
  toPersonDraft,
  type PersonFormErrors,
  type PersonFormValues,
} from "@/lib/person-form";
import type { PersonDraft, Sex } from "@/lib/types";

const sexOptions: { value: Sex; label: string }[] = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "other", label: "Other / not recorded" },
];

const fieldClass =
  "w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-900 outline-none transition-colors focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-500";

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
        {label}
        {hint && (
          <span className="ml-1.5 font-normal text-zinc-400 dark:text-zinc-500">
            {hint}
          </span>
        )}
      </span>
      {children}
      {error && (
        <span role="alert" className="text-xs text-rose-600 dark:text-rose-400">
          {error}
        </span>
      )}
    </label>
  );
}

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
 * The shared field set behind both Add and Edit. Values live here as strings
 * and only become a `PersonDraft` on submit — nothing typed reaches the family
 * data until it validates.
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
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" error={errors.firstName}>
          <input
            className={fieldClass}
            value={values.firstName}
            onChange={(e) => set("firstName", e.target.value)}
            autoComplete="off"
          />
        </Field>
        <Field label="Last name" error={errors.lastName}>
          <input
            className={fieldClass}
            value={values.lastName}
            onChange={(e) => set("lastName", e.target.value)}
            autoComplete="off"
          />
        </Field>
      </div>

      <Field label="Nickname" hint="optional">
        <input
          className={fieldClass}
          value={values.nickname}
          onChange={(e) => set("nickname", e.target.value)}
          autoComplete="off"
        />
      </Field>

      <Field label="Sex">
        <select
          className={fieldClass}
          value={values.sex}
          onChange={(e) => set("sex", e.target.value as Sex)}
        >
          {sexOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Born" hint="year" error={errors.birthYear}>
          <input
            className={fieldClass}
            value={values.birthYear}
            onChange={(e) => set("birthYear", e.target.value)}
            inputMode="numeric"
            placeholder="unknown"
            autoComplete="off"
          />
        </Field>
        <Field label="Died" hint="year" error={errors.deathYear}>
          <input
            className={fieldClass}
            value={values.deathYear}
            onChange={(e) => set("deathYear", e.target.value)}
            inputMode="numeric"
            placeholder="unknown"
            autoComplete="off"
          />
        </Field>
      </div>

      <Field label="Birthplace" hint="optional">
        <input
          className={fieldClass}
          value={values.birthPlace}
          onChange={(e) => set("birthPlace", e.target.value)}
          autoComplete="off"
        />
      </Field>

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
