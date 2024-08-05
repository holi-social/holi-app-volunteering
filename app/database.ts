import { Client } from "./deps.ts";

export type DatabaseConfig = {
  hostname: string;
  port: string;
  database: string;
  username: string;
  password: string;
};

export class Database {
  private client: Client;

  constructor(config: DatabaseConfig) {
    this.client = new Client({
      hostname: config.hostname,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
    });
  }

  async connect() {
    await this.client.connect();
  }

  async disconnect() {
    await this.client.end();
  }

  // Function to perform cosine similarity search
  async findTopMatches(
    userVector: number[],
    similarityThreshold: number,
    numMatches: number,
  ) {
    const query = `
      WITH vector_matches AS (
        SELECT id, 
              1 - (embedding_array <=> $1) AS similarity
        FROM your_table
        WHERE 1 - (embedding_array <=> $1) > $2
        ORDER BY similarity DESC
        LIMIT $3
      )
      SELECT id, description, similarity 
      FROM vector_matches;
    `;

    // Execute the query with the provided parameters
    const result = await this.client.queryObject<
      { id: number; description: string; similarity: number }
    >(query, userVector, similarityThreshold, numMatches);

    // Print the results
    for (const row of result.rows) {
      console.log(
        `ID: ${row.id}, Description: ${row.description}, Similarity: ${row.similarity}`,
      );
    }
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
