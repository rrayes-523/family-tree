import type { Person, PersonDraft, Sex } from "./types";

/**
 * The pure mapping between what a form holds (strings, always) and what the
 * domain accepts (a `PersonDraft`). Kept out of React so the interesting part —
 * deciding what an empty year means — can be tested without rendering anything.
 */

export interface PersonFormValues {
  firstName: string;
  lastName: string;
  nickname: string;
  sex: Sex;
  birthYear: string;
  deathYear: string;
  birthPlace: string;
}

export type PersonFormErrors = Partial<Record<keyof PersonFormValues, string>>;

export const EMPTY_PERSON_FORM: PersonFormValues = {
  firstName: "",
  lastName: "",
  nickname: "",
  // The model requires a value, so new people start at the least specific one
  // rather than silently guessing.
  sex: "other",
  birthYear: "",
  deathYear: "",
  birthPlace: "",
};

/** Years outside this span are typos rather than genealogy. */
const EARLIEST_YEAR = 1;
const LATEST_YEAR = 2200;

/** Fills a form from an existing person. Absent values stay blank, not "0". */
export function toFormValues(person: Person): PersonFormValues {
  return {
    firstName: person.firstName,
    lastName: person.lastName,
    nickname: person.nickname ?? "",
    sex: person.sex,
    birthYear: person.birthYear?.toString() ?? "",
    deathYear: person.deathYear?.toString() ?? "",
    birthPlace: person.birthPlace ?? "",
  };
}

type YearResult = { year?: number } | { error: string };

/**
 * Blank means unknown, which is a legitimate answer and must not become 0 or
 * NaN. Anything present has to be a plain whole year.
 */
function parseYear(raw: string): YearResult {
  const value = raw.trim();
  if (value === "") return {};

  if (!/^\d+$/.test(value)) return { error: "Enter a year as digits, e.g. 1952." };

  const year = Number(value);
  if (year < EARLIEST_YEAR || year > LATEST_YEAR) {
    return { error: `Enter a year between ${EARLIEST_YEAR} and ${LATEST_YEAR}.` };
  }
  return { year };
}

export type DraftResult =
  | { ok: true; draft: PersonDraft }
  | { ok: false; errors: PersonFormErrors };

/**
 * Validates a form and converts it to a draft.
 *
 * These checks mirror the domain's own rules so the user gets a message on the
 * offending field instead of a thrown error. The domain still enforces them —
 * this is a courtesy, not the guarantee.
 */
export function toPersonDraft(values: PersonFormValues): DraftResult {
  const errors: PersonFormErrors = {};

  const firstName = values.firstName.trim();
  const lastName = values.lastName.trim();

  // Only one name is required; which one is up to the user.
  if (firstName === "" && lastName === "") {
    errors.firstName = "Enter a first or last name.";
  }

  const birth = parseYear(values.birthYear);
  if ("error" in birth) errors.birthYear = birth.error;

  const death = parseYear(values.deathYear);
  if ("error" in death) errors.deathYear = death.error;

  if (
    !("error" in birth) &&
    !("error" in death) &&
    birth.year !== undefined &&
    death.year !== undefined &&
    death.year < birth.year
  ) {
    errors.deathYear = "Year of death is before year of birth.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const nickname = values.nickname.trim();
  const birthPlace = values.birthPlace.trim();

  return {
    ok: true,
    draft: {
      firstName,
      lastName,
      sex: values.sex,
      ...(nickname ? { nickname } : {}),
      ...("year" in birth && birth.year !== undefined ? { birthYear: birth.year } : {}),
      ...("year" in death && death.year !== undefined ? { deathYear: death.year } : {}),
      ...(birthPlace ? { birthPlace } : {}),
    },
  };
}
