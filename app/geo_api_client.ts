import { GeolocationCoordinates, GeolocationGeometry } from "./types.ts";

type GeoAPIResponse = {
  data?: {
    placeDetails?: {
      geolocation?: {
        properties?: Partial<GeolocationCoordinates>;
        geometry?: Partial<GeolocationGeometry>;
      };
    };
  };
};

export class GeoAPIClient {
  private readonly geoAPIEndpointUrl: string;

  constructor(geoAPIEndpointUrl: string) {
    this.geoAPIEndpointUrl = geoAPIEndpointUrl;
  }

  private async resolveGeolocationViaGeoAPI(
    geolocationId: string,
  ): Promise<GeoAPIResponse> {
    const graphQLQuery = `{ placeDetails(id: "${geolocationId}") { geolocation } }`;
    const response = await fetch(this.geoAPIEndpointUrl, {
      "body": JSON.stringify({ query: graphQLQuery }),
      "headers": {
        "Accept": "application/graphql-response+json, application/json",
        "Content-Type": "application/json",
      },
      "method": "POST",
    });
    return response.json() as GeoAPIResponse;
  }

  async resolveCoordinates(
    geolocationId: string,
  ): Promise<GeolocationCoordinates> {
    const responseJSON = await this.resolveGeolocationViaGeoAPI(geolocationId);

    const { lat, lon } = responseJSON.data?.placeDetails?.geolocation?.properties || {};
    if (lat && lon) {
      return { lat, lon };
    } else {
      return Promise.reject(
        `Resolution of lat/lon failed (no data included in response for geolocationId=${geolocationId})`,
      );
    }
  }

  async resolveGeometry(
    geolocationId: string,
  ): Promise<GeolocationGeometry> {
    const responseJSON = await this.resolveGeolocationViaGeoAPI(geolocationId);
    const { type, coordinates } = responseJSON.data?.placeDetails?.geolocation
      ?.geometry || {};
    if (type && coordinates) {
      return { type, coordinates };
    } else {
      return Promise.reject(
        `Resolution of geolocation geometry failed (no data included in response for geolocationId=${geolocationId})`,
      );
    }
  }
}
