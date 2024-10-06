import type { QueryObjectResult } from "./deps.ts";
import { Client, GraphQLError, Sentry } from "./deps.ts";
import { GeoAPIClient } from "./geo_api_client.ts";
import {
  Engagement,
  EngagementParameters,
  EngagementReco,
  EngagementRecosParameters,
  EngagementRecosResponse,
  EngagementResponse,
  EngagementsResponse,
  FilteredEngagementsParameters,
  GeolocationCoordinates,
  GeolocationGeometry,
  SimilarRecommendationsParameters,
} from "./types.ts";
import { isNonEmptyString, safeJsonParse } from "./utils.ts";
import { logger } from "./logging.ts";
import { BadRequestError } from "./server.ts";

export type VolunteeringDBConfig = {
  hostname: string;
  port: string;
  database: string;
  username: string;
  password: string;
  connectionAttempts: number; // see https://deno-postgres.com/#/?id=database-reconnection
};

export type VolunteeringDBRow = {
  id: number;
  title: string;
  description: string;
  link: string;
  image?: string;
  source: string;
  uses: string;
  orga?: string;
  imageorga?: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  embedding_array: string; // JSON containing `number[]`
  cosine_similarity: number;
  distance_in_meters: number;
  total_results: number;
};

export type similarEmbeddingRow = {
  longitude?: number;
  latitude?: number;
  embedding_array: string; // JSON containing `number[]`
};

const TOPICS_VECTOR_INDICES = new Map<string, number>([
  ["agriculture-food", 0],
  ["alternative-economy", 1],
  ["biodiversity-animal-welfare", 2],
  ["building-housing", 3],
  ["children-youth", 4],
  ["climate-protection", 5],
  ["consumption-lifestyle", 6],
  ["culture-social-change", 7],
  ["democracy-human-rights", 8],
  ["disabilities-inclusion", 9],
  ["diversity-gender-equality", 10],
  ["eco-tourism", 11],
  ["education-science", 12],
  ["elderly-people", 13],
  ["energy-transition", 14],
  ["governance", 15],
  ["migration-integration", 16],
  ["mobility-infrastructure", 17],
  ["natural-disaster-response", 18],
  ["natural-resources", 19],
  ["other", 20],
  ["peace-security", 21],
  ["physical-mental-health", 22],
  ["politics-society", 23],
  ["poverty-homelesness", 24],
  ["technological-innovation", 25],
  ["urban-rural-development", 26],
  ["water-ocean", 27],
]);

const SKILLS_VECTOR_INDICES = new Map<string, number>([
  ["adaptability", 0],
  ["analytical-thinking", 1],
  ["arts-music-culture", 2],
  ["assertiveness", 3],
  ["building-handicraft", 4],
  ["caring-nursing", 5],
  ["coaching & mentoring", 6],
  ["commitment", 7],
  ["communication-skills", 8],
  ["conflict-management", 9],
  ["cooking-baking", 10],
  ["coordination-coordination-of-volunteers", 11],
  ["creativity", 12],
  ["critical-thinking", 13],
  ["design", 14],
  ["development-concept", 15],
  ["discipline", 16],
  ["drive-transport", 17],
  ["empathy", 18],
  ["environmental-awareness", 19],
  ["finances-taxes", 20],
  ["fundraising", 21],
  ["hands-on-support", 22],
  ["holistic-thinking", 23],
  ["humour", 24],
  ["inclusive-mindset-intercultural-competence", 25],
  ["independence", 26],
  ["initiative-and-energy", 27],
  ["it-technology", 28],
  ["knowledge-management", 29],
  ["law-regulations", 30],
  ["leadership", 31],
  ["management-strategy", 32],
  ["marketing-social-media", 33],
  ["mindfulness", 34],
  ["moderation-facilitation", 35],
  ["motivation", 36],
  ["negotiation-skills", 37],
  ["openness", 38],
  ["organizational-skills", 39],
  ["public-relations", 40],
  ["relationship-skills", 41],
  ["resilience", 42],
  ["self-confident", 43],
  ["solution-orientedness", 44],
  ["teaching-education", 45],
  ["teamwork", 46],
  ["visionary-thinking", 47],
  ["willingness-to-learn", 48],
  ["writing-translation", 49],
]);

const TOPICS_VECTOR_INDICES_REVERSE = new Map<number, string>(
  Array.from(TOPICS_VECTOR_INDICES.entries()).map((
    [key, index],
  ) => [index, key]),
);

const SKILLS_VECTOR_INDICES_REVERSE = new Map<number, string>(
  Array.from(SKILLS_VECTOR_INDICES.entries()).map((
    [key, index],
  ) => [index, key]),
);

const EMBEDDING_DIMENSIONS = TOPICS_VECTOR_INDICES.size +
  SKILLS_VECTOR_INDICES.size;

/** When annotating search results with matches, embedding values below these thresholds are not considered a match.
 * Should be aligned with the precomputed binary_embedding.
 */
const MATCH_TOPIC_CONFIDENCE_THRESHOLD = 0.8;
const MATCH_SKILL_CONFIDENCE_THRESHOLD = 0.8;
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 10;

const queryEmbeddingVector = (topics: string[], skills: string[]): number[] => {
  const queryVector: number[] = Array(EMBEDDING_DIMENSIONS).fill(0.0);
  for (const topic of topics) {
    if (TOPICS_VECTOR_INDICES.has(topic)) {
      queryVector[TOPICS_VECTOR_INDICES.get(topic)!] = 1.0;
    }
  }
  for (const skill of skills) {
    if (SKILLS_VECTOR_INDICES.has(skill)) {
      queryVector[
        TOPICS_VECTOR_INDICES.size + SKILLS_VECTOR_INDICES.get(skill)!
      ] = 1.0;
    }
  }
  return queryVector;
};

/**
 * Sorts matches with confidence so that
 *
 * * queried for terms come first, ordered by confidence DESC
 * * not queried for terms come after, ordered by confidence DESC
 */
const sortMatches = (
  queriedTerms: string[],
  matchedTermsWithConfidence: [string, number][],
): [string, number][] => {
  const byConfidenceDesc = (a: [string, number], b: [string, number]) => b[1] - a[1];

  return [
    ...matchedTermsWithConfidence.filter(([topic, _confidence]) => queriedTerms.includes(topic)).sort(byConfidenceDesc),
    ...matchedTermsWithConfidence.filter(([topic, _confidence]) => !queriedTerms.includes(topic)).sort(
      byConfidenceDesc,
    ),
  ];
};

/**
 * Decodes matches from embedding into a string[] containing topic slugs and skills slugs. Results are sorted as follows:
 * * according to `sortMatches` function if queriedTopics & queriedSkills are non-empty
 * * by confidence DESC otherwise
 *
 * @param embedding
 * @param queriedTopics
 * @param queriedSkills
 */
const decodeMatchesFromEmbedding = (
  embedding: number[],
  queriedTopics: string[],
  queriedSkills: string[],
): { topics: string[]; skills: string[] } => {
  if (embedding.length != EMBEDDING_DIMENSIONS) {
    logger.warn(
      `Received embedding of dimension ${embedding.length}, expected ${EMBEDDING_DIMENSIONS}`,
    );
  }
  const skillsOffset = TOPICS_VECTOR_INDICES.size;
  const matchedTopicsWithConfidence = embedding
    .map((confidence, index): [string, number] | null => {
      return index < skillsOffset ? [TOPICS_VECTOR_INDICES_REVERSE.get(index)!, confidence] : null;
    })
    .filter((matchWithConfidence) => matchWithConfidence != null)
    .filter((matchWithConfidence) => matchWithConfidence[1] >= MATCH_TOPIC_CONFIDENCE_THRESHOLD);
  const matchedSkillsWithConfidence = embedding
    .map((confidence, index): [string, number] | null => {
      return index >= skillsOffset ? [SKILLS_VECTOR_INDICES_REVERSE.get(index - skillsOffset)!, confidence] : null;
    })
    .filter((matchWithConfidence) => matchWithConfidence != null)
    .filter((matchWithConfidence) => matchWithConfidence[1] >= MATCH_SKILL_CONFIDENCE_THRESHOLD);

  const withoutConfidence = (a: [string, number]) => a[0];
  return {
    topics: sortMatches(queriedTopics, matchedTopicsWithConfidence).map(
      withoutConfidence,
    ),
    skills: sortMatches(queriedSkills, matchedSkillsWithConfidence).map(
      withoutConfidence,
    ),
  };
};

export const exportedForTesting = {
  queryEmbeddingVector,
  decodeMatchesFromEmbedding,
  sortMatches,
  TOPICS_VECTOR_INDICES,
  SKILLS_VECTOR_INDICES,
};

const addQueryMatchInfo = (
  row: VolunteeringDBRow,
  engagement: Engagement,
  queriedTopics: string[],
  queriedSkills: string[],
) => {
  const embedding = JSON.parse(row.embedding_array) as number[];
  const { topics, skills } = decodeMatchesFromEmbedding(embedding, queriedTopics, queriedSkills);
  return {
    ...engagement,
    matchedTopics: topics,
    matchedSkills: skills,
    matchedGeoLocationDistanceInMeters: row.distance_in_meters,
  };
};

const toEngagementRecommendation = (
  imageProxyBaseUrl: string,
  row: VolunteeringDBRow,
  queriedTopics: string[],
  queriedSkills: string[],
): EngagementReco => {
  const embedding = JSON.parse(row.embedding_array) as number[];
  const { topics, skills } = decodeMatchesFromEmbedding(embedding, queriedTopics, queriedSkills);
  return {
    engagement: toEngagement(imageProxyBaseUrl, row),
    matchedTopics: topics,
    matchedSkills: skills,
    matchedGeoLocationDistanceInMeters: row.distance_in_meters,
  };
};

const toEngagement = (imageProxyBaseUrl: string, row: VolunteeringDBRow): Engagement => {
  const embedding = JSON.parse(row.embedding_array) as number[];
  const { topics, skills } = decodeMatchesFromEmbedding(embedding, [], []);
  return {
    id: "" + row.id,
    title: row.title,
    description: row.description,
    url: row.link,
    imageUrl: row.image &&
      `${imageProxyBaseUrl}/crop:0:0/resize:auto:1024/plain/` +
        encodeURIComponent(row.image),
    imageUrlOriginal: row.image,
    source: row.source,
    categories: safeJsonParse(
      row.uses,
      `Failed parsing 'categories' for ID ${row.id}`,
    ),
    organizer: isNonEmptyString(row.orga)
      ? {
        name: row.orga!,
        imageUrl: isNonEmptyString(row.imageorga) ? row.imageorga : undefined,
      }
      : undefined,
    location: row.location,
    latitude: row.latitude,
    longitude: row.longitude,
    topics: topics,
    skills: skills,
  };
};

const extractTotalResultCount = (
  queryResult: QueryObjectResult<VolunteeringDBRow>,
) =>
  (queryResult.rows.length ? Number(queryResult.rows[0].total_results) : queryResult.rowCount) ??
    0;

const ERROR_CODE_NOT_FOUND = "NOT_FOUND";

export interface VolunteeringDB {
  engagement(params: EngagementParameters): Promise<EngagementResponse>;
  engagementRecommendations(params: EngagementRecosParameters): Promise<EngagementsResponse>;
  engagementRecos(params: EngagementRecosParameters): Promise<EngagementRecosResponse>;
  filteredEngagements(params: FilteredEngagementsParameters): Promise<EngagementsResponse>;
  findSimilarRecommendations(params: SimilarRecommendationsParameters): Promise<EngagementsResponse>;
}

export class PostgresVolunteeringDB implements VolunteeringDB {
  private client: Client;
  private readonly imageProxyBaseUrl: string;
  private geoAPIClient: GeoAPIClient;

  constructor(
    client: Client,
    imageProxyBaseUrl: string,
    geoAPIClient: GeoAPIClient,
  ) {
    this.client = client;
    this.imageProxyBaseUrl = imageProxyBaseUrl;
    this.geoAPIClient = geoAPIClient;
  }

  async engagement({ id }: EngagementParameters): Promise<EngagementResponse> {
    return await Sentry.startSpan(
      { name: "VolunteeringDB.engagement" },
      async () => {
        const result = await this.client.queryObject<VolunteeringDBRow>`
          SELECT * FROM volunteering_voltastics_with_classification
          WHERE id = ${id}`;
        if (result.rows.length < 1) {
          return Promise.reject(
            new GraphQLError("Not found", {
              extensions: { "code": ERROR_CODE_NOT_FOUND },
            }),
          );
        } else {
          const row = result.rows[0];
          return toEngagement(this.imageProxyBaseUrl, row);
        }
      },
    );
  }

  async engagementRecommendations(
    { offset, limit, topics, skills, geolocationId }: EngagementRecosParameters,
  ): Promise<EngagementsResponse> {
    return await Sentry.startSpan(
      { name: "VolunteeringDB.engagementRecommendations" },
      async () => {
        const result = await this.queryRecos(
          offset < 0 ? 0 : offset,
          limit > MAX_LIMIT || limit < 1 ? DEFAULT_LIMIT : limit,
          topics,
          skills,
          geolocationId,
        ).catch((reason) => {
          if (!BadRequestError.isBadRequest(reason)) {
            logger.error("Error retrieving recommendations. Reason: ", reason);
          }
          throw reason;
        });
        const recos = result.rows.map((row) =>
          addQueryMatchInfo(row, toEngagement(this.imageProxyBaseUrl, row), topics, skills)
        );
        return Promise.resolve({
          totalResults: extractTotalResultCount(result),
          data: recos,
        });
      },
    );
  }

  async engagementRecos(
    { offset, limit, topics, skills, geolocationId }: EngagementRecosParameters,
  ): Promise<EngagementRecosResponse> {
    return await Sentry.startSpan(
      { name: "VolunteeringDB.engagementRecos" },
      async () => {
        const result = await this.queryRecos(
          offset < 0 ? 0 : offset,
          limit > MAX_LIMIT || limit < 1 ? DEFAULT_LIMIT : limit,
          topics,
          skills,
          geolocationId,
        ).catch((reason: Error) => {
          if (!BadRequestError.isBadRequest(reason)) {
            logger.error("Error retrieving recommendations. Reason: ", reason);
          }
          throw reason;
        });
        const recos = result.rows.map((row) => toEngagementRecommendation(this.imageProxyBaseUrl, row, topics, skills));
        return Promise.resolve({
          totalResults: extractTotalResultCount(result),
          data: recos,
        });
      },
    );
  }

  private async queryRecos(
    offset: number,
    limit: number,
    topics: string[],
    skills: string[],
    geolocationId?: string,
  ): Promise<QueryObjectResult<VolunteeringDBRow>> {
    const geolocationCoordinates = geolocationId
      ? await this.geoAPIClient.resolveCoordinates(geolocationId)
        .catch((error) => {
          logger.warn(error);
          if (topics.length == 0 && skills.length == 0) {
            throw new Error(
              "Can't retrieve recommendations: geo location resolution failed and no topics or skills given",
            );
          }
          // gracefully catch error so that recommendations will still be delivered but without location factored in
          return undefined;
        })
      : undefined;

    if (geolocationCoordinates && (topics.length > 0 || skills.length > 0)) {
      return this.queryRecosBasedOnTopicsSkillsAndLocation(
        offset,
        limit,
        topics,
        skills,
        geolocationCoordinates,
      );
    } else if (geolocationCoordinates) {
      return this.queryRecosBasedOnLocation(
        offset,
        limit,
        geolocationCoordinates,
      );
    } else if (topics.length > 0 || skills.length > 0) {
      return this.queryRecosBasedOnTopicsAndSkills(
        offset,
        limit,
        topics,
        skills,
      );
    } else {
      return Promise.reject(
        new BadRequestError(
          "It is required to provide at least one of (topics, skills, or location) in order to retrieve recommendations",
        ),
      );
    }
  }

  private async queryRecosBasedOnTopicsAndSkills(
    offset: number,
    limit: number,
    topics: string[],
    skills: string[],
  ): Promise<QueryObjectResult<VolunteeringDBRow>> {
    return await Sentry.startSpan(
      { name: "VolunteeringDB.queryRecosBasedOnTopicsAndSkills", op: "db.query" },
      async () => {
        logger.debug(
          `queryRecosBasedOnTopicsAndSkills ${JSON.stringify({ offset, limit, topics, skills })}`,
        );
        const queryVector = JSON.stringify(queryEmbeddingVector(topics, skills));
        return await this.client.queryObject<VolunteeringDBRow>`
          WITH vector_matches AS (SELECT *, 1 - (embedding_array <=> ${queryVector}) AS cosine_similarity
                                  FROM volunteering_voltastics_with_classification
                                  ORDER BY cosine_similarity DESC)
          SELECT *, count(*) OVER () AS total_results
          FROM vector_matches
          OFFSET ${offset} LIMIT ${limit};
        `;
      },
    );
  }

  private async queryRecosBasedOnTopicsSkillsAndLocation(
    offset: number,
    limit: number,
    topics: string[],
    skills: string[],
    geolocationCoordinates: GeolocationCoordinates,
  ): Promise<QueryObjectResult<VolunteeringDBRow>> {
    return await Sentry.startSpan(
      { name: "VolunteeringDB.queryRecosBasedOnTopicsSkillsAndLocation", op: "db.query" },
      async () => {
        logger.debug(
          `queryRecosBasedOnTopicsSkillsAndLocation ${
            JSON.stringify({ offset, limit, topics, skills, geolocationCoordinates })
          }`,
        );
        const rankingWeightCosineSimilarity = 0.7; // Weight for cosine similarity
        const rankingWeightDistance = 0.3; // Weight for proximity
        const maxDistanceInMeters = 50_000; // in meters (e.g., 50 km)
        const queryVector = JSON.stringify(queryEmbeddingVector(topics, skills));
        const { lat, lon } = geolocationCoordinates;

        // Useful knowledge
        // - PostGIS uses lon, lat (NOT lat, lon)
        // - <#> uses index scans if used in an ORDER BY clause, ST_Distance does not
        // - Database stores in GPS-Coordinates (SRID 4326)
        // - In order to calculate a distance in meters, a geometry needs to be projected by transforming using
        //   ST_Transform(geom, 3857) where we use the SRID 3857 for Pseudo-Mercator
        return await this.client.queryObject<VolunteeringDBRow>`
      WITH calculations AS (
        SELECT *,
              1 - (embedding_array <=> ${queryVector}) AS cosine_similarity,
              ST_Transform(location_gps, 3857) <#> ST_Transform(ST_SetSRID(ST_MakePoint(${lon.toString()}, ${lat.toString()}), 4326), 3857) AS distance_in_meters
        FROM volunteering_voltastics_with_classification
        WHERE longitude IS NOT NULL AND latitude IS NOT NULL
      ), scored AS (
        SELECT *,
              (${rankingWeightCosineSimilarity} * cosine_similarity) + 
              (${rankingWeightDistance} * (1 - LEAST(distance_in_meters, ${maxDistanceInMeters})) / ${maxDistanceInMeters}) AS weighted_score
        FROM calculations
      )
      SELECT *, count(*) OVER() AS total_results
      FROM scored
      ORDER BY weighted_score DESC
      OFFSET ${offset}
      LIMIT ${limit};
    `;
      },
    );
  }

  private async queryRecosBasedOnLocation(
    offset: number,
    limit: number,
    geolocationCoordinates: GeolocationCoordinates,
  ): Promise<QueryObjectResult<VolunteeringDBRow>> {
    return await Sentry.startSpan(
      { name: "VolunteeringDB.queryRecosBasedOnLocation", op: "db.query" },
      async () => {
        logger.debug(
          `queryRecosBasedOnLocation ${JSON.stringify({ offset, limit, geolocationCoordinates })}`,
        );
        const { lat, lon } = geolocationCoordinates;
        return await this.client.queryObject<VolunteeringDBRow>`
      SELECT *,
             count(*) OVER() AS total_results,
             ST_Transform(location_gps, 3857) <#> ST_Transform(ST_SetSRID(ST_MakePoint(${lon.toString()}, ${lat.toString()}), 4326), 3857) AS distance_in_meters
      FROM volunteering_voltastics_with_classification
      ORDER BY distance_in_meters ASC
      OFFSET ${offset}
      LIMIT ${limit};
    `;
      },
    );
  }

  async filteredEngagements(
    { offset, limit, topics, skills, geolocationId }: FilteredEngagementsParameters,
  ): Promise<EngagementsResponse> {
    const geometry: GeolocationGeometry | undefined = geolocationId
      ? await this.geoAPIClient.resolveGeometry(geolocationId).catch(
        (error) => {
          logger.warn(error);
          throw new Error(
            "Can't filter engagements: Geolocation resolution failed",
          );
        },
      )
      : undefined;

    if (!geometry && !(topics.length + skills.length)) {
      throw new Error(
        "Can't filter engagements: At least one topic, skill or location is required",
      );
    }

    return this.queryFilteredEngagements(
      topics,
      skills,
      offset < 0 ? 0 : offset,
      limit > MAX_LIMIT || limit < 1 ? DEFAULT_LIMIT : limit,
      geometry,
    );
  }

  // Method to find similar recommendations based on ID
  async findSimilarRecommendations(
    params: SimilarRecommendationsParameters,
  ): Promise<EngagementsResponse> {
    const recos = await this.querySimilarRecommendations(
      params.id,
      params.offset < 0 ? 0 : params.offset,
      params.limit > 100 || params.limit < 1 ? 10 : params.limit,
    ).catch((reason) => {
      console.error("Error executing query", reason);
      throw reason;
    });
    return Promise.resolve({
      totalResults: recos.length,
      data: recos,
    });
  }

  // Query similar recommendations based on embeddings and location
  private async querySimilarRecommendations(
    id: string,
    offset: number,
    limit: number,
  ): Promise<Engagement[]> {
    const embeddingQuery = `
      SELECT latitude, longitude, e.embedding_array
      FROM volunteering_voltastics_similar_embeddings e
      JOIN volunteering_voltastics_with_classification v
      ON e.id = v.id
      WHERE e.id = ${id}
    `;
    const result = await this.client.queryObject<similarEmbeddingRow>(embeddingQuery);

    if (!result.rows.length) {
      throw new Error(`No volunteering opportunity found for id ${id}`);
    }

    const row = result.rows[0];

    // if (
    //   !("embedding_array" in row) ||
    //   !Array.isArray(row.embedding_array) ||
    //   (row.latitude !== null && typeof row.latitude !== "number") ||
    //   (row.longitude !== null && typeof row.longitude !== "number")
    // ) {
    //   throw new Error(`Invalid data format for id ${id}`);
    // }

    const lat = row.latitude ?? null;
    const lon = row.longitude ?? null;
    const embedding = JSON.parse(row.embedding_array) as number[];

    const recommendationsQuery = this.buildRecommendationsQuery(id, embedding, lat, lon, offset, limit);

    const recosResult = await this.client.queryObject<VolunteeringDBRow>(recommendationsQuery);
    return recosResult.rows.map((row) => toEngagement(this.imageProxyBaseUrl, row));
  }

  private buildRecommendationsQuery(
    id: string,
    embedding: number[],
    lat: number | null,
    lon: number | null,
    offset: number,
    limit: number,
  ) {
    const rankingWeightCosineSimilarity = 0.7;
    const rankingWeightDistance = 0.3;
    const maxAcceptableDistance = 50000;

    if (lat == null || lon == null) {
      return `
        WITH similarity_calculations AS (
          SELECT v.*, 
                1 - (e.embedding_array <=> ${embedding}) AS cosine_similarity
          FROM volunteering_voltastics_similar_embeddings e
          JOIN volunteering_voltastics_with_classification v
          ON e.id = v.id
          WHERE e.id != ${id}
        )
        SELECT *
        FROM similarity_calculations
        ORDER BY cosine_similarity DESC
        OFFSET ${offset}
        LIMIT ${limit};
      `;
    } else {
      return `
        WITH similarity_calculations AS (
          SELECT v.*,
                1 - (embedding_array <=> ${embedding}) AS cosine_similarity,
                ST_Transform(location_gps, 3857) <#> ST_Transform(ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326), 3857) AS distance
          FROM volunteering_voltastics_similar_embeddings e
          JOIN volunteering_voltastics_with_classification v
          ON e.id = v.id
          WHERE e.id != ${id}
        ), scored_recommendations AS (
          SELECT *,
                (${rankingWeightCosineSimilarity} * cosine_similarity) + 
                (${rankingWeightDistance} * (1 - LEAST(distance, ${maxAcceptableDistance}) / ${maxAcceptableDistance})) AS weighted_score
          FROM similarity_calculations
        )
        SELECT *
        FROM scored_recommendations
        ORDER BY weighted_score DESC
        OFFSET ${offset}
        LIMIT ${limit};
      `;
    }
  }

  private async queryFilteredEngagements(
    topics: string[],
    skills: string[],
    offset: number,
    limit: number,
    geometry?: GeolocationGeometry,
  ): Promise<EngagementsResponse> {
    return await Sentry.startSpan(
      { name: "VolunteeringDB.queryFilteredEngagements", op: "db.query" },
      async () => {
        const queryVector = queryEmbeddingVector(topics, skills);
        const queryVectorString = JSON.stringify(queryVector);
        const nonEmptyQueryVector = topics.length + skills.length > 0;
        const binaryQueryVector = queryVector.map((value) => value > 0 ? "1" : "0")
          .join("");
        const emptyBinaryQueryVector = "0".repeat(EMBEDDING_DIMENSIONS);

        // Filtering engagements:
        // - Precomputed `binary_embedding` is a bit string marking matching topics and skills
        // - Unset bits in `binary_embedding` for terms that are not part of the query using bitwise AND => If at least one set bit remains, it matches the query (checked by comparing to empty bit string, as it's too long for integer conversion)
        // - Filter by geolocation by checking if coordinates are inside the given geolocation's GeoJSON geometry
        // - Sort results using cosine_similarity
        const result = await this.client.queryObject<VolunteeringDBRow>`
          WITH vector_matches AS (
            SELECT
              *,
              1 - (embedding_array <=> ${queryVectorString}) AS cosine_similarity,
              CASE
                WHEN ${nonEmptyQueryVector}
                THEN (binary_embedding & ${binaryQueryVector}) > ${emptyBinaryQueryVector}
                ELSE true
              END AS matches_query,
              CASE
                WHEN ${!!geometry}
                THEN ST_Contains(ST_GeomFromGeoJSON(${geometry}), location_gps)
                ELSE true
              END AS matches_location
            FROM volunteering_voltastics_with_classification
            ORDER BY cosine_similarity DESC
          )
          SELECT *, count(*) OVER() AS total_results
          FROM vector_matches
          WHERE matches_query
          AND matches_location
          OFFSET ${offset}
          LIMIT ${limit};
        `;

        return {
          totalResults: extractTotalResultCount(result),
          data: result.rows.map((row) => toEngagement(this.imageProxyBaseUrl, row)),
        };
      },
    );
  }
}
