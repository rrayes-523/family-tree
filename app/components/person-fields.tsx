"use client";

import type { ReactNode } from "react";

import type { PersonFormErrors, PersonFormValues } from "@/lib/person-form";
import type { Sex } from "@/lib/types";

/**
 * The person input fields on their own, without any submit behaviour, so the
 * standalone Add/Edit form and the "create a new relative" dialogs share one
 * set of inputs and one normalisation path.
 */

const sexOptions: { value: Sex; label: string }[] = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "other", label: "Other / not recorded" },
];

export const fieldClass =
  "w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-900 outline-none transition-colors focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-500";

export function Field({
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

interface PersonFieldsProps {
  values: PersonFormValues;
  errors: PersonFormErrors;
  onChange: <K extends keyof PersonFormValues>(
    key: K,
    value: PersonFormValues[K],
  ) => void;
}

export default function PersonFields({
  values,
  errors,
  onChange,
}: PersonFieldsProps) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" error={errors.firstName}>
          <input
            className={fieldClass}
            value={values.firstName}
            onChange={(e) => onChange("firstName", e.target.value)}
            autoComplete="off"
          />
        </Field>
        <Field label="Last name" error={errors.lastName}>
          <input
            className={fieldClass}
            value={values.lastName}
            onChange={(e) => onChange("lastName", e.target.value)}
            autoComplete="off"
          />
        </Field>
      </div>

      <Field label="Nickname" hint="optional">
        <input
          className={fieldClass}
          value={values.nickname}
          onChange={(e) => onChange("nickname", e.target.value)}
          autoComplete="off"
        />
      </Field>

      <Field label="Sex">
        <select
          className={fieldClass}
          value={values.sex}
          onChange={(e) => onChange("sex", e.target.value as Sex)}
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
            onChange={(e) => onChange("birthYear", e.target.value)}
            inputMode="numeric"
            placeholder="unknown"
            autoComplete="off"
          />
        </Field>
        <Field label="Died" hint="year" error={errors.deathYear}>
          <input
            className={fieldClass}
            value={values.deathYear}
            onChange={(e) => onChange("deathYear", e.target.value)}
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
          onChange={(e) => onChange("birthPlace", e.target.value)}
          autoComplete="off"
        />
      </Field>
    </>
  );
}
