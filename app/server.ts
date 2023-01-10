import {
  EngagementsParameters,
  TrackEngagementViewParameters,
} from "./types.ts";
import { createSchema, createYoga, serve, useResponseCache } from "./deps.ts";
import { fetchEngagements, trackEngagementView } from "./voltastics.ts";

const typeDefs = `
    type Organizer {
      name: String
      imageUrl: String
    }

    type TrackEngagementViewResponse {
      id: String
    }

    type Engagement {
      id: String
      title: String
      description: String
      url: String
      imageUrl: String
      source: String
      categories: [String]!
      organizer: Organizer
      location: String
      latitude: Int
      longitude: Int
    }

    type EngagementsResponse {
      totalResults: Int!
      data: [Engagement]!
    }

    type Query {
        # uses offset-based pagination as described in https://www.apollographql.com/docs/react/pagination/offset-based
        engagements(offset: Int!, limit: Int!, location: String!, categories: [String], longitude: Int, latitude: Int, radiusKm: Int): EngagementsResponse!
        categories: [String!]!
    }

    type Mutation {
        trackEngagementView(id: String!): TrackEngagementViewResponse!
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
  Mutation: {
    trackEngagementView: (
      // deno-lint-ignore no-explicit-any
      _parent: any,
      parameters: TrackEngagementViewParameters,
    ) => trackEngagementView(config.voltastics)(parameters),
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

export const createGraphQLServer = (config: ServerConfig): GraphQLServer => {
  const plugins = config.cacheEnabled || DEFAULT_CACHE_ENABLED
    ? [
      useResponseCache({
        session: () => null, // global cache, shared by all users
        ttlPerSchemaCoordinate: {
          "Query.engagements": config.cacheTtlMsVoltastics ||
            DEFAULT_CACHE_TTL_MS_VOLTASTICS,
        },
      }),
    ]
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

export const startServer = (config: ServerConfig): Promise<void> => {
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
