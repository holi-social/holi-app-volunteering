import {
  CategoriesResponse,
  EngagementOpportunitiesParameters,
  EngagementParameters,
  EngagementRecosParameters,
  EngagementRecosResponse,
  EngagementResponse,
  EngagementsResponse,
  FilteredEngagementsParameters,
  TrackEngagementViewParameters,
  TrackEngagementViewResponse,
} from "./types.ts";
import { createSchema, createYoga, deadline, DeadlineError, useResponseCache } from "./deps.ts";
import { fetchCategories, fetchEngagementOpportunities, trackEngagementView } from "./voltastics.ts";
import { logger } from "./logging.ts";
import { PostgresVolunteeringDB, VolunteeringDB, VolunteeringDBConfig } from "./volunteering_db.ts";
import { GeoAPIClient } from "./geo_api_client.ts";
import { Client } from "https://deno.land/x/postgres@v0.19.3/client.ts";

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
      
      """
      An array of topic slugs matching the engagement. Ordered by confidence DESC (typically, may be subject to change). 
      """
      topics: [String]
      
      """
      An array of skill slugs matching the engagement. Ordered by confidence DESC (typically, may be subject to change).
      """
      skills: [String]
      
      """
      Deprecated with the introduction of the EngagementReco type / engagementReco query.
      If this engagement is part of a recommendation query response, matchedTopics contains the slugs of matched topics. The order is defined as follows: 1) topics that were part of the query come first (sorted by matching confidence). 2) other topics the engagement matches (sorted by matching confidence)
      """
      matchedTopics: [String]
      
      """
      Deprecated with the introduction of the EngagementReco type / engagementReco query.
      If this engagement is part of a recommendation query response, matchedSkills contains the slugs of matched skills. The order is defined as follows: 1) skills that were part of the query come first (sorted by matching confidence). 2) other topics the engagement matches (sorted by matching confidence)
      """
      matchedSkills: [String]
      
      """
      Deprecated with the introduction of the EngagementReco type / engagementReco query.
      If this engagement is part of a recommendation query response, matchedGeoLocationDistanceInMeters contains the distance (in meters) between the engagement and the location given in the query.
      """
      matchedGeoLocationDistanceInMeters: Float
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
    
    type EngagementReco {
    
      engagement: Engagement!
      
      """
      Contains the slugs of matched topics. The order is defined as follows: 1) topics that were part of the query come first (sorted by matching confidence). 2) other topics the engagement matches (sorted by matching confidence)
      """
      matchedTopics: [String]
      
      """
      Contains the slugs of matched skills. The order is defined as follows: 1) skills that were part of the query come first (sorted by matching confidence). 2) other topics the engagement matches (sorted by matching confidence)
      """
      matchedSkills: [String]
      
      """
      Contains the distance (in meters) between the engagement and the location given in the query.
      """
      matchedGeoLocationDistanceInMeters: Float
    }
    
    type EngagementRecosResponse {
      totalResults: Int!
      data: [EngagementReco]!
    }
    
    scalar GeoJSON

    type Query {
        # uses offset-based pagination as described in https://www.apollographql.com/docs/react/pagination/offset-based
        engagementOpportunities(offset: Int! = 0, limit: Int! = 10, location: GeoJSON, category: String): EngagementsResponse!
        
        """
        Retrieves a list of recommendations based on the request parameters "topics", "skills" and "geoLocationId". "topics" contains slugs of the "Topic" type, "skills" contains slugs of the "Skill" type, "geoLocationId" contains the ID of a location as returned by the "geo_*" queries.
        """
        engagementRecommendations(offset: Int! = 0, limit: Int! = 10, topics: [String!] = [], skills: [String!] = [], geolocationId: String): EngagementsResponse!
        
        """
        Retrieves a list of recommendations based on the request parameters "topics", "skills" and "geoLocationId". "topics" contains slugs of the "Topic" type, "skills" contains slugs of the "Skill" type, "geoLocationId" contains the ID of a location as returned by the "geo_*" queries.
        """
        engagementRecos(offset: Int! = 0, limit: Int! = 10, topics: [String!] = [], skills: [String!] = [], geolocationId: String): EngagementRecosResponse!
        
        engagement(id: String!): Engagement
        
        categories: CategoriesResponse!
        
        filteredEngagements(offset: Int! = 0, limit: Int! = 10, topics: [String!] = [], skills: [String!] = [], geolocationId: String): EngagementsResponse!
    }

    type Mutation {
        trackEngagementView(id: String!): TrackEngagementViewResponse!
    }
`;

const createResolvers = (
  config: ServerConfig,
  volunteeringDB: VolunteeringDB,
) => ({
  Query: {
    engagementOpportunities: (
      // deno-lint-ignore no-explicit-any
      _parent: any,
      parameters: EngagementOpportunitiesParameters,
    ): Promise<EngagementsResponse> =>
      config.fake ? Promise.resolve({ totalResults: 0, data: [] }) : fetchEngagementOpportunities(config)(parameters),
    engagement: (
      // deno-lint-ignore no-explicit-any
      _parent: any,
      parameters: EngagementParameters,
    ): Promise<EngagementResponse> => config.fake ? Promise.resolve(null) : volunteeringDB.engagementById(parameters),
    categories: (
      // deno-lint-ignore no-explicit-any
      _parent: any,
    ): Promise<CategoriesResponse> => config.fake ? Promise.resolve({ data: [] }) : fetchCategories(config.voltastics),
    filteredEngagements: (
      // deno-lint-ignore no-explicit-any
      _parent: any,
      parameters: FilteredEngagementsParameters,
    ): Promise<EngagementsResponse> =>
      config.fake ? Promise.resolve({ totalResults: 0, data: [] }) : volunteeringDB.filterEngagements(parameters),
    engagementRecommendations: (
      // deno-lint-ignore no-explicit-any
      _parent: any,
      parameters: EngagementRecosParameters,
    ): Promise<EngagementsResponse> =>
      config.fake ? Promise.resolve({ totalResults: 0, data: [] }) : volunteeringDB.findRecommendations(parameters),
    engagementRecos: (
      // deno-lint-ignore no-explicit-any
      _parent: any,
      parameters: EngagementRecosParameters,
    ): Promise<EngagementRecosResponse> =>
      config.fake ? Promise.resolve({ totalResults: 0, data: [] }) : volunteeringDB.findRecos(parameters),
  },
  Mutation: {
    trackEngagementView: (
      // deno-lint-ignore no-explicit-any
      _parent: any,
      parameters: TrackEngagementViewParameters,
    ): Promise<TrackEngagementViewResponse> =>
      config.fake ? Promise.resolve({ id: parameters.id }) : trackEngagementView(config.voltastics)(parameters),
  },
});

export const DEFAULT_PORT = 8004;
export const DEFAULT_CACHE_ENABLED = true;
export const DEFAULT_CACHE_TTL_MS_VOLTASTICS = 86_400_000; // 24 hours
export const DEFAULT_CACHE_TTL_MS_DB = 3_600_000; // 1 hour

export const DEFAULT_DB_CONNECTION_ATTEMPTS = 10;

export interface VoltasticsConfig {
  baseUrl: string;
  apiToken: string;
}
export interface ServerConfig {
  port: number; // default: 8004
  cacheEnabled: boolean; // default: true
  cacheTtlMsVoltastics: number; // default: 24 hours
  cacheTtlMsDB: number; // default: 1 hour
  voltastics: VoltasticsConfig;
  imageProxyBaseUrl: string;
  fake: boolean; // For local development. If set, the API returns dummy data
  volunteeringDB: VolunteeringDBConfig;
  geoAPIEndpointUrl: string;
}

export const createGraphQLServer = (config: ServerConfig, volunteeringDB: VolunteeringDB): GraphQLServer => {
  const plugins = config.cacheEnabled
    ? [
      useResponseCache({
        session: () => null, // global cache, shared by all users
        ttlPerSchemaCoordinate: {
          "Query.engagementOpportunities": config.cacheTtlMsVoltastics,
          "Query.engagement": config.cacheTtlMsVoltastics,
          "Query.categories": config.cacheTtlMsVoltastics,
          "Query.filteredEngagements": config.cacheTtlMsDB,
          "Query.engagementRecommendations": config.cacheTtlMsDB,
        },
      }),
    ]
    : [];
  const resolvers = createResolvers(config, volunteeringDB);
  return createYoga({
    schema: createSchema({ resolvers, typeDefs }),
    graphiql: true,
    plugins,
  });
};

// deno-lint-ignore no-explicit-any
export type GraphQLServer = any;

const isDbConnectionAlive = async (client: Client): Promise<Response> => {
  const timeout = 10_000;
  try {
    const resultP = client.queryObject<{ db_connection_is_alive: boolean }>`SELECT true as db_connection_is_alive`;
    const result = await deadline(resultP, timeout);
    const alive = result.rowCount && result.rowCount > 0 && result.rows[0].db_connection_is_alive || false;
    return new Response(`${alive}`);
  } catch (e) {
    if (e instanceof DeadlineError) {
      console.error(`Liveness check timed out after ${timeout} ms`);
      return new Response(null, { status: 503 });
    } else {
      console.error("Liveness check failed, reason: ", e);
      return new Response(null, { status: 500 });
    }
  }
};

export const startServer = (config: ServerConfig): Deno.HttpServer<Deno.NetAddr> => {
  const client = new Client({
    hostname: config.volunteeringDB.hostname,
    port: config.volunteeringDB.port,
    database: config.volunteeringDB.database,
    user: config.volunteeringDB.username,
    password: config.volunteeringDB.password,
    controls: {
      debug: {
        queries: false,
        notices: false,
        results: true,
        queryInError: true,
      },
    },
    connection: {
      attempts: config.volunteeringDB.connectionAttempts,
    },
  });
  const geoAPIClient = new GeoAPIClient(config.geoAPIEndpointUrl);
  const volunteeringDB = new PostgresVolunteeringDB(
    client,
    config.imageProxyBaseUrl,
    geoAPIClient,
  );
  const graphQLServer: GraphQLServer = createGraphQLServer(config, volunteeringDB);
  return Deno.serve({
    port: config.port,
    hostname: "0.0.0.0",
    handler: (req: Request) => {
      const url = new URL(req.url);
      console.debug(url.pathname);
      if (url.pathname.startsWith("/liveness")) return isDbConnectionAlive(client);
      else return graphQLServer.handleRequest(req);
    },
    onListen({ port, hostname }) {
      logger.info(
        `Server started at http://${hostname === "0.0.0.0" ? "localhost" : hostname}:${port}/graphql`,
      );
      if (config.fake) {
        logger.info(
          `Server is serving fake data due to FAKE env var set to true`,
        );
      }
    },
  });
};
