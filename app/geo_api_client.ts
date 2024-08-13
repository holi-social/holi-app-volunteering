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
  const { lat, lon: lng } =
    responseJSON.data?.placeDetails?.geolocation?.properties || {};
  if (lat && lng) {
    return { lat, lng };
  } else {
    return Promise.reject(
      `Resolution of lat/lng failed (no data included in response for geolocationId=${geolocationId})`,
    );
  }
};
