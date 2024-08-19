import type { QueryObjectResult } from "./deps.ts";
import { Client } from "./deps.ts";
import {
  Engagement,
  EngagementRecommendationsParameters,
  EngagementsResponse,
} from "./types.ts";
import { isNonEmptyString, safeJsonParse } from "./utils.ts";
import { logger } from "./logging.ts";

export type VolunteeringDBConfig = {
  hostname: string;
  port: string;
  database: string;
  username: string;
  password: string;
  connectionAttempts: number; // see https://deno-postgres.com/#/?id=database-reconnection
};

type VolunteeringDBRow = {
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
  embedding_array: string; // actually is `number[]`
  cosine_similarity: number;
  distance_in_meters: number;
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

/** When annotating search results with matches, this is the threshold applied to embedding values below which a value
 * is not considered a match */
const MATCH_CONFIDENCE_THRESHOLD = 0.5;

const recosQueryVector = (topics: string[], skills: string[]): number[] => {
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

const decodeMatchesFromEmbedding = (
  embedding: number[],
  queriedTopics: string[],
  queriedSkills: string[],
): { matchedTopics: string[]; matchedSkills: string[] } => {
  if (embedding.length != EMBEDDING_DIMENSIONS) {
    logger.warn(
      `Received embedding of dimension ${embedding.length}, expected ${EMBEDDING_DIMENSIONS}`,
    );
  }
  const skillsOffset = TOPICS_VECTOR_INDICES.size;
  const matchedTopicsWithConfidence = embedding.reduce<[string, number][]>(
    (acc, value, index, _array) => {
      if (
        index < skillsOffset &&
        value >= MATCH_CONFIDENCE_THRESHOLD
      ) {
        const topic = TOPICS_VECTOR_INDICES_REVERSE.get(index)!;
        if (queriedTopics.includes(topic)) {
          return [...acc, [topic, value]];
        }
      }
      return acc;
    },
    [],
  );
  const matchedSkillsWithConfidence = embedding.reduce<[string, number][]>(
    (acc, value, index, _array) => {
      if (
        index >= skillsOffset &&
        value >= MATCH_CONFIDENCE_THRESHOLD
      ) {
        const skill = SKILLS_VECTOR_INDICES_REVERSE.get(index - skillsOffset)!;
        if (queriedSkills.includes(skill)) {
          return [...acc, [skill, value]];
        }
      }
      return acc;
    },
    [],
  );
  return {
    matchedTopics: matchedTopicsWithConfidence.sort((a, b) => b[1] - a[1]).map((
      a,
    ) => a[0]),
    matchedSkills: matchedSkillsWithConfidence.sort((a, b) => b[1] - a[1]).map((
      a,
    ) => a[0]),
  };
};

export const exportedForTesting = {
  recosQueryVector,
  decodeMatchesFromEmbedding,
  TOPICS_VECTOR_INDICES,
  SKILLS_VECTOR_INDICES,
};

const toEngagement = (
  imageProxyBaseUrl: string,
  queriedTopics: string[],
  queriedSkills: string[],
) =>
(row: VolunteeringDBRow): Engagement => {
  const { matchedTopics: matchedTopics, matchedSkills: matchedSkills } =
    decodeMatchesFromEmbedding(
      JSON.parse(row.embedding_array) as number[],
      queriedTopics,
      queriedSkills,
    );
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

    matchedTopics,
    matchedSkills,
    matchedGeoLocationDistanceInMeters: row.distance_in_meters,
  };
};

export type GeoLocation = {
  lat: number;
  lon: number;
};

export type GeoLocationResolver = (
  geoLocationId: string,
) => Promise<GeoLocation>;

export class VolunteeringDB {
  private client: Client;
  private readonly imageProxyBaseUrl: string;
  private resolveGeoLocation: GeoLocationResolver;

  constructor(
    client: Client,
    imageProxyBaseUrl: string,
    resolveGeoLocation: GeoLocationResolver,
  ) {
    this.client = client;
    this.imageProxyBaseUrl = imageProxyBaseUrl;
    this.resolveGeoLocation = resolveGeoLocation;
  }

  async findRecommendations(
    { offset, limit, topics, skills, geolocationId }:
      EngagementRecommendationsParameters,
  ): Promise<EngagementsResponse> {
    const result = await this.queryRecos(
      offset < 0 ? 0 : offset,
      limit > 100 || limit < 1 ? 10 : limit,
      topics,
      skills,
      geolocationId,
    ).catch((reason) => {
      console.error("Error retrieving recommendations. Reason: ", reason);
      throw reason;
    });
    const recos = result.rows.map(
      toEngagement(this.imageProxyBaseUrl, topics, skills),
    );
    return Promise.resolve({
      totalResults: recos.length,
      data: recos,
    });
  }

  private async queryRecos(
    offset: number,
    limit: number,
    topics: string[],
    skills: string[],
    geolocationId?: string,
  ): Promise<QueryObjectResult<VolunteeringDBRow>> {
    const beforeResolve = Date.now();
    const geoLocation = geolocationId
      ? await this.resolveGeoLocation(geolocationId)
        .then((geoLocation) => {
          const afterResolve = Date.now();
          logger.debug(
            `[${
              (afterResolve - beforeResolve).toString().padStart(4, " ")
            } ms] Successfully resolved ${
              JSON.stringify(geoLocation)
            } for geolocationId=${geolocationId}`,
          );
          return geoLocation;
        })
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

    const beforeQuery = Date.now();
    const logQueryDuration = (
      result: QueryObjectResult<VolunteeringDBRow>,
    ): QueryObjectResult<VolunteeringDBRow> => {
      const afterQuery = Date.now();
      logger.debug(
        `[${
          (afterQuery - beforeQuery).toString().padStart(4, " ")
        } ms] Successfully retrieved ${result.rows.length} recommendations from DB`,
      );
      return result;
    };

    if (geoLocation && (topics.length > 0 || skills.length > 0)) {
      return this.queryRecosBasedOnTopicsSkillsAndLocation(
        offset,
        limit,
        topics,
        skills,
        geoLocation,
      ).then(logQueryDuration);
    } else if (geoLocation) {
      return this.queryRecosBasedOnLocation(offset, limit, geoLocation).then(
        logQueryDuration,
      );
    } else if (topics.length > 0 || skills.length > 0) {
      return this.queryRecosBasedOnTopicsAndSkills(
        offset,
        limit,
        topics,
        skills,
      ).then(logQueryDuration);
    } else {
      return Promise.reject(
        "It is required to provide at least one of (topics, skills, or location) in order to retrieve recommendations",
      );
    }
  }

  private async queryRecosBasedOnTopicsAndSkills(
    offset: number,
    limit: number,
    topics: string[],
    skills: string[],
  ): Promise<QueryObjectResult<VolunteeringDBRow>> {
    logger.debug(
      `queryRecosBasedOnTopicsAndSkills ${
        JSON.stringify({ offset, limit, topics, skills })
      }`,
    );
    const queryVector = JSON.stringify(recosQueryVector(topics, skills));
    return await this.client.queryObject<VolunteeringDBRow>`
      WITH vector_matches AS (
        SELECT *, 1 - (embedding_array <=> ${queryVector}) AS cosine_similarity
        FROM volunteering_voltastics_with_classification
        ORDER BY cosine_similarity DESC
        OFFSET ${offset}
        LIMIT ${limit}
      )
      SELECT *
      FROM vector_matches;
    `;
  }

  private async queryRecosBasedOnTopicsSkillsAndLocation(
    offset: number,
    limit: number,
    topics: string[],
    skills: string[],
    geoLocation: GeoLocation,
  ): Promise<QueryObjectResult<VolunteeringDBRow>> {
    logger.debug(
      `queryRecosBasedOnTopicsSkillsAndLocation ${
        JSON.stringify({ offset, limit, topics, skills, geoLocation })
      }`,
    );
    const rankingWeightCosineSimilarity = 0.7; // Weight for cosine similarity
    const rankingWeightDistance = 0.3; // Weight for proximity
    const maxDistanceInMeters = 50_000; // in meters (e.g., 50 km)
    const queryVector = JSON.stringify(recosQueryVector(topics, skills));
    const { lat, lon } = geoLocation;

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
      SELECT *
      FROM scored
      ORDER BY weighted_score DESC
      OFFSET ${offset}
      LIMIT ${limit};
    `;
  }

  private async queryRecosBasedOnLocation(
    offset: number,
    limit: number,
    geoLocation: GeoLocation,
  ): Promise<QueryObjectResult<VolunteeringDBRow>> {
    logger.debug(
      `queryRecosBasedOnLocation ${
        JSON.stringify({ offset, limit, geoLocation })
      }`,
    );
    const { lat, lon } = geoLocation;
    return await this.client.queryObject<VolunteeringDBRow>`
      SELECT *, 
             ST_Transform(location_gps, 3857) <#> ST_Transform(ST_SetSRID(ST_MakePoint(${lon.toString()}, ${lat.toString()}), 4326), 3857) AS distance_in_meters
      FROM volunteering_voltastics_with_classification
      ORDER BY distance_in_meters ASC
      OFFSET ${offset}
      LIMIT ${limit};
    `;
  }
}
