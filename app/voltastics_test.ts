import {
  assertEquals,
  assertRejects,
  assertSpyCall,
  beforeEach,
  describe,
  it,
  returnsNext,
  Stub,
  stub,
} from "./dev_deps.ts";
import { processGqlRequest, stubFetch } from "./common_test.ts";

import {
  CategoriesResponse,
  EngagementParameters,
  EngagementRecosParameters,
  EngagementRecosResponse,
  EngagementResponse,
  EngagementsResponse,
  FilteredEngagementsParameters,
} from "./types.ts";
import { createGraphQLServer, GraphQLServer, ServerConfig, VoltasticsConfig } from "./server.ts";

import {
  apiCategoriesResponse,
  apiSearchEngagementsResponse,
  categories,
  engagementsResponse,
  Munich,
} from "./voltastics_test_data.ts";
import { fetchCategories, fetchEngagementOpportunities } from "./voltastics.ts";
import { VolunteeringDB } from "./volunteering_db.ts";
import { logger, LogSeverity } from "./logging.ts";

logger.setUpLogger(
  "development",
  LogSeverity.EMERGENCY,
);

const emptyResponse = {
  success: true,
};

const validEngagementsResponse = apiSearchEngagementsResponse;

const engagementFragment = `
id
title
description
url
imageUrl
imageUrlOriginal
source
categories
organizer {
  name
  imageUrl
}
location
latitude
longitude
topics
skills
`;

const categoryFragment = `
name
`;

const queryEngagementOpportunities = async (
  graphQLServer: GraphQLServer,
): Promise<EngagementsResponse> => {
  const promise = processGqlRequest(
    graphQLServer,
    `
      query engagementOpportunities($limit:Int!, $offset: Int!, $location: GeoJSON) {
        engagementOpportunities(limit: $limit, offset: $offset, location: $location) {
          totalResults
          data {
            ${engagementFragment}
          }
        }
      }`,
    { limit: 10, offset: 20, lat: 48.1371079, lon: 11.5753822, radius: 14 },
  );

  return (await promise)?.engagementOpportunities as EngagementsResponse;
};

const queryCategories = async (
  graphQLServer: GraphQLServer,
): Promise<CategoriesResponse> => {
  const response = await processGqlRequest(
    graphQLServer,
    `
      query categories {
        categories {
          data {
            ${categoryFragment}
          }
        }
      }`,
    {},
  );

  return response?.categories as CategoriesResponse;
};

const voltasticsConfigMock: VoltasticsConfig = {
  baseUrl: "https://test.com/api",
  apiToken: "ABC123",
};

const serverConfigMock: ServerConfig = {
  port: 8080,
  cacheEnabled: true,
  voltastics: voltasticsConfigMock,
  imageProxyBaseUrl: "https://dev-images.holi.social",
  cacheTtlMsVoltastics: 0,
  cacheTtlMsDB: 0,
  fake: false,
  volunteeringDB: {
    hostname: "fakehost",
    port: "1234",
    database: "volunteering",
    password: "secret",
    username: "admin",
    connectionAttempts: 10,
  },
  geoAPIEndpointUrl: "fakeUrl",
};

const noCacheServerConfig = {
  cacheEnabled: false,
  voltastics: voltasticsConfigMock,
  imageProxyBaseUrl: serverConfigMock.imageProxyBaseUrl,
  port: 0,
  cacheTtlMsVoltastics: 0,
  cacheTtlMsDB: 0,
  fake: false,
  volunteeringDB: {
    hostname: "fakehost",
    port: "1234",
    database: "volunteering",
    password: "secret",
    username: "admin",
    connectionAttempts: 10,
  },
  geoAPIEndpointUrl: "fakeUrl",
};

const fakeVolunteeringDB = new (class implements VolunteeringDB {
  public engagement(_params: EngagementParameters): Promise<EngagementResponse> {
    return Promise.reject(new Error("should not have been called"));
  }
  engagementRecommendations(_params: EngagementRecosParameters): Promise<EngagementsResponse> {
    return Promise.reject(new Error("should not have been called"));
  }
  engagementRecos(_params: EngagementRecosParameters): Promise<EngagementRecosResponse> {
    return Promise.reject(new Error("should not have been called"));
  }
  filteredEngagements(_params: FilteredEngagementsParameters): Promise<EngagementsResponse> {
    return Promise.reject(new Error("should not have been called"));
  }
})();

describe("voltastics", () => {
  let fetchStub: Stub;

  beforeEach(() => {
    fetchStub?.restore();
  });

  describe("querying engagement list", () => {
    it("calls api with correct parameters", async () => {
      fetchStub = stubFetch(emptyResponse);

      await fetchEngagementOpportunities(serverConfigMock)({
        limit: 10,
        offset: 20,
        location: Munich,
      });

      const expectedUrl = new URL(
        "https://test.com/api/searchengagement?limit=10&offset=20&lat=48.1371079&lon=11.5753822&radius=14",
      );

      const expectedHeaders = { headers: { "x-voltastics-token": "ABC123" } };

      assertSpyCall(fetchStub, 0, {
        args: [expectedUrl, expectedHeaders],
      });
    });
    it("calls api with default location parameter", async () => {
      fetchStub = stubFetch(emptyResponse);

      await fetchEngagementOpportunities(serverConfigMock)({
        limit: 10,
        offset: 20,
      });

      const expectedUrl = new URL(
        "https://test.com/api/searchengagement?limit=10&offset=20&city=ALL_CITIES",
      );

      const expectedHeaders = { headers: { "x-voltastics-token": "ABC123" } };

      assertSpyCall(fetchStub, 0, {
        args: [expectedUrl, expectedHeaders],
      });
    });

    it("correctly parses empty response", async () => {
      fetchStub = stubFetch(emptyResponse);

      const result = await fetchEngagementOpportunities(serverConfigMock)({
        limit: 0,
        offset: 0,
        location: Munich,
      });

      assertEquals(result, { totalResults: 0, data: [] });
    });

    it("correctly parses engagement list", async () => {
      fetchStub = stubFetch(validEngagementsResponse);

      const graphQLServer = createGraphQLServer(noCacheServerConfig, fakeVolunteeringDB);

      const result = await queryEngagementOpportunities(graphQLServer);

      assertEquals(result, engagementsResponse);
    });

    it("throws error for invalid engagements response", async () => {
      fetchStub = stub(
        globalThis,
        "fetch",
        returnsNext([Promise.resolve(new Response("foobar"))]),
      );

      await assertRejects(() =>
        fetchEngagementOpportunities(serverConfigMock)({
          limit: 0,
          offset: 0,
          location: Munich,
        })
      );
    });
  });

  describe("querying categories", () => {
    it("correctly parses category list", async () => {
      fetchStub = stubFetch(apiCategoriesResponse);

      const graphQLServer = createGraphQLServer(noCacheServerConfig, fakeVolunteeringDB);

      const result = await queryCategories(graphQLServer);

      assertEquals(result, categories);
    });

    it("throws error for invalid categories response", async () => {
      fetchStub = stub(
        globalThis,
        "fetch",
        returnsNext([Promise.resolve(new Response("foobar"))]),
      );

      await assertRejects(() => fetchCategories(voltasticsConfigMock));
    });
  });
});
