import { EngagementsParameters } from "./types.ts";
import { createSchema, createYoga, serve, useResponseCache } from "./deps.ts";
import { fetchEngagements } from "./voltastics.ts";

const typeDefs = `
    type Engagement {
      id: Int
      title: String
      description: String
      link: String
      image: String
      source: String
      uses: [String]!
      hashTags: [String]!
      orga: String
      imageOrga:String
      location: String
      latitude: Int
      longitude: Int
    }

    type EngagementsResponse {
      totalResults: Int!
      engagements: [Engagement]!
    }

    type Query {
        # uses offset-based pagination as described in https://www.apollographql.com/docs/react/pagination/offset-based
        engagements(offset: Int!, limit: Int!, location: String!): EngagementsResponse!
        engagement(id: Int!): Engagement!
    }
`;

const createResolvers = (config: ServerConfig) => ({
  Query: {
    engagements: (
      // deno-lint-ignore no-explicit-any
      _parent: any,
      parameters: EngagementsParameters,
    ) => fetchEngagements(config.voltastics)(parameters),
  },
});

export const DEFAULT_PORT = 8004;
export const DEFAULT_CACHE_ENABLED = true;
export const DEFAULT_CACHE_TTL_MS_VOLTASTICS = 60_000;

export interface VoltasticsConfig {
  baseUrl: string;
  apiToken: string;
}
export interface ServerConfig {
  port?: number; // default: 8004
  cacheEnabled?: boolean; // default: true
  cacheTtlMsVoltastics?: number; // default: 60 seconds
  voltastics: VoltasticsConfig;
}

export const createGraphQLServer = (
  config: ServerConfig,
): GraphQLServer => {
  const plugins = (config.cacheEnabled || DEFAULT_CACHE_ENABLED)
    ? [useResponseCache({
      session: () => null, // global cache, shared by all users
      ttlPerSchemaCoordinate: {
        "Query.engagements": config.cacheTtlMsVoltastics ||
          DEFAULT_CACHE_TTL_MS_VOLTASTICS,
      },
    })]
    : [];
  const resolvers = createResolvers(config);
  return createYoga({
    schema: createSchema({ resolvers, typeDefs }),
    graphiql: true,
    plugins,
  });
};

// deno-lint-ignore no-explicit-any
export type GraphQLServer = any;

export const startServer = (
  config: ServerConfig,
): Promise<void> => {
  const graphQLServer: GraphQLServer = createGraphQLServer(config);
  return serve(graphQLServer.handleRequest, {
    port: config.port || DEFAULT_PORT,
    onListen({ port, hostname }) {
      console.log(
        `Server started at http://${
          hostname === "0.0.0.0" ? "localhost" : hostname
        }:${port}/graphql`,
      );
    },
  });
};
