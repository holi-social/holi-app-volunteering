import type { Spy } from "./dev_deps.ts";
import {
  assertEquals,
  assertRejects,
  assertSpyCall,
  assertSpyCalls,
  describe,
  it,
  spy,
} from "./dev_deps.ts";
import {
  exportedForTesting,
  GeoLocationResolver,
  VolunteeringDB,
} from "./volunteering_db.ts";
import { Client } from "./deps.ts";

type ResolveLocationSpy = Spy<
  unknown,
  [_geoLocationId: string],
  Promise<{ lat: number; lon: number }>
>;

// taken from https://stackoverflow.com/a/2450976 ("Fisher-Yates Shuffle")
function shuffle<A>(array: A[]): A[] {
  let currentIndex = array.length;
  // While there remain elements to shuffle...
  while (currentIndex != 0) {
    // Pick a remaining element...
    const randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex],
      array[currentIndex],
    ];
  }
  return array;
}

const succeedingGeoLocationResolver: GeoLocationResolver = (
  _geoLocationId: string,
) => Promise.resolve({ lat: 123, lon: 321 });
const failingGeoLocationResolver: GeoLocationResolver = (
  _geoLocationId: string,
) => Promise.reject("boom!");

const withMockedDependencies = (
  geoLocationResolver: GeoLocationResolver,
  test: (
    vDB: VolunteeringDB,
    resolveLocationSpy: ResolveLocationSpy,
  ) => unknown | Promise<unknown>,
) => {
  const geoLocationResolverSpy = spy(geoLocationResolver);
  const mockClient = {
    queryObject: () => Promise.resolve({ rows: [] }),
  } as unknown as Client;
  const volunteeringDB = new VolunteeringDB(
    mockClient,
    "mock-image-proxy-base-url",
    geoLocationResolverSpy,
  );
  test(volunteeringDB, geoLocationResolverSpy);
};

describe("VolunteeringDB", () => {
  it("correctly constructs a query vector", () => {
    const expectedLength = 28 /* #topics */ + 50; /* #skills */
    // deno-fmt-ignore
    const expectedVector: number[] = [
      1,0,0,0,0,0,0,0,0,1,
      0,0,0,0,0,0,0,0,0,0,
      0,0,0,0,0,0,0,1,
      1,0,0,0,0,0,0,0,0,1,
      0,0,0,0,0,0,0,0,0,0,
      0,0,0,0,0,0,0,0,0,0,
      0,0,0,0,0,0,0,0,0,0,
      0,0,0,0,0,0,0,0,0,1,
    ]
    // deno-fmt-ignore
    const actualVector = exportedForTesting.recosQueryVector([
        "agriculture-food",       // first item (index 0)
        "disabilities-inclusion", // tenth item (index 9)
        "water-ocean",            // last item  (index 27)
    ], [
        "adaptability",           // first item (index 0)
        "conflict-management",    // tenth item (index 9)
        "writing-translation",    // last item  (index 49)
    ]);
    assertEquals(actualVector.length, expectedLength);
    assertEquals(actualVector, expectedVector);
  });
  it("correctly reverse-decodes topics and skills matches from embeddings", () => {
    // deno-fmt-ignore
    const embedding: number[] = [
      0.7,0,0,0,0,0,0,0,0,0.5,
      0,0,0,0,0,0,0,0,0,0,
      0,0,0,0,0,0,0,0.6,
      0.6,0,0,-0.5,0,0,0,0,0,0.99,
      0,0,0,0,0,0,0,0,0,0,
      0,0,0,0,0,0,0,0,0,0,
      0,0,0,0,0,0,0,0,0,0,
      0,0,0,0,0,0,0,0,0,1.0,
    ]
    // ordered by confidence DESC with queried for terms first
    const expectedMatchedTopics = [
      "agriculture-food", // first item (index 0)
      "water-ocean", // last item  (index 27)
      "disabilities-inclusion", // tenth item (index 9)
    ];
    // ordered by confidence DESC with queried for terms first
    const expectedMatchedSkills = [
      "writing-translation", // last item  (index 49)
      "conflict-management", // tenth item (index 9)
      "adaptability", // first item (index 0)
    ];
    const allTopics = Array.from(
      exportedForTesting.TOPICS_VECTOR_INDICES.keys(),
    );
    const allSkills = Array.from(
      exportedForTesting.SKILLS_VECTOR_INDICES.keys(),
    );
    const matches = exportedForTesting.decodeMatchesFromEmbedding(
      embedding,
      allTopics,
      allSkills,
    );
    assertEquals(matches.matchedTopics, expectedMatchedTopics);
    assertEquals(matches.matchedSkills, expectedMatchedSkills);
  });
  it("filters out topics and skills matches with confidence below MATCH_CONFIDENCE_THRESHOLD", () => {
    // deno-fmt-ignore
    const embedding: number[] = [
      0.7,0,0,0,0,0,0,0,0,0.3,
      0,0,0,0,0,0,0,0,0,0,
      0,0,0,0,0,0,0,0.6,
      0.3,0,0,-0.5,0,0,0,0,0,0.99,
      0,0,0,0,0,0,0,0,0,0,
      0,0,0,0,0,0,0,0,0,0,
      0,0,0,0,0,0,0,0,0,0,
      0,0,0,0,0,0,0,0,0,1.0,
    ]
    // ordered by confidence DESC with queried for terms first
    const expectedMatchedTopics = [
      "agriculture-food", // first item (index 0)
      "water-ocean", // last item  (index 27)
    ];
    // ordered by confidence DESC with queried for terms first
    const expectedMatchedSkills = [
      "writing-translation", // last item  (index 49)
      "conflict-management", // tenth item (index 9)
    ];
    const allTopics = Array.from(
      exportedForTesting.TOPICS_VECTOR_INDICES.keys(),
    );
    const allSkills = Array.from(
      exportedForTesting.SKILLS_VECTOR_INDICES.keys(),
    );
    const matches = exportedForTesting.decodeMatchesFromEmbedding(
      embedding,
      allTopics,
      allSkills,
    );
    assertEquals(matches.matchedTopics, expectedMatchedTopics);
    assertEquals(matches.matchedSkills, expectedMatchedSkills);
  });
  it("ranks topics and skills matches queried for higher", () => {
    // deno-fmt-ignore
    const embedding: number[] = [
      0.6,0,0,0,0,0,0,0,0,0.7,
      0,0,0,0,0,0,0,0,0,0,
      0,0,0,0,0,0,0.8,0.9,
      0.6,0,0,-0.5,0,0,0,0,0,0.99,
      0,0,0,0,0,0,0,0,0,0,
      0,0,0,0,0,0,0,0,0,0,
      0,0,0,0,0,0,0,0,0,0,
      0,0,0,0,0,0,0,0,0,1.0,
    ]
    // ordered by confidence DESC with queried for terms first
    const expectedMatchedTopics = [
      "disabilities-inclusion", // tenth item (index 9)
      "agriculture-food", // first item (index 0)
      "water-ocean", // last item (
      "urban-rural-development",
    ];
    // ordered by confidence DESC with queried for terms first
    const expectedMatchedSkills = [
      "writing-translation", // last item  (index 49)
      "conflict-management", // tenth item (index 9)
      "adaptability", // first item (index 0)
    ];
    const queriedTopics = ["agriculture-food", "disabilities-inclusion"];
    const queriedSkills = ["writing-translation"];
    const matches = exportedForTesting.decodeMatchesFromEmbedding(
      embedding,
      queriedTopics,
      queriedSkills,
    );
    assertEquals(matches.matchedTopics, expectedMatchedTopics);
    assertEquals(matches.matchedSkills, expectedMatchedSkills);
  });
  it("sortMatches ranks topics and skills matches by confidence descending and queried for terms higher", () => {
    const sorted = exportedForTesting.sortMatches(
      ["a", "c"],
      shuffle([
        ["a", 0.1],
        ["b", 0.2],
        ["c", 0.3],
        ["d", 0.4],
        ["e", 0.5],
      ]),
    );
    assertEquals(sorted, [["c", 0.3], ["a", 0.1], ["e", 0.5], ["d", 0.4], [
      "b",
      0.2,
    ]]);
  });
  it("resolves latitude/longitude using the GeoAPI client when geoLocationId is given", () => {
    withMockedDependencies(
      succeedingGeoLocationResolver,
      (volunteeringDB, resolveLocationSpy) => {
        volunteeringDB.findRecommendations({
          limit: 10,
          offset: 0,
          topics: [],
          skills: [],
          geolocationId: "mock-geolocation-id",
        });
        assertSpyCall(resolveLocationSpy, 0, {
          args: ["mock-geolocation-id"],
        });
      },
    );
  });
  it("does not resolve latitude/longitude when geoLocationId is not given", () => {
    withMockedDependencies(
      succeedingGeoLocationResolver,
      (volunteeringDB, resolveLocationSpy) => {
        volunteeringDB.findRecommendations({
          limit: 10,
          offset: 0,
          topics: ["agriculture-food"],
          skills: [],
        });
        assertSpyCalls(resolveLocationSpy, 0);
      },
    );
  });
  it("falls back to recommend based only on topics and skills if given and geo location resolution fails", () => {
    withMockedDependencies(
      failingGeoLocationResolver,
      async (volunteeringDB, _resolveLocationSpy) => {
        const result = await volunteeringDB.findRecommendations({
          limit: 10,
          offset: 0,
          topics: ["agriculture-food"],
          skills: [],
          geolocationId: "mock-geolocation-id",
        });
        assertEquals(result.totalResults, 0);
        assertEquals(result.data, []);
      },
    );
  });
  it("fails with error message if no topics and skills are given and geo location resolution fails", () => {
    withMockedDependencies(
      failingGeoLocationResolver,
      async (volunteeringDB, _resolveLocationSpy) => {
        await assertRejects(
          () =>
            volunteeringDB.findRecommendations({
              limit: 10,
              offset: 0,
              topics: [],
              skills: [],
              geolocationId: "mock-geolocation-id",
            }),
          Error,
          "geo location resolution failed and no topics or skills given",
        );
      },
    );
  });
});
