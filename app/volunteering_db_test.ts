import {
  assertEquals,
  assertRejects,
  assertSpyCall,
  assertSpyCalls,
  describe,
  it,
  returnsNext,
  Stub,
  stub,
} from "./dev_deps.ts";
import { exportedForTesting, VolunteeringDB } from "./volunteering_db.ts";
import { Client } from "./deps.ts";
import { GeoAPIClient } from "./geo_api_client.ts";

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

const testCoordinates = { lat: 123, lon: 321 };
const testGeometry = {
  type: "Polygon",
  "coordinates": [[[3.9265487, 52.576948399], [13.9304862, 52.574110199]]],
};

const withMockedDependencies = (
  test: (
    vDB: VolunteeringDB,
    geoApiClient: GeoAPIClient,
  ) => unknown | Promise<unknown>,
) => {
  const mockClient = {
    queryObject: () => Promise.resolve({ rows: [] }),
  } as unknown as Client;
  const mockedGeoApiClient = {} as unknown as GeoAPIClient;
  stub(
    mockedGeoApiClient,
    "resolveCoordinates",
    returnsNext([Promise.resolve(testCoordinates)]),
  );
  stub(
    mockedGeoApiClient,
    "resolveGeometry",
    returnsNext([Promise.resolve(testGeometry)]),
  );
  const volunteeringDB = new VolunteeringDB(
    mockClient,
    "mock-image-proxy-base-url",
    mockedGeoApiClient,
  );
  test(volunteeringDB, mockedGeoApiClient);
};

describe("VolunteeringDB", () => {
  describe("queryEmbeddingVector", () => {
    it("correctly constructs a query embedding vector", () => {
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
      const actualVector = exportedForTesting.queryEmbeddingVector([
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
  });
  describe("decodeMatchesFromEmbedding", () => {
    it("correctly reverse-decodes topics and skills matches from embeddings", () => {
      // deno-fmt-ignore
      const embedding: number[] = [
        0.9,0,0,0,0,0,0,0,0,0.8,
        0,0,0,0,0,0,0,0,0,0,
        0,0,0,0,0,0,0,0.85,
        0.85,0,0,-0.5,0,0,0,0,0,0.99,
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
        0.9,0,0,0,0,0,0,0,0,0.3,
        0,0,0,0,0,0,0,0,0,0,
        0,0,0,0,0,0,0,0.85,
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
        0.85,0,0,0,0,0,0,0,0,0.9,
        0,0,0,0,0,0,0,0,0,0,
        0,0,0,0,0,0,0.8,0.9,
        0.85,0,0,-0.5,0,0,0,0,0,0.99,
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
  });

  describe("sortMatches", () => {
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
  });

  describe("findRecommendations", () => {
    it("resolves latitude/longitude using the GeoAPI client when geolocationId is given", () => {
      withMockedDependencies(
        (volunteeringDB, geoAPIClient) => {
          volunteeringDB.findRecommendations({
            limit: 10,
            offset: 0,
            topics: [],
            skills: [],
            geolocationId: "mock-geolocation-id",
          });
          assertSpyCall(geoAPIClient.resolveCoordinates as Stub, 0, {
            args: ["mock-geolocation-id"],
          });
        },
      );
    });
    it("does not resolve latitude/longitude when geolocationId is not given", () => {
      withMockedDependencies(
        (volunteeringDB, geoAPIClient) => {
          volunteeringDB.findRecommendations({
            limit: 10,
            offset: 0,
            topics: ["agriculture-food"],
            skills: [],
          });
          assertSpyCalls(geoAPIClient.resolveCoordinates as Stub, 0);
        },
      );
    });
    it("falls back to recommend based only on topics and skills if given and geo location resolution fails", () => {
      withMockedDependencies(
        async (volunteeringDB, geoAPIClient) => {
          stub(
            geoAPIClient,
            "resolveCoordinates",
            returnsNext([Promise.reject("boom!")]),
          );

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
        async (volunteeringDB, geoAPIClient) => {
          stub(
            geoAPIClient,
            "resolveCoordinates",
            returnsNext([Promise.reject("boom!")]),
          );
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

  describe("filterEngagements", () => {
    it("resolves geolocation geometry using the GeoAPI client when geolocationId is given", () => {
      withMockedDependencies(
        (volunteeringDB, geoAPIClient) => {
          volunteeringDB.filterEngagements({
            limit: 10,
            offset: 0,
            topics: [],
            skills: [],
            geolocationId: "mock-geolocation-id",
          });
          assertSpyCall(geoAPIClient.resolveGeometry as Stub, 0, {
            args: ["mock-geolocation-id"],
          });
        },
      );
    });
    it("does not resolve geolocation geometry when geolocationId is not given", () => {
      withMockedDependencies(
        (volunteeringDB, geoAPIClient) => {
          volunteeringDB.filterEngagements({
            limit: 10,
            offset: 0,
            topics: ["agriculture-food"],
            skills: [],
          });
          assertSpyCalls(geoAPIClient.resolveGeometry as Stub, 0);
        },
      );
    });
    it("fails with error message if geolocation resolution fails", () => {
      withMockedDependencies(
        async (volunteeringDB, geoAPIClient) => {
          stub(
            geoAPIClient,
            "resolveGeometry",
            returnsNext([Promise.reject("boom!")]),
          );
          await assertRejects(
            () =>
              volunteeringDB.filterEngagements({
                limit: 10,
                offset: 0,
                topics: ["agriculture-food"],
                skills: [],
                geolocationId: "mock-geolocation-id",
              }),
            Error,
            "Geolocation resolution failed",
          );
        },
      );
    });
    it("fails with error message if no topics, skills and location are given", () => {
      withMockedDependencies(
        async (volunteeringDB, _geoAPIClient) => {
          await assertRejects(
            () =>
              volunteeringDB.filterEngagements({
                limit: 10,
                offset: 0,
                topics: [],
                skills: [],
              }),
            Error,
            "At least one topic, skill or location is required",
          );
        },
      );
    });
  });
});
