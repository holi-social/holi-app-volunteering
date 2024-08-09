import { GeolocationGeometry } from "./types.ts";
import { turf } from "./deps.ts";
import { ApiDefaults } from "./api_types.ts";
import { logger } from "./logging.ts";

/**
 * Calculates the radius of a given polygon or multi-polygon geometry.
 *
 * @param {GeolocationGeometry} geometry - The input geometry to calculate the radius for.
 * @returns {number} The calculated radius in kilometers.
 */
export function calculateRadius(geometry: GeolocationGeometry) {
  if (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon") {
    return ApiDefaults.MIN_RADIUS;
  }

  const center = turf.center(geometry);
  const vertices = turf.explode(geometry);

  let maxDistance: number = ApiDefaults.MIN_RADIUS;

  turf.coordEach(vertices, (vertice) => {
    const distance = turf.distance(center, turf.point(vertice), {
      units: "kilometers",
    });

    if (distance > maxDistance) {
      maxDistance = distance;
    }
  });

  const radius = Math.ceil(maxDistance);

  if (radius >= ApiDefaults.MAX_RADIUS) {
    return ApiDefaults.MAX_RADIUS;
  }

  return radius;
}

/**
 * Calculates the overall score based on cosine similarity and distance.
 *
 * The formula used is:
 *
 * `score = alpha * cosine_similarity + beta * (1 - normalized_distance)`
 *
 * where:
 * - `cosine_similarity` is a measure of how similar two vectors are, ranging from 0 to 1.
 * - `distance` is the geographical distance between two points.
 * - `max_distance` is the maximum distance in the result set, used for normalization.
 * - `normalized_distance = distance / max_distance` scales the distance to a range of 0 to 1.
 * - `alpha` and `beta` are weighting factors that balance the importance of similarity and proximity.
 *
 * @param {number} cosine_similarity - The cosine similarity between the query vector and the item vector.
 * @param {number} distance - The geographical distance between the query location and the item's location.
 * @param {number} max_distance - The maximum distance in the current result set for normalization.
 * @param {number} alpha - The weight given to the cosine similarity in the final score.
 * @param {number} beta - The weight given to the proximity (distance) in the final score.
 * @returns {number} The calculated score combining both similarity and proximity.
 */
export function calculateScore(
  cosine_similarity: number,
  distance: number,
  max_distance: number,
  alpha: number,
  beta: number,
): number {
  // Normalize the distance to a range of 0 to 1
  const normalized_distance = max_distance > 0
    ? (1 - (distance / max_distance))
    : 0;

  // Calculate the final score
  const score = alpha * cosine_similarity + beta * (1 - normalized_distance);

  return score;
}

export function isNonEmptyString(str?: string) {
  return typeof str === "string" && str.trim().length > 0;
}

export function safeJsonParse(str: string, errMsg: string) {
  try {
    return JSON.parse(str);
  } catch (_e) {
    logger.warn(errMsg);
    return undefined;
  }
}
