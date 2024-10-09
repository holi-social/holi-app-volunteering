import { GeolocationGeometry } from './types.ts'
import { turf } from './deps.ts'
import { ApiDefaults } from './api_types.ts'
import { logger } from './logging.ts'

/**
 * Calculates the radius of a given polygon or multi-polygon geometry.
 *
 * @param {GeolocationGeometry} geometry - The input geometry to calculate the radius for.
 * @returns {number} The calculated radius in kilometers.
 */
export function calculateRadius(geometry: GeolocationGeometry) {
  if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') {
    return ApiDefaults.MIN_RADIUS
  }

  const center = turf.center(geometry)
  const vertices = turf.explode(geometry)

  let maxDistance: number = ApiDefaults.MIN_RADIUS

  turf.coordEach(vertices, (vertice) => {
    const distance = turf.distance(center, turf.point(vertice), {
      units: 'kilometers',
    })

    if (distance > maxDistance) {
      maxDistance = distance
    }
  })

  const radius = Math.ceil(maxDistance)

  if (radius >= ApiDefaults.MAX_RADIUS) {
    return ApiDefaults.MAX_RADIUS
  }

  return radius
}

export function isNonEmptyString(str?: string) {
  return typeof str === 'string' && str.trim().length > 0
}

export function safeJsonParse(str: string, errMsg: string) {
  try {
    return JSON.parse(str)
  } catch (_e) {
    logger.warn(errMsg)
    return undefined
  }
}
