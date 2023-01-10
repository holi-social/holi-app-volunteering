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

import { EngagementsResponse } from "./types.ts";
import {
  createGraphQLServer,
  GraphQLServer,
  VoltasticsConfig,
} from "./server.ts";
import setupLogging from "./logging.ts";

import {
  apiSearchEngagementsResponse,
  engagementsResponse,
} from "./voltastics_test_data.ts";
import { fetchEngagements } from "./voltastics.ts";

const emptyResponse = {
  success: true,
};

const validResponse = apiSearchEngagementsResponse;

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

const voltasticsConfigMock: VoltasticsConfig = {
  baseUrl: "https://backend.voltastics.com/api",
  apiToken: "ABC123",
};

setupLogging("test");

describe("voltastics", () => {
  let fetchStub: Stub;

  afterEach(() => {
    fetchStub?.restore();
  });

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
    fetchStub = stubFetch(validResponse);

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
