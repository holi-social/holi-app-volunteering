import {
  CategoriesResponse,
  EngagementOpportunitiesParameters,
  EngagementParameters,
  EngagementRecosParameters,
  EngagementRecosResponse,
  EngagementResponse,
  EngagementsResponse,
  FilteredEngagementsParameters,
  SimilarRecommendationsParameters,
  TrackEngagementViewParameters,
  TrackEngagementViewResponse,
} from './types.ts'
import {
  createSchema,
  createYoga,
  deadline,
  DeadlineError,
  GraphQLError,
  postgres,
  Sentry,
  useResponseCache,
} from './deps.ts'
import { fetchCategories, fetchEngagementOpportunities, trackEngagementView } from './voltastics.ts'
import { logger } from './logging.ts'
import { PostgresVolunteeringDB, VolunteeringDB } from './volunteering_db.ts'
import { GeoAPIClientImpl } from './geo_api_client.ts'
import { ServerConfig } from './config.ts'
import { Sql } from 'npm:postgres@3.4.5'

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
      categories: [String]! @deprecated(reason: "Use topics & skills instead. (since v1.34)")
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
      If this engagement is part of a recommendation query response, matchedTopics contains the slugs of matched topics. The order is defined as follows: 1) topics that were part of the query come first (sorted by matching confidence). 2) other topics the engagement matches (sorted by matching confidence)
      """
      matchedTopics: [String] @deprecated(reason: "Use the identically named field in the EngagementReco type returned by the engagementRecos query instead. (since v1.34)")
      
      """
      If this engagement is part of a recommendation query response, matchedSkills contains the slugs of matched skills. The order is defined as follows: 1) skills that were part of the query come first (sorted by matching confidence). 2) other topics the engagement matches (sorted by matching confidence)
      """
      matchedSkills: [String] @deprecated(reason: "Use the identically named field in the EngagementReco type returned by the engagementRecos query instead. (since v1.34)")
      
      """
      If this engagement is part of a recommendation query response, matchedGeoLocationDistanceInMeters contains the distance (in meters) between the engagement and the location given in the query.
      """
      matchedGeoLocationDistanceInMeters: Float @deprecated(reason: "Use the identically named field in the EngagementReco type returned by the engagementRecos query instead. (since v1.34)")
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
        engagementOpportunities(offset: Int! = 0, limit: Int! = 10, location: GeoJSON, category: String): EngagementsResponse! @deprecated(reason: "Use the engagementRecos query instead. (since v1.34)")
        
        """
        Retrieves a list of recommendations based on the request parameters "topics", "skills" and "geoLocationId". "topics" contains slugs of the "Topic" type, "skills" contains slugs of the "Skill" type, "geoLocationId" contains the ID of a location as returned by the "geo_*" queries.
        """
        engagementRecommendations(offset: Int! = 0, limit: Int! = 10, topics: [String!] = [], skills: [String!] = [], geolocationId: String): EngagementsResponse! @deprecated(reason: "Use the engagementRecos query instead. (since v1.34)")
        
        """
        Retrieves a list of recommendations based on the request parameters "topics", "skills" and "geoLocationId". "topics" contains slugs of the "Topic" type, "skills" contains slugs of the "Skill" type, "geoLocationId" contains the ID of a location as returned by the "geo_*" queries.
        """
        engagementRecos(offset: Int! = 0, limit: Int! = 10, topics: [String!] = [], skills: [String!] = [], geolocationId: String): EngagementRecosResponse!
        
        engagement(id: String!): Engagement
        
        categories: CategoriesResponse! @deprecated(reason: "Not in use anymore since the introduction of the engagementRecos query (since v1.34)")
        
        filteredEngagements(offset: Int! = 0, limit: Int! = 10, topics: [String!] = [], skills: [String!] = [], geolocationId: String): EngagementsResponse!

        similarRecommendations(offset: Int! = 0, limit: Int! = 10, id: String!): EngagementsResponse!
    }

    type Mutation {
        trackEngagementView(id: String!): TrackEngagementViewResponse!
    }
`

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
    categories: (
      // deno-lint-ignore no-explicit-any
      _parent: any,
    ): Promise<CategoriesResponse> => config.fake ? Promise.resolve({ data: [] }) : fetchCategories(config.voltastics),
    engagement: (
      // deno-lint-ignore no-explicit-any
      _parent: any,
      parameters: EngagementParameters,
    ): Promise<EngagementResponse> =>
      config.fake ? Promise.resolve(null) : Sentry.startNewTrace(() => volunteeringDB.engagement(parameters)),
    filteredEngagements: (
      // deno-lint-ignore no-explicit-any
      _parent: any,
      parameters: FilteredEngagementsParameters,
    ): Promise<EngagementsResponse> =>
      config.fake
        ? Promise.resolve({ totalResults: 0, data: [] })
        : Sentry.startNewTrace(() => volunteeringDB.filteredEngagements(parameters)),
    engagementRecommendations: (
      // deno-lint-ignore no-explicit-any
      _parent: any,
      parameters: EngagementRecosParameters,
    ): Promise<EngagementsResponse> =>
      config.fake
        ? Promise.resolve({ totalResults: 0, data: [] })
        : Sentry.startNewTrace(() => volunteeringDB.engagementRecommendations(parameters)),
    engagementRecos: (
      // deno-lint-ignore no-explicit-any
      _parent: any,
      parameters: EngagementRecosParameters,
    ): Promise<EngagementRecosResponse> =>
      config.fake
        ? Promise.resolve({ totalResults: 0, data: [] })
        : Sentry.startNewTrace(() => volunteeringDB.engagementRecos(parameters)),
    similarRecommendations: (
      // deno-lint-ignore no-explicit-any
      _parent: any,
      parameters: SimilarRecommendationsParameters,
    ): Promise<EngagementsResponse> =>
      config.fake
        ? Promise.resolve({ totalResults: 0, data: [] })
        : Sentry.startNewTrace(() => volunteeringDB.similarRecommendations(parameters)),
  },
  Mutation: {
    trackEngagementView: (
      // deno-lint-ignore no-explicit-any
      _parent: any,
      parameters: TrackEngagementViewParameters,
    ): Promise<TrackEngagementViewResponse> =>
      config.fake ? Promise.resolve({ id: parameters.id }) : trackEngagementView(config.voltastics)(parameters),
  },
})

export class BadRequestError extends GraphQLError {
  constructor(message: string) {
    super(message, {
      extensions: {
        code: 'BAD_REQUEST',
      },
    })
  }
  static isBadRequest(error: Error): boolean {
    // deno-lint-ignore no-explicit-any
    return error.name === 'GraphQLError' && ((error as GraphQLError).extensions as any).code === 'BAD_REQUEST'
  }
}

export const createGraphQLServer = (config: ServerConfig, volunteeringDB: VolunteeringDB): GraphQLServer => {
  const plugins = config.cacheEnabled
    ? [
      useResponseCache({
        session: () => null, // global cache, shared by all users
        ttlPerSchemaCoordinate: {
          'Query.engagementOpportunities': config.cacheTtlMsVoltastics,
          'Query.engagement': config.cacheTtlMsVoltastics,
          'Query.categories': config.cacheTtlMsVoltastics,
          'Query.filteredEngagements': config.cacheTtlMsDB,
          'Query.engagementRecommendations': config.cacheTtlMsDB,
          'Query.engagementRecos': config.cacheTtlMsDB,
          'Query.similarRecommendations': config.cacheTtlMsDB,
        },
      }),
    ]
    : []
  const resolvers = createResolvers(config, volunteeringDB)
  return createYoga({
    schema: createSchema({ resolvers, typeDefs }),
    graphiql: true,
    plugins,
  })
}

// deno-lint-ignore no-explicit-any
export type GraphQLServer = any

const isDbConnectionAlive = async (sql: Sql): Promise<Response> => {
  const timeout = 10_000
  try {
    const resultP = sql<{ db_connection_is_alive: boolean }[]>`SELECT true as db_connection_is_alive`
    const result = await deadline(resultP, timeout)
    const alive = result.length > 0 && result[0].db_connection_is_alive || false
    return new Response(`${alive}`)
  } catch (e) {
    if (e instanceof DeadlineError) {
      console.error(`Liveness check timed out after ${timeout} ms`)
      return new Response(null, { status: 503 })
    }
    console.error('Liveness check failed, reason: ', e)
    return new Response(null, { status: 500 })
  }
}

export const createPostgresClient = (config: ServerConfig): postgres.Sql => {
  return postgres('', {
    host: config.volunteeringDB.hostname,
    port: config.volunteeringDB.port,
    database: config.volunteeringDB.database,
    username: config.volunteeringDB.username,
    password: config.volunteeringDB.password,
    connect_timeout: 5,
    idle_timeout: 60 * 5, // automatically close idle connections after 5 minutes to avoid ECONNRESET issue, see https://www.npmjs.com/package/postgres#connection-details
    max_lifetime: 60 * 30, // close connections after 30 minutes in a controlled manner to avoid ECONNRESET issue
    connection: {
      application_name: 'volunteering-api-service',
    },
  })
}

export const startServer = (config: ServerConfig, sql: postgres.Sql): Deno.HttpServer<Deno.NetAddr> => {
  const geoAPIClient = new GeoAPIClientImpl(config.geoAPIEndpointUrl)
  const volunteeringDB = new PostgresVolunteeringDB(
    sql,
    config.imageProxyBaseUrl,
    geoAPIClient,
  )
  const graphQLServer: GraphQLServer = createGraphQLServer(config, volunteeringDB)
  return Deno.serve({
    port: config.port,
    hostname: '0.0.0.0',
    handler: (req: Request) => {
      const url = new URL(req.url)
      const pathname = url.pathname
      if (pathname.startsWith('/health') || pathname.startsWith('/ready')) return isDbConnectionAlive(client)
      return graphQLServer.handleRequest(req)
    },
    onListen({ port, hostname }) {
      logger.info(
        `Server started at http://${hostname === '0.0.0.0' ? 'localhost' : hostname}:${port}/graphql`,
      )
      if (config.fake) {
        logger.info(
          'Server is serving fake data due to FAKE env var set to true',
        )
      }
    },
  })
}
