import { Client } from "./deps.ts";
import { Engagement } from "./types.ts";

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

export class Database {
  private client: Client;
  private imageProxyBaseUrl: string;

  constructor(config: DatabaseConfig, imageProxyBaseUrl: string) {
    this.client = new Client({
      hostname: config.hostname,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      /*controls: {
        debug: {
          queries: true,
          notices: true,
          results: true,
          queryInError: true,
        },
      },
      */
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
          encodeURIComponent(row.image), // ????
      imageUrlOriginal: row.image, // TODO ????
      source: row.source,
      categories: JSON.parse(row.uses), // TODO this might fail
      organizer: row.orga && { name: row.orga, imageUrl: row.imageorga },
      location: row.location,
      latitude: row.latitude,
      longitude: row.longitude,
    } as Engagement));
  }

  // // User vector
  // const userVector = [1.0, 2.0, 3.0]; // Replace with your actual vector

  // // Parameters for similarity search
  // const similarityThreshold = 0.8;
  // const numMatches = 5;

  // // Find top matches
  // await findTopMatches(userVector, similarityThreshold, numMatches);

  // // Close the database connection
  // await client.end();
}
