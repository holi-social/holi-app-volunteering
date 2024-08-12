import { Client } from "./deps.ts";
import {
  Engagement,
  EngagementRecommendationsParameters,
  EngagementsResponse,
} from "./types.ts";
import { isNonEmptyString, safeJsonParse } from "./utils.ts";
// import { calculateRadius, calculateScore } from "./utils.ts";
import { PlaceDetails } from "./types.ts";

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
  cosine_similarity: number;
};

const topicsVectorIndices = new Map<string, number>([
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

const skillsVectorIndices = new Map<string, number>([
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

const recosQueryVector = (topics: string[], skills: string[]): number[] => {
  const queryVector: number[] = Array(
    topicsVectorIndices.size + skillsVectorIndices.size,
  ).fill(0.0);
  for (const topic of topics) {
    if (topicsVectorIndices.has(topic)) {
      queryVector[topicsVectorIndices.get(topic)!] = 1.0;
    }
  }
  for (const skill of skills) {
    if (skillsVectorIndices.has(skill)) {
      queryVector[
        topicsVectorIndices.size + skillsVectorIndices.get(skill)!
      ] = 1.0;
    }
  }
  return queryVector;
};

export const exportedForTesting = {
  recosQueryVector,
};

const toEngagement =
  (imageProxyBaseUrl: string) => (row: VolunteeringDBRow): Engagement => ({
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
  });

export class VolunteeringDB {
  private client: Client;
  private readonly imageProxyBaseUrl: string;

  constructor(config: VolunteeringDBConfig, imageProxyBaseUrl: string) {
    this.client = new Client({
      hostname: config.hostname,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      controls: {
        debug: {
          queries: true,
          notices: true,
          results: true,
          queryInError: true,
        },
      },
      connection: {
        attempts: config.connectionAttempts,
      },
    });
    this.imageProxyBaseUrl = imageProxyBaseUrl;
  }

  async findRecommendations(
    params: EngagementRecommendationsParameters,
  ): Promise<EngagementsResponse> {
    const recos = await this.queryRecommendations(
      params.topics,
      params.skills,
      params.location,
      params.offset < 0 ? 0 : params.offset,
      params.limit > 100 || params.limit < 1 ? 10 : params.limit,
    )
      .catch((reason) => {
        console.error("Error executing query", reason);
        throw reason;
      });
    return Promise.resolve({
      totalResults: recos.length,
      data: recos,
    });
  }

  // Function to perform cosine similarity search
  private async queryRecommendations(
    topics: string[],
    skills: string[],
    location: PlaceDetails | undefined,
    offset: number,
    limit: number,
  ): Promise<Engagement[]> {
    const queryVector = JSON.stringify(recosQueryVector(topics, skills));
    console.debug(queryVector);

    // Define weight parameters
    const alpha = 0.7; // Weight for cosine similarity
    const beta = 0.3; // Weight for proximity
    const maxAcceptableDistance = 50000; // in meters (e.g., 50 km)

    if (location) {
      const { geolocation: { properties: { lat, lon } } } = location;
      const result = await this.client.queryObject<VolunteeringDBRow>`
        WITH calculations AS (
          SELECT *,
                1 - (embedding_array <=> ${queryVector}) AS cosine_similarity,
                ST_Distance(
                  ST_SetSRID(ST_MakePoint(longitude, latitude), 4326),
                  ST_SetSRID(ST_MakePoint(${lon.toString()}, ${lat.toString()}), 4326)
                ) AS distance
          FROM volunteering_voltastics_with_classification
        ), scored AS (
          SELECT *,
                (${alpha} * cosine_similarity) + 
                (${beta} * (1 - LEAST(distance, ${maxAcceptableDistance}) / ${maxAcceptableDistance})) AS weighted_score
          FROM calculations
        )
        SELECT *
        FROM scored
        ORDER BY weighted_score DESC
        OFFSET ${offset}
        LIMIT ${limit};
      `;
      return result.rows.map(toEngagement(this.imageProxyBaseUrl));
    }

    // if (location) {
    //   const { geolocation: { geometry, properties: { lat, lon } } } = location;
    //   const radius = calculateRadius(geometry);
    //   const alpha = 0.7; // Adjust these weights
    //   const beta = 0.3;

    //   const result = await this.client.queryObject<VolunteeringDBRow>`
    //   WITH vector_matches AS (
    //     SELECT *,
    //            1 - (embedding_array <=> ${JSON.stringify(queryVector)}) AS cosine_similarity,
    //            ST_Distance(
    //              ST_SetSRID(ST_MakePoint(longitude, latitude), 4326), -- Create point from table's lat/lon
    //              ST_SetSRID(ST_MakePoint(${lon.toString()}, ${lat.toString()}), 4326)
    //            ) AS distance
    //     FROM volunteering_voltastics_with_classification
    //     ORDER BY cosine_similarity DESC
    //     OFFSET ${offset}
    //     LIMIT ${limit}
    //   )
    //   SELECT *
    //   FROM vector_matches;
    // `;

    // // Determine the max distance in the result set for normalization
    // const max_distance = result.rows.reduce((max, row) => Math.max(max, row.distance), 0);

    // const scoredResults = result.rows.map(row => ({
    //   ...row,
    //   score: calculateScore(row.cosine_similarity, row.distance, max_distance, alpha, beta)
    // }));

    // scoredResults.sort((a, b) => b.score - a.score);

    // return scoredResults.slice(0, limit).map(toEngagement(this.imageProxyBaseUrl));
    // }

    // special syntax for Denos postgres client, resulting in an SQL injection-safe prepared statement
    // see https://deno-postgres.com/#/?id=template-strings
    const result = await this.client.queryObject<VolunteeringDBRow>`
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
    return result.rows.map(toEngagement(this.imageProxyBaseUrl));
  }
}
