import { stubFetch, stubFetchWithResponses } from "./common_test.ts";
import { assertRejects, restore } from "./dev_deps.ts";
import { assertEquals, beforeEach, describe, it } from "./dev_deps.ts";
import { GeoAPIClient } from "./geo_api_client.ts";
import { logger, LogSeverity } from "./logging.ts";

logger.setUpLogger(
  "development",
  LogSeverity.EMERGENCY,
);

const testEndpointUrl = "https://endpoint.geo";
const testPlaceId = "place123";
const geometryMultipolygon = {
  "type": "MultiPolygon",
  "coordinates": [
    [
      [
        [8.1044993, 54.025049999],
        [8.2109892, 53.980715499],
      ],
    ],
  ],
};
const geometryPoint = {
  type: "Point",
  coordinates: [10.000654, 53.550340999],
};
const geolocationProperties = {
  formatted: "Hamburg, Germany",
};
const geometryResponseMultipolygon = {
  data: {
    placeDetails: {
      geolocation: {
        properties: geolocationProperties,
        geometry: geometryMultipolygon,
      },
    },
  },
};
const geometryResponsePoint = {
  data: {
    placeDetails: {
      geolocation: {
        properties: geolocationProperties,
        geometry: geometryPoint,
      },
    },
  },
};
const autocompleteResponse = {
  data: {
    placesAutocomplete: [{
      id: "place1234",
    }],
  },
};
const invalidResponse = {};

describe("GeoAPIClient", () => {
  let client: GeoAPIClient;

  beforeEach(() => {
    restore();
    client = new GeoAPIClient(testEndpointUrl);
  });

  describe("resolveGeometry", () => {
    it("fetches geometry for place id", async () => {
      stubFetch(geometryResponseMultipolygon);

      const response = await client.resolveGeometry(testPlaceId);

      assertEquals(response, geometryMultipolygon);
    });

    it("throws error for invalid response when fetching geometry", async () => {
      stubFetch(invalidResponse);

      await assertRejects(() => client.resolveGeometry(testPlaceId));
    });

    it("retries fetching geometry if geometry is only a point", async () => {
      stubFetchWithResponses([geometryResponsePoint, autocompleteResponse, geometryResponseMultipolygon]);

      const response = await client.resolveGeometry(testPlaceId);

      assertEquals(response, geometryMultipolygon);
    });

    it("does not retry fetching geometry if points are allowed", async () => {
      stubFetchWithResponses([geometryResponsePoint]);

      const response = await client.resolveGeometry(testPlaceId, { allowPoints: true });

      assertEquals(response, geometryPoint);
    });

    it("only retries fetching geometry if geometry is only a point once", async () => {
      stubFetchWithResponses([geometryResponsePoint, autocompleteResponse, geometryResponsePoint]);

      const response = await client.resolveGeometry(testPlaceId);

      assertEquals(response, geometryPoint);
    });

    it("only retries fetching geometry if autocomplete request results in a different place", async () => {
      const autocompleteResponseSamePlaceId = [{ id: testPlaceId }];
      stubFetchWithResponses([geometryResponsePoint, autocompleteResponseSamePlaceId]);

      const response = await client.resolveGeometry(testPlaceId);

      assertEquals(response, geometryPoint);
    });

    it("handles empty autocomplete response when retrying fetching geometry", async () => {
      const emptyAutocompleteResponse = { data: { placesAutocomplete: [] } };
      stubFetchWithResponses([geometryResponsePoint, emptyAutocompleteResponse]);

      const response = await client.resolveGeometry(testPlaceId);

      assertEquals(response, geometryPoint);
    });

    it("handles invalid autocomplete response when retrying fetching geometry", async () => {
      stubFetchWithResponses([geometryResponsePoint, invalidResponse]);

      const response = await client.resolveGeometry(testPlaceId);

      assertEquals(response, geometryPoint);
    });

    it("throws error for invalid geometry response when retrying fetching geometry", async () => {
      stubFetchWithResponses([geometryResponsePoint, autocompleteResponse, invalidResponse]);

      await assertRejects(() => client.resolveGeometry(testPlaceId));
    });
  });
});
