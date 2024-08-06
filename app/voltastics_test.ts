import {
  afterEach,
  assertEquals,
  assertRejects,
  assertSpyCall,
  describe,
  it,
  returnsNext,
  Stub,
  stub,
} from "./dev_deps.ts";
import { processGqlRequest, stubFetch } from "./common_test.ts";

import {
  CategoriesResponse,
  Engagement,
  EngagementsResponse,
} from "./types.ts";
import {
  createGraphQLServer,
  GraphQLServer,
  ServerConfig,
  VoltasticsConfig,
} from "./server.ts";

import {
  apiCategoriesResponse,
  apiSearchEngagement1,
  apiSearchEngagementsResponse,
  categories,
  engagement1,
  engagementsResponse,
  Munich,
} from "./voltastics_test_data.ts";
import {
  fetchCategories,
  fetchEngagement,
  fetchEngagementOpportunities,
} from "./voltastics.ts";
import { GraphQLError } from "./deps.ts";

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

const queryEngagement = async (
  graphQLServer: GraphQLServer,
): Promise<Engagement> => {
  const promise = processGqlRequest(
    graphQLServer,
    `
    query engagement($id: String!) {
      engagement(id: $id) {
        ${engagementFragment}
      }
    }`,
    { id: engagement1.id },
  );

  return (await promise)?.engagement as Engagement;
};

const queryCategories = async (
  graphQLServer: GraphQLServer,
): Promise<CategoriesResponse> => {
  const promise = processGqlRequest(
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

  return (await promise)?.categories as CategoriesResponse;
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
  fake: false,
  volunteeringDB: {
    hostname: "fakehost",
    port: "1234",
    database: "volunteering",
    password: "secret",
    username: "admin",
    connectionAttempts: 10,
  },
};

const noCacheServerConfig = {
  cacheEnabled: false,
  voltastics: voltasticsConfigMock,
  imageProxyBaseUrl: serverConfigMock.imageProxyBaseUrl,
  port: 0,
  cacheTtlMsVoltastics: 0,
  fake: false,
  volunteeringDB: {
    hostname: "fakehost",
    port: "1234",
    database: "volunteering",
    password: "secret",
    username: "admin",
    connectionAttempts: 10,
  },
};

describe("voltastics", () => {
  let fetchStub: Stub;

  afterEach(() => {
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

      const graphQLServer = createGraphQLServer(noCacheServerConfig);

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

  describe("querying engagement by id", () => {
    it("calls api with correct parameters", async () => {
      fetchStub = stubFetch(apiSearchEngagement1);

      await fetchEngagement(serverConfigMock)({
        id: apiSearchEngagement1.id.toString(),
      });

      const expectedUrl = new URL(
        "https://test.com/api/engagement?id=92403",
      );
      const expectedHeaders = { headers: { "x-voltastics-token": "ABC123" } };

      assertSpyCall(fetchStub, 0, {
        args: [expectedUrl, expectedHeaders],
      });
    });

    it("correctly parses empty response", async () => {
      fetchStub = stubFetch(emptyResponse);

      const result = await fetchEngagement(serverConfigMock)({
        id: "",
      });

      assertEquals(result, null);
    });

    it("correctly parses engagement", async () => {
      fetchStub = stubFetch(apiSearchEngagement1);

      const graphQLServer = createGraphQLServer(noCacheServerConfig);

      const result = await queryEngagement(graphQLServer);

      assertEquals(result, engagement1);
    });

    it("throws error for invalid engagement response", async () => {
      fetchStub = stub(
        globalThis,
        "fetch",
        returnsNext([Promise.resolve(new Response("foobar"))]),
      );

      await assertRejects(() =>
        fetchEngagement(serverConfigMock)({
          id: "92403",
        })
      );
    });

    it("throws NOT_FOUND error for 404 response", async () => {
      fetchStub = stub(
        globalThis,
        "fetch",
        returnsNext([Promise.resolve({ status: 404 } as Response)]),
      );

      await assertRejects(
        () =>
          fetchEngagement(serverConfigMock)({
            id: "92403",
          }),
        GraphQLError,
        "Not found",
      );
    });
  });

  describe("querying categories", () => {
    it("correctly parses category list", async () => {
      fetchStub = stubFetch(apiCategoriesResponse);

      const graphQLServer = createGraphQLServer(noCacheServerConfig);

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
