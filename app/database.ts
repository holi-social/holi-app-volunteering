import { Client } from "./deps.ts";
import { Engagement } from "./types.ts";
import { logger } from "./logging.ts";

export type DatabaseConfig = {
  hostname: string;
  port: string;
  database: string;
  username: string;
  password: string;
};

type DbRet = {
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

// TODO table (and therefore result) contains both a column 'embedding' and 'embedding_array'. what's the difference?

export class Database {
  private client: Client;
  private readonly imageProxyBaseUrl: string;

  constructor(config: DatabaseConfig, imageProxyBaseUrl: string) {
    // TODO add a way to keep a connection open and automatically re-connect
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
    });
    this.imageProxyBaseUrl = imageProxyBaseUrl;
  }

  async connect() {
    await this.client.connect();
  }

  async disconnect() {
    await this.client.end();
  }

  // Function to perform cosine similarity search
  async findTopMatches(
    queryVector: number[],
    similarityThreshold: number,
    numMatches: number,
  ): Promise<Engagement[]> {
    const query = `
      WITH vector_matches AS (
        SELECT *, 1 - (embedding_array <=> $1) AS cosine_similarity
        FROM volunteering_voltastics_with_classification
        WHERE 1 - (embedding_array <=> $1) > ${similarityThreshold}
        ORDER BY cosine_similarity DESC
        LIMIT ${numMatches}
      )
      SELECT *
      FROM vector_matches;
    `;
    const result = await this.client.queryObject<DbRet>({
      text: query,
      args: [JSON.stringify(queryVector)],
    });
    return result.rows.map((row) => ({
      id: "" + row.id,
      title: row.title,
      description: row.description,
      url: row.link,
      imageUrl: row.image &&
        `${this.imageProxyBaseUrl}/crop:0:0/resize:auto:1024/plain/` +
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
    }));
  }
}

function isNonEmptyString(str?: string) {
  return typeof str === "string" && str.trim().length > 0;
}

function safeJsonParse(str: string, errMsg: string) {
  try {
    return JSON.parse(str);
  } catch (_e) {
    logger.warn(errMsg);
    return undefined;
  }
}
