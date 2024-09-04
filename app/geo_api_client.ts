import { GeolocationCoordinates, GeolocationGeometry, GeolocationProperties } from "./types.ts";
import { logger } from "./logging.ts";
import { opentelemetry } from "./deps.ts";

type GeoAPIResponse = {
  data?: {
    placeDetails?: {
      geolocation?: {
        properties?: Partial<GeolocationProperties>;
        geometry?: Partial<GeolocationGeometry>;
      };
    };
  };
};

type GeoAPIPlace = {
  id?: string;
};

type GeoAPIAutocompleteResponse = {
  data?: {
    placesAutocomplete?: GeoAPIPlace[];
  };
};

export class GeoAPIClient {
  private readonly geoAPIEndpointUrl: string;
  private readonly meter: opentelemetry.Meter;

  constructor(geoAPIEndpointUrl: string, meter: opentelemetry.Meter) {
    this.geoAPIEndpointUrl = geoAPIEndpointUrl;
    this.meter = meter;
  }

  private async timed<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const histogram = this.meter.createHistogram(name);
    const before = new Date().getTime();
    const result = await fn();
    const duration = new Date().getTime() - before;
    logger.debug(`[${duration.toString().padStart(4, " ")} ms] ${name}`);
    histogram.record(duration);
    return result;
  }

  private resolveGeolocationViaGeoAPI(
    geolocationId: string,
  ): Promise<GeoAPIResponse> {
    return this.timed("geo_api_client.resolveGeolocationViaGeoAPI", async () => {
      const graphQLQuery = `{ placeDetails(id: "${geolocationId}") { geolocation } }`;
      const response = await fetch(this.geoAPIEndpointUrl, {
        "body": JSON.stringify({ query: graphQLQuery }),
        "headers": {
          "Accept": "application/graphql-response+json, application/json",
          "Content-Type": "application/json",
        },
        "method": "POST",
      });
      return (await response.json()) as GeoAPIResponse;
    });
  }

  private resolvePlaceIdByName(name: string): Promise<string | undefined> {
    return this.timed("geo_api_client.resolvePlaceIdByName", async () => {
      const graphQLQuery = `{ placesAutocomplete(text: "${name}", limit: 1) { id } }`;
      const response = await fetch(this.geoAPIEndpointUrl, {
        "body": JSON.stringify({ query: graphQLQuery }),
        "headers": {
          "Accept": "application/graphql-response+json, application/json",
          "Content-Type": "application/json",
        },
        "method": "POST",
      });
      const { data } = await response.json() as GeoAPIAutocompleteResponse;
      const [place] = data?.placesAutocomplete || [];
      return place?.id;
    });
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
    {
      allowPoints = false,
    }: { allowPoints?: boolean } = {},
  ): Promise<GeolocationGeometry> {
    const responseJSON = await this.resolveGeolocationViaGeoAPI(geolocationId);
    const { geometry, properties } = responseJSON.data?.placeDetails?.geolocation || {};
    const { type, coordinates } = geometry || {};
    if (type && coordinates) {
      const locationName = properties?.formatted;
      if (type === "Point" && !allowPoints && locationName) {
        logger.debug(`Retrieved point as geolocation, will retry with lookup for location ${locationName}`);
        const placeId = await this.resolvePlaceIdByName(locationName);
        if (placeId && placeId !== geolocationId) {
          return this.resolveGeometry(placeId, { allowPoints: true });
        }
      }
      return { type, coordinates };
    } else {
      return Promise.reject(
        `Resolution of geolocation geometry failed (no data included in response for geolocationId=${geolocationId})`,
      );
    }
  }
}
