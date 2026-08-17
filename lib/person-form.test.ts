import { describe, expect, it } from "vitest";

import {
  EMPTY_PERSON_FORM,
  toFormValues,
  toPersonDraft,
  type PersonFormValues,
} from "./person-form";
import type { Person } from "./types";

const form = (over: Partial<PersonFormValues> = {}): PersonFormValues => ({
  ...EMPTY_PERSON_FORM,
  firstName: "Ada",
  ...over,
});

/** Unwraps a result expected to validate, failing loudly if it did not. */
function draftOf(values: PersonFormValues) {
  const result = toPersonDraft(values);
  if (!result.ok) {
    throw new Error(`expected valid, got ${JSON.stringify(result.errors)}`);
  }
  return result.draft;
}

function errorsOf(values: PersonFormValues) {
  const result = toPersonDraft(values);
  if (result.ok) throw new Error("expected validation to fail");
  return result.errors;
}

describe("names", () => {
  it("accepts a first name alone", () => {
    expect(draftOf(form({ lastName: "" }))).toMatchObject({
      firstName: "Ada",
      lastName: "",
    });
  });

  it("accepts a last name alone, since the domain only needs one", () => {
    expect(draftOf(form({ firstName: "", lastName: "Byron" }))).toMatchObject({
      firstName: "",
      lastName: "Byron",
    });
  });

  it("rejects a person with neither name", () => {
    expect(errorsOf(form({ firstName: "  ", lastName: "" }))).toHaveProperty(
      "firstName",
    );
  });

  it("trims surrounding whitespace", () => {
    expect(draftOf(form({ firstName: "  Ada  ", lastName: " Byron " }))).toMatchObject(
      { firstName: "Ada", lastName: "Byron" },
    );
  });
});

describe("optional years", () => {
  it("treats a blank year as unknown rather than zero", () => {
    const draft = draftOf(form({ birthYear: "", deathYear: "" }));

    expect(draft.birthYear).toBeUndefined();
    expect(draft.deathYear).toBeUndefined();
    expect("birthYear" in draft).toBe(false);
    expect("deathYear" in draft).toBe(false);
  });

  it("treats whitespace as unknown too", () => {
    expect(draftOf(form({ birthYear: "   " })).birthYear).toBeUndefined();
  });

  it("parses a year to a number", () => {
    expect(draftOf(form({ birthYear: "1952" })).birthYear).toBe(1952);
  });

  it("never yields NaN for junk input", () => {
    const errors = errorsOf(form({ birthYear: "not a year" }));

    expect(errors.birthYear).toBeTruthy();
  });

  it("rejects decimals and signs rather than truncating them", () => {
    expect(errorsOf(form({ birthYear: "19.5" }))).toHaveProperty("birthYear");
    expect(errorsOf(form({ birthYear: "-40" }))).toHaveProperty("birthYear");
  });

  it("rejects years outside a plausible range", () => {
    expect(errorsOf(form({ birthYear: "0" }))).toHaveProperty("birthYear");
    expect(errorsOf(form({ birthYear: "99999" }))).toHaveProperty("birthYear");
  });

  it("rejects dying before being born", () => {
    expect(errorsOf(form({ birthYear: "1990", deathYear: "1980" }))).toHaveProperty(
      "deathYear",
    );
  });

  it("allows a death year with no known birth year", () => {
    const draft = draftOf(form({ birthYear: "", deathYear: "1980" }));

    expect(draft.birthYear).toBeUndefined();
    expect(draft.deathYear).toBe(1980);
  });

  it("allows birth and death in the same year", () => {
    expect(draftOf(form({ birthYear: "1900", deathYear: "1900" }))).toMatchObject({
      birthYear: 1900,
      deathYear: 1900,
    });
  });
});

describe("optional text", () => {
  it("omits blank optional fields instead of storing empty strings", () => {
    const draft = draftOf(form({ nickname: "  ", birthPlace: "" }));

    expect("nickname" in draft).toBe(false);
    expect("birthPlace" in draft).toBe(false);
  });

  it("keeps values that were filled in", () => {
    expect(draftOf(form({ nickname: " Addy ", birthPlace: " London " }))).toMatchObject(
      { nickname: "Addy", birthPlace: "London" },
    );
  });
});

describe("toFormValues", () => {
  const person: Person = {
    id: "p1",
    firstName: "Ada",
    lastName: "Byron",
    sex: "female",
    birthYear: 1815,
    deathYear: 1852,
    birthPlace: "London",
    nickname: "Addy",
  };

  it("fills every field from an existing person", () => {
    expect(toFormValues(person)).toEqual({
      firstName: "Ada",
      lastName: "Byron",
      nickname: "Addy",
      sex: "female",
      birthYear: "1815",
      deathYear: "1852",
      birthPlace: "London",
    });
  });

  it("shows unknown values as blank, never as 0", () => {
    const sparse: Person = { id: "p2", firstName: "Bo", lastName: "", sex: "other" };

    expect(toFormValues(sparse)).toMatchObject({
      nickname: "",
      birthYear: "",
      deathYear: "",
      birthPlace: "",
    });
  });

  it("round-trips a person through the form unchanged", () => {
    const draft = draftOf(toFormValues(person));

    expect({ id: person.id, ...draft }).toEqual(person);
  });
});
