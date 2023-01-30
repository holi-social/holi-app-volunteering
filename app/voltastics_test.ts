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
  CitiesResponse,
  Engagement,
  EngagementsResponse,
} from "./types.ts";
import {
  createGraphQLServer,
  GraphQLServer,
  VoltasticsConfig,
} from "./server.ts";

import {
  apiCategoriesResponse,
  apiCitiesResponse,
  apiSearchEngagement1,
  apiSearchEngagementsResponse,
  categories,
  cities,
  engagement1,
  engagementsResponse,
} from "./voltastics_test_data.ts";
import {
  fetchCategories,
  fetchCities,
  fetchEngagement,
  fetchEngagements,
} from "./voltastics.ts";

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

const cityFragment = `
name
`;

const categoryFragment = `
name
`;

const queryEngagements = async (
  graphQLServer: GraphQLServer,
): Promise<EngagementsResponse> => {
  const promise = processGqlRequest(
    graphQLServer,
    `
      query engagements($limit:Int!, $offset: Int!, $location: String!) {
        engagements(limit: $limit, offset: $offset, location: $location) {
          totalResults
          data {
            ${engagementFragment}
          }
        }
      }`,
    { limit: 10, offset: 20, location: "Hamburg" },
  );

  return (await promise)?.engagements as EngagementsResponse;
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

const queryCities = async (
  graphQLServer: GraphQLServer,
): Promise<CitiesResponse> => {
  const promise = processGqlRequest(
    graphQLServer,
    `
      query cities {
        cities {
          data {
            ${cityFragment}
          }
        }
      }`,
    {},
  );

  return (await promise)?.cities as CitiesResponse;
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
  baseUrl: "https://backend.voltastics.com/api",
  apiToken: "ABC123",
};

describe("voltastics", () => {
  let fetchStub: Stub;

  afterEach(() => {
    fetchStub?.restore();
  });

  describe("querying engagement list", () => {
    it("calls api with correct parameters", async () => {
      fetchStub = stubFetch(emptyResponse);

      await fetchEngagements(voltasticsConfigMock)({
        limit: 10,
        offset: 20,
        location: "Hamburg",
      });

      const expectedUrl = new URL(
        "https://backend.voltastics.com/api/searchengagement?limit=10&offset=20&city=Hamburg",
      );

      const expectedHeaders = { headers: { "x-voltastics-token": "ABC123" } };

      assertSpyCall(fetchStub, 0, {
        args: [expectedUrl, expectedHeaders],
      });
    });
    it("calls api with default location parameter", async () => {
      fetchStub = stubFetch(emptyResponse);

      await fetchEngagements(voltasticsConfigMock)({ limit: 10, offset: 20 });

      const expectedUrl = new URL(
        "https://backend.voltastics.com/api/searchengagement?limit=10&offset=20&city=ALL_CITIES",
      );

      const expectedHeaders = { headers: { "x-voltastics-token": "ABC123" } };

      assertSpyCall(fetchStub, 0, {
        args: [expectedUrl, expectedHeaders],
      });
    });

    it("correctly parses empty response", async () => {
      fetchStub = stubFetch(emptyResponse);

      const result = await fetchEngagements(voltasticsConfigMock)({
        limit: 0,
        offset: 0,
        location: "Munich",
      });

      assertEquals(result, { totalResults: 0, data: [] });
    });

    it("correctly parses engagement list", async () => {
      fetchStub = stubFetch(validEngagementsResponse);

      const graphQLServer = createGraphQLServer({
        cacheEnabled: false,
        voltastics: voltasticsConfigMock,
      });

      const result = await queryEngagements(graphQLServer);

      assertEquals(result, engagementsResponse);
    });

    it("throws error for invalid engagements response", async () => {
      fetchStub = stub(
        globalThis,
        "fetch",
        returnsNext([Promise.resolve(new Response("foobar"))]),
      );

      await assertRejects(() =>
        fetchEngagements(voltasticsConfigMock)({
          limit: 0,
          offset: 0,
          location: "Hamburg",
        })
      );
    });
  });

  describe("querying engagement by id", () => {
    it("calls api with correct parameters", async () => {
      fetchStub = stubFetch(apiSearchEngagement1);

      await fetchEngagement(voltasticsConfigMock)({
        id: apiSearchEngagement1.id.toString(),
      });

      const expectedUrl = new URL(
        "https://backend.voltastics.com/api/engagement?id=92403",
      );
      const expectedHeaders = { headers: { "x-voltastics-token": "ABC123" } };

      assertSpyCall(fetchStub, 0, {
        args: [expectedUrl, expectedHeaders],
      });
    });

    it("correctly parses empty response", async () => {
      fetchStub = stubFetch(emptyResponse);

      const result = await fetchEngagement(voltasticsConfigMock)({
        id: "",
      });

      assertEquals(result, null);
    });

    it("correctly parses engagement", async () => {
      fetchStub = stubFetch(apiSearchEngagement1);

      const graphQLServer = createGraphQLServer({
        cacheEnabled: false,
        voltastics: voltasticsConfigMock,
      });

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
        fetchEngagement(voltasticsConfigMock)({
          id: "92403",
        })
      );
    });
  });

  describe("querying cities", () => {
    it("correctly parses cities list", async () => {
      fetchStub = stubFetch(apiCitiesResponse);

      const graphQLServer = createGraphQLServer({
        cacheEnabled: false,
        voltastics: voltasticsConfigMock,
      });

      const result = await queryCities(graphQLServer);

      assertEquals(result, cities);
    });

    it("throws error for invalid cities response", async () => {
      fetchStub = stub(
        globalThis,
        "fetch",
        returnsNext([Promise.resolve(new Response("foobar"))]),
      );

      await assertRejects(() => fetchCities(voltasticsConfigMock));
    });
  });

  describe("querying categorie", () => {
    it("correctly parses category list", async () => {
      fetchStub = stubFetch(apiCategoriesResponse);

      const graphQLServer = createGraphQLServer({
        cacheEnabled: false,
        voltastics: voltasticsConfigMock,
      });

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
