import { GeoLocation } from "./volunteering_db.ts";

type GeoAPIResponse = {
  data?: {
    placeDetails?: {
      geolocation?: {
        properties?: {
          lat?: number;
          lon?: number;
        };
      };
    };
  };
};

export const resolveGeoLocationViaGeoAPI =
  (geoAPIEndpointUrl: string) =>
  async (geolocationId: string): Promise<GeoLocation> => {
    const graphQLQuery =
      `{ placeDetails(id: "${geolocationId}") { geolocation } }`;
    const response = await fetch(geoAPIEndpointUrl, {
      "body": JSON.stringify({ query: graphQLQuery }),
      "headers": {
        "Accept": "application/graphql-response+json, application/json",
        "Content-Type": "application/json",
      },
      "method": "POST",
    });
    const responseJSON = await response.json() as GeoAPIResponse;
    const { lat, lon } =
      responseJSON.data?.placeDetails?.geolocation?.properties || {};
    if (lat && lon) {
      return { lat, lon };
    } else {
      return Promise.reject(
        `Resolution of lat/lng failed (no data included in response for geolocationId=${geolocationId})`,
      );
    }
  };
