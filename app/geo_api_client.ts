import { GeolocationCoordinates, GeolocationGeometry, GeolocationProperties } from './types.ts'
import { logger } from './logging.ts'
import { Sentry } from './deps.ts'

type GeoAPIResponse = {
  data?: {
    placeDetails?: {
      geolocation?: {
        properties?: Partial<GeolocationProperties>
        geometry?: Partial<GeolocationGeometry>
      }
    }
  }
}

type GeoAPIPlace = {
  id?: string
}

type GeoAPIAutocompleteResponse = {
  data?: {
    placesAutocomplete?: GeoAPIPlace[]
  }
}

export interface GeoAPIClient {
  resolveCoordinates(geolocationId: string): Promise<GeolocationCoordinates>
  resolveGeometry(geolocationId: string, options?: { allowPoints?: boolean }): Promise<GeolocationGeometry>
}

export class GeoAPIClientImpl implements GeoAPIClient {
  private readonly geoAPIEndpointUrl: string

  constructor(geoAPIEndpointUrl: string) {
    this.geoAPIEndpointUrl = geoAPIEndpointUrl
  }

  private async resolveGeolocationViaGeoAPI(
    geolocationId: string,
  ): Promise<GeoAPIResponse> {
    return await Sentry.startSpan({ name: 'GeoAPIClient.resolveGeolocationViaGeoAPI' }, async () => {
      const graphQLQuery = `{ placeDetails(id: "${geolocationId}") { geolocation } }`
      const response = await fetch(this.geoAPIEndpointUrl, {
        'body': JSON.stringify({ query: graphQLQuery }),
        'headers': {
          'Accept': 'application/graphql-response+json, application/json',
          'Content-Type': 'application/json',
        },
        'method': 'POST',
      })
      return await response.json() as GeoAPIResponse
    })
  }

  private async resolvePlaceIdByName(name: string): Promise<string | undefined> {
    return await Sentry.startSpan({ name: 'GeoAPIClient.resolvePlaceIdByName' }, async () => {
      const graphQLQuery = `{ placesAutocomplete(text: "${name}", limit: 1) { id } }`
      const response = await fetch(this.geoAPIEndpointUrl, {
        'body': JSON.stringify({ query: graphQLQuery }),
        'headers': {
          'Accept': 'application/graphql-response+json, application/json',
          'Content-Type': 'application/json',
        },
        'method': 'POST',
      })
      const { data } = await response.json() as GeoAPIAutocompleteResponse
      const [place] = data?.placesAutocomplete || []
      return place?.id
    })
  }

  async resolveCoordinates(
    geolocationId: string,
  ): Promise<GeolocationCoordinates> {
    return await Sentry.startSpan({ name: 'GeoAPIClient.resolveCoordinates' }, async () => {
      const responseJSON = await this.resolveGeolocationViaGeoAPI(geolocationId)
      const { lat, lon } = responseJSON.data?.placeDetails?.geolocation?.properties || {}
      if (lat && lon) {
        return { lat, lon }
      } else {
        return Promise.reject(
          `Resolution of lat/lon failed (no data included in response for geolocationId=${geolocationId})`,
        )
      }
    })
  }

  async resolveGeometry(
    geolocationId: string,
    options: { allowPoints?: boolean } = { allowPoints: false },
  ): Promise<GeolocationGeometry> {
    return await Sentry.startSpan({ name: 'GeoAPIClient.resolveGeometry' }, async () => {
      const responseJSON = await this.resolveGeolocationViaGeoAPI(geolocationId)
      const { geometry, properties } = responseJSON.data?.placeDetails?.geolocation || {}
      const { type, coordinates } = geometry || {}
      if (type && coordinates) {
        const locationName = properties?.formatted
        if (type === 'Point' && !options.allowPoints && locationName) {
          logger.debug(`Retrieved point as geolocation, will retry with lookup for location ${locationName}`)
          const placeId = await this.resolvePlaceIdByName(locationName)
          if (placeId && placeId !== geolocationId) {
            return this.resolveGeometry(placeId, { allowPoints: true })
          }
        }
        return { type, coordinates }
      } else {
        return Promise.reject(
          `Resolution of geolocation geometry failed (no data included in response for geolocationId=${geolocationId})`,
        )
      }
    })
  }
}
