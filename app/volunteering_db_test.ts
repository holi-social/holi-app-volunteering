import type { Spy } from "./dev_deps.ts";
import {
  assertEquals,
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
  it("resolves latitude/longitude using the GeoAPI client when geoLocationId is given", () => {
    withMockedDependencies(
      succeedingGeoLocationResolver,
      (volunteeringDB, resolveLocationSpy) => {
        volunteeringDB.findRecommendations({
          limit: 10,
          offset: 0,
          skills: [],
          topics: [],
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
          skills: [],
          topics: [],
        });
        assertSpyCalls(resolveLocationSpy, 0);
      },
    );
  });
  it("handles failures during resolution of latitude/longitude gracefully", () => {
    withMockedDependencies(
      failingGeoLocationResolver,
      async (volunteeringDB, _resolveLocationSpy) => {
        const result = await volunteeringDB.findRecommendations({
          limit: 10,
          offset: 0,
          skills: [],
          topics: [],
          geolocationId: "mock-geolocation-id",
        });
        assertEquals(result.totalResults, 0);
        assertEquals(result.data, []);
      },
    );
  });
});
