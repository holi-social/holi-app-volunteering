import { returnsNext, stub } from "./dev_deps.ts";
import { GraphQLServer } from "./server.ts";

export type ResponsePayload = Record<string, unknown> | Error;

export const stubFetch = (response: ResponsePayload) => {
  return stub(
    globalThis,
    "fetch",
    returnsNext([Promise.resolve(new Response(JSON.stringify(response)))]),
  );
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
