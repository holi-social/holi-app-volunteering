import { returnsNext, stub } from "./dev_deps.ts";
import { GraphQLServer } from "./server.ts";
import { opentelemetry } from "./deps.ts";

export const meterMock: opentelemetry.Meter = {
  createHistogram: (_name: string) =>
    new (class {
      record<AttributesTypes>(_value: number, _attributes?: AttributesTypes, _context?: opentelemetry.Context): void {}
    })(),
} as unknown as opentelemetry.Meter;

export type ResponsePayload = Record<string, unknown> | Array<unknown> | Error;

export const stubFetchWithResponses = (responses: ResponsePayload[]) => {
  return stub(
    globalThis,
    "fetch",
    returnsNext(
      responses.map((response) => Promise.resolve(new Response(JSON.stringify(response)))),
    ),
  );
};

export const stubFetch = (response: ResponsePayload) => {
  return stubFetchWithResponses([response]);
};

export const processGqlRequest = (
  graphQLServer: GraphQLServer,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<Record<string, unknown> | undefined | null> => {
  const request = new Request("http://localhost:8004/graphql", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "accept": "*/*",
    },
    body: JSON.stringify({
      operationName: null,
      variables: variables,
      query: query,
    }),
  });
  return graphQLServer.handleRequest(request)
    // deno-lint-ignore no-explicit-any
    .then((response: any) => response.json())
    // deno-lint-ignore no-explicit-any
    .then((response: any) => response.data);
};
