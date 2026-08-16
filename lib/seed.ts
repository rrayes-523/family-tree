import type { FamilyTreeData } from "./types";

/**
 * A four-generation sample family. Covers the cases the layout has to survive:
 * a founding couple, several sibling branches, spouses who marry in, a
 * remarriage, and a single parent.
 */
export const seedData: FamilyTreeData = {
  people: [
    // Generation 1
    {
      id: "p1",
      firstName: "Eleanor",
      lastName: "Hart",
      sex: "female",
      birthYear: 1928,
      deathYear: 2011,
      birthPlace: "Portland, OR",
    },
    {
      id: "p2",
      firstName: "Walter",
      lastName: "Hart",
      sex: "male",
      birthYear: 1925,
      deathYear: 2004,
      birthPlace: "Boise, ID",
    },

    // Generation 2
    {
      id: "p3",
      firstName: "Margaret",
      lastName: "Hart",
      sex: "female",
      birthYear: 1952,
      birthPlace: "Portland, OR",
    },
    {
      id: "p4",
      firstName: "David",
      lastName: "Okafor",
      sex: "male",
      birthYear: 1950,
      birthPlace: "Lagos, NG",
    },
    {
      id: "p5",
      firstName: "Thomas",
      lastName: "Hart",
      sex: "male",
      birthYear: 1955,
      birthPlace: "Portland, OR",
    },
    {
      id: "p6",
      firstName: "Susan",
      lastName: "Reyes",
      sex: "female",
      birthYear: 1957,
      birthPlace: "San Diego, CA",
    },
    {
      id: "p7",
      firstName: "Linda",
      lastName: "Hart",
      sex: "female",
      birthYear: 1960,
      birthPlace: "Portland, OR",
    },

    // Generation 3
    {
      id: "p8",
      firstName: "Amara",
      lastName: "Okafor",
      sex: "female",
      birthYear: 1979,
      birthPlace: "Seattle, WA",
    },
    {
      id: "p9",
      firstName: "Ben",
      lastName: "Okafor",
      sex: "male",
      birthYear: 1982,
      birthPlace: "Seattle, WA",
    },
    {
      id: "p10",
      firstName: "Chloe",
      lastName: "Whitfield",
      sex: "female",
      birthYear: 1981,
      birthPlace: "Austin, TX",
    },
    {
      id: "p11",
      firstName: "Nathan",
      lastName: "Hart",
      sex: "male",
      birthYear: 1984,
      birthPlace: "Denver, CO",
    },
    {
      id: "p12",
      firstName: "Priya",
      lastName: "Raman",
      sex: "female",
      birthYear: 1985,
      birthPlace: "Chennai, IN",
    },
    {
      id: "p13",
      firstName: "Grace",
      lastName: "Hart",
      sex: "female",
      birthYear: 1989,
      birthPlace: "Portland, OR",
    },

    // Generation 4
    {
      id: "p14",
      firstName: "Isla",
      lastName: "Okafor",
      sex: "female",
      birthYear: 2010,
      birthPlace: "Seattle, WA",
    },
    {
      id: "p15",
      firstName: "Theo",
      lastName: "Okafor",
      sex: "male",
      birthYear: 2013,
      birthPlace: "Seattle, WA",
    },
    {
      id: "p16",
      firstName: "Maya",
      lastName: "Hart",
      sex: "female",
      birthYear: 2016,
      birthPlace: "Denver, CO",
    },
  ],

  unions: [
    {
      id: "u1",
      partnerIds: ["p2", "p1"],
      childIds: ["p3", "p5", "p7"],
      status: "married",
      year: 1949,
    },
    {
      id: "u2",
      partnerIds: ["p4", "p3"],
      childIds: ["p8", "p9"],
      status: "married",
      year: 1977,
    },
    {
      id: "u3",
      partnerIds: ["p5", "p6"],
      childIds: ["p11"],
      status: "divorced",
      year: 1981,
    },
    // Linda raises Grace on her own — a union with a single partner.
    { id: "u4", partnerIds: ["p7"], childIds: ["p13"] },
    {
      id: "u5",
      partnerIds: ["p9", "p10"],
      childIds: ["p14", "p15"],
      status: "married",
      year: 2008,
    },
    {
      id: "u6",
      partnerIds: ["p11", "p12"],
      childIds: ["p16"],
      status: "married",
      year: 2014,
    },
  ],
};
