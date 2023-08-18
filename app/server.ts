import {
  EngagementOpportunitiesParameters,
  EngagementParameters,
  EngagementsParameters,
  TrackEngagementViewParameters,
} from "./types.ts";
import { createSchema, createYoga, serve, useResponseCache } from "./deps.ts";
import {
  fetchCategories,
  fetchCities,
  fetchEngagement,
  fetchEngagementOpportunities,
  fetchEngagements,
  trackEngagementView,
} from "./voltastics.ts";
import { logger } from "./logging.ts";

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
      imageUrlOriginal: String
      source: String
      categories: [String]!
      organizer: Organizer
      location: String
      latitude: Float
      longitude: Float
    }
    

    type Category {
      name: String!
    }

    type CategoriesResponse {
      data: [Category!]!
    }

    type EngagementsResponse {
      totalResults: Int!
      data: [Engagement]!
    }
    
    scalar GeoJSON

    type City {
      name: String!
    }

    type CitiesResponse {
      data: [City]!
    }

  
    type Query {
        # uses offset-based pagination as described in https://www.apollographql.com/docs/react/pagination/offset-based
        engagementOpportunities(offset: Int!, limit: Int!, location: GeoJSON, category: String): EngagementsResponse!
        engagement(id: String!): Engagement
        categories: CategoriesResponse!
        engagements(offset: Int!, limit: Int!, location: String, category: String, longitude: Float, latitude: Float, radiusKm: Float): EngagementsResponse! @deprecated(reason: "Use engagementOpportunities instead, as its support will be discontinued after 1.5.1.")
        cities: CitiesResponse! @deprecated(reason: "It will no longer be supported after 1.5.1.")
    }

    type Mutation {
        trackEngagementView(id: String!): TrackEngagementViewResponse!
    }
`;

const createResolvers = (config: ServerConfig) => ({
  Query: {
    engagementOpportunities: (
      // deno-lint-ignore no-explicit-any
      _parent: any,
      parameters: EngagementOpportunitiesParameters,
    ) => fetchEngagementOpportunities(config)(parameters),
    engagement: (
      // deno-lint-ignore no-explicit-any
      _parent: any,
      parameters: EngagementParameters,
    ) => fetchEngagement(config)(parameters),
    categories: (
      // deno-lint-ignore no-explicit-any
      _parent: any,
    ) => fetchCategories(config.voltastics),
    engagements: (
      // deno-lint-ignore no-explicit-any
      _parent: any,
      parameters: EngagementsParameters,
    ) => fetchEngagements(config)(parameters),
    cities: (
      // deno-lint-ignore no-explicit-any
      _parent: any,
    ) => fetchCities(config.voltastics),
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
  cacheEnabled: boolean; // default: true
  cacheTtlMsVoltastics?: number; // default: 60 seconds
  voltastics: VoltasticsConfig;
  imageProxyBaseUrl: string;
}

export const createGraphQLServer = (config: ServerConfig): GraphQLServer => {
  const plugins = config.cacheEnabled
    ? [
      useResponseCache({
        session: () => null, // global cache, shared by all users
        ttlPerSchemaCoordinate: {
          "Query.engagementOpportunities": config.cacheTtlMsVoltastics ||
            DEFAULT_CACHE_TTL_MS_VOLTASTICS,
          "Query.engagement": config.cacheTtlMsVoltastics ||
            DEFAULT_CACHE_TTL_MS_VOLTASTICS,
          "Query.categories": config.cacheTtlMsVoltastics ||
            DEFAULT_CACHE_TTL_MS_VOLTASTICS,
          "Query.engagements": config.cacheTtlMsVoltastics ||
            DEFAULT_CACHE_TTL_MS_VOLTASTICS,
          "Query.cities": config.cacheTtlMsVoltastics ||
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
      logger.info(
        `Server started at http://${
          hostname === "0.0.0.0" ? "localhost" : hostname
        }:${port}/graphql`,
      );
    },
  });
};
