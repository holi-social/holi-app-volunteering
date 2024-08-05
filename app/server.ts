import {
  CategoriesResponse,
  CitiesResponse,
  EngagementOpportunitiesParameters,
  EngagementParameters,
  EngagementRecommendationsParameters,
  EngagementResponse,
  EngagementsParameters,
  EngagementsResponse,
  TrackEngagementViewParameters,
  TrackEngagementViewResponse,
} from "./types.ts";
import { createSchema, createYoga, serve, useResponseCache } from "./deps.ts";
import {
  fetchCategories,
  fetchCities,
  fetchEngagement,
  fetchEngagementOpportunities,
  fetchEngagementRecommendations,
  fetchEngagements,
  trackEngagementView,
} from "./voltastics.ts";
import { logger } from "./logging.ts";
import { DatabaseConfig } from "./database.ts";

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
        engagementOpportunities(offset: Int! = 0, limit: Int! = 10, location: GeoJSON, category: String): EngagementsResponse!
        engagementRecommendations(offset: Int! = 0, limit: Int! = 10, topics: [String!], skills: [String!], location: GeoJSON): EngagementsResponse!
        engagement(id: String!): Engagement
        categories: CategoriesResponse!
        engagements(offset: Int! = 0, limit: Int! = 10, location: String, category: String, longitude: Float, latitude: Float, radiusKm: Float): EngagementsResponse! @deprecated(reason: "Use engagementOpportunities instead, as its support will be discontinued after 1.5.1.")
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
    ): Promise<EngagementsResponse> =>
      config.fake
        ? Promise.resolve({ totalResults: 0, data: [] })
        : fetchEngagementOpportunities(config)(parameters),
    engagement: (
      // deno-lint-ignore no-explicit-any
      _parent: any,
      parameters: EngagementParameters,
    ): Promise<EngagementResponse> =>
      config.fake ? Promise.resolve(null) : fetchEngagement(config)(parameters),
    categories: (
      // deno-lint-ignore no-explicit-any
      _parent: any,
    ): Promise<CategoriesResponse> =>
      config.fake
        ? Promise.resolve({ data: [] })
        : fetchCategories(config.voltastics),
    engagements: (
      // deno-lint-ignore no-explicit-any
      _parent: any,
      parameters: EngagementsParameters,
    ): Promise<EngagementsResponse> =>
      config.fake
        ? Promise.resolve({ totalResults: 0, data: [] })
        : fetchEngagements(config)(parameters),
    cities: (
      // deno-lint-ignore no-explicit-any
      _parent: any,
    ): Promise<CitiesResponse> =>
      config.fake
        ? Promise.resolve({ data: [] })
        : fetchCities(config.voltastics),
    engagementRecommendations: (
      // deno-lint-ignore no-explicit-any
      _parent: any,
      parameters: EngagementRecommendationsParameters,
    ): Promise<EngagementsResponse> =>
      config.fake
        ? Promise.resolve({ totalResults: 0, data: [] })
        : fetchEngagementRecommendations(config)(parameters),
  },
  Mutation: {
    trackEngagementView: (
      // deno-lint-ignore no-explicit-any
      _parent: any,
      parameters: TrackEngagementViewParameters,
    ): Promise<TrackEngagementViewResponse> =>
      config.fake
        ? Promise.resolve({ id: parameters.id })
        : trackEngagementView(config.voltastics)(parameters),
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
  port: number; // default: 8004
  cacheEnabled: boolean; // default: true
  cacheTtlMsVoltastics: number; // default: 60 seconds
  voltastics: VoltasticsConfig;
  imageProxyBaseUrl: string;
  fake: boolean; // For local development. If set, the API returns dummy data
  volunteeringDB: DatabaseConfig;
}

export const createGraphQLServer = (config: ServerConfig): GraphQLServer => {
  const plugins = config.cacheEnabled
    ? [
      useResponseCache({
        session: () => null, // global cache, shared by all users
        ttlPerSchemaCoordinate: {
          "Query.engagementOpportunities": config.cacheTtlMsVoltastics,
          "Query.engagement": config.cacheTtlMsVoltastics,
          "Query.categories": config.cacheTtlMsVoltastics,
          "Query.engagements": config.cacheTtlMsVoltastics,
          "Query.cities": config.cacheTtlMsVoltastics,
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
    port: config.port,
    onListen({ port, hostname }) {
      logger.info(
        `Server started at http://${
          hostname === "0.0.0.0" ? "localhost" : hostname
        }:${port}/graphql`,
      );
      if (config.fake) {
        logger.info(
          `Server is serving fake data due to FAKE env var set to true`,
        );
      }
    },
  });
};
