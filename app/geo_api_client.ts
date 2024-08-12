export type LatLng = {
  lat: number;
  lng: number;
};

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

export const resolveLatLng = async (
  geoAPIEndpointUrl: string,
  geolocationId: string,
): Promise<LatLng> => {
  const graphQLQuery =
    '{ placeDetails(id: "${geolocationId}") { geolocation } }';
  const response = await fetch(geoAPIEndpointUrl, {
    "body": JSON.stringify({ query: graphQLQuery }),
    "headers": {
      "Accept": "application/graphql-response+json, application/json",
      "Content-Type": "application/json",
    },
    "method": "POST",
  });
  const responseJSON = await response.json() as GeoAPIResponse;
  const lat = responseJSON.data?.placeDetails?.geolocation?.properties?.lat;
  const lng = responseJSON.data?.placeDetails?.geolocation?.properties?.lon;
  if (lat && lng) {
    console.debug(
      `Successfully resolved lat/lng=${lat}/${lng} for geolocationId=${geolocationId} was successful`,
    );
    return { lat, lng };
  } else {
    const msg =
      `Resolution of lat/lng failed (no data included in response (for geolocationId=${geolocationId})`;
    console.warn(
      msg + `. GeoAPI response was: ${JSON.stringify(responseJSON)}`,
    );
    return Promise.reject(msg);
  }
};
