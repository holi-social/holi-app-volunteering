import { log } from "./deps.ts";
import {
  CitiesResponse,
  City,
  Engagement,
  EngagementParameters,
  EngagementResponse,
  EngagementsParameters,
  EngagementsResponse,
  Organizer,
  TrackEngagementViewParameters,
  TrackEngagementViewResponse,
} from "./types.ts";

import {
  ApiCitiesResponse,
  ApiDefaults,
  ApiEngagementResponse,
  ApiRoutes,
  ApiSearchEngagement,
  ApiSearchEngagementsResponse,
} from "./api_types.ts";
import { VoltasticsConfig } from "./server.ts";

const transformOrganizer = (
  engagement: ApiSearchEngagement,
): Organizer | undefined => {
  if (engagement.orga) {
    return {
      name: engagement.orga,
      imageUrl: engagement.imageOrga,
    };
  }
};

export const transformEngagement = (
  engagement: ApiSearchEngagement,
): Engagement => {
  return {
    id: engagement.id.toString(),
    title: engagement.title,
    description: engagement.description,
    url: engagement.link,
    imageUrl: engagement.image,
    source: engagement.source,
    categories: engagement.uses,
    organizer: transformOrganizer(engagement),
    location: engagement.location,
    latitude: engagement.latitude,
    longitude: engagement.longitude,
  };
};

const transformEngagementResponse = (
  engagementResponse: ApiEngagementResponse,
): EngagementResponse => {
  if ("success" in engagementResponse) {
    return null;
  }
  return transformEngagement(engagementResponse);
};

const transformEngagementsResponse = (
  engagementsResponse: ApiSearchEngagementsResponse,
): EngagementsResponse => {
  if ("success" in engagementsResponse) {
    return {
      totalResults: 0,
      data: [],
    };
  }
  return {
    totalResults: engagementsResponse.totalEntries,
    data: engagementsResponse.entries.map(transformEngagement),
  };
};

const transformCity = (city: string): City => {
  return {
    name: city,
  };
};

const transformCitiesResponse = (
  citiesResponse: ApiCitiesResponse,
): CitiesResponse => {
  return { data: citiesResponse.map(transformCity) };
};

const fetchFromVoltasticsApi = (
  config: VoltasticsConfig,
  route: ApiRoutes,
  params?: URLSearchParams,
) => {
  const url = new URL(`${config.baseUrl}/${route}`);

  if (params) {
    url.search = params.toString();
  }

  return fetch(url, {
    headers: {
      "x-voltastics-token": config.apiToken,
    },
  });
};

const buildVoltasticsEngagementsSearchParams = ({
  limit = 5,
  offset = 0,
  location = ApiDefaults.CITY,
  categories,
  latitude,
  longitude,
  radiusKm,
}: EngagementsParameters) => {
  const params = new URLSearchParams();
  params.append("limit", limit.toString());
  params.append("offset", offset.toString());
  params.append("city", location);

  if (latitude) {
    params.append("lat", latitude.toString());
  }

  if (longitude) {
    params.append("lon", longitude.toString());
  }

  if (radiusKm) {
    params.append("radius", radiusKm.toString());
  }

  categories?.forEach((category) => params.append("use", category));

  return params;
};

export const fetchEngagements =
  (voltasticsConfig: VoltasticsConfig) =>
  (params: EngagementsParameters): Promise<EngagementsResponse> => {
    const searchParams = buildVoltasticsEngagementsSearchParams(params);
    const start = Date.now();
    log.debug(`fetching engagements from ${voltasticsConfig.baseUrl}`);
    return fetchFromVoltasticsApi(
      voltasticsConfig,
      ApiRoutes.SEARCH_ENGAGEMENTS,
      searchParams,
    )
      .then((result) => result.json())
      .then(transformEngagementsResponse)
      .then((result) => {
        const duration = Date.now() - start;
        log.debug(`fetching engagements took ${duration} ms`);
        return result;
      })
      .catch((e) => {
        const duration = Date.now() - start;
        log.error(
          `Error performing request to ${voltasticsConfig.baseUrl} after ${duration} ms: ${e.message}`,
        );
        throw e;
      });
  };

export const trackEngagementView = (voltasticsConfig: VoltasticsConfig) =>
(
  params: TrackEngagementViewParameters,
): Promise<TrackEngagementViewResponse> => {
  const searchParams = new URLSearchParams();
  searchParams.append("id", params.id);
  const start = Date.now();
  log.debug(`tracking engagement view from ${voltasticsConfig.baseUrl}`);
  fetchFromVoltasticsApi(voltasticsConfig, ApiRoutes.TRACK_VIEW, searchParams)
    .then((result) => {
      const duration = Date.now() - start;
      log.debug(`tracking engagement view took ${duration} ms`);
      return result;
    })
    .catch((e) => {
      const duration = Date.now() - start;
      log.error(
        `Error performing request to ${voltasticsConfig.baseUrl} after ${duration} ms: ${e.message}`,
      );
      throw e;
    });

  // Return immediately and run Voltastics API call asynchronously
  return Promise.resolve({ id: params.id });
};

export const fetchEngagement =
  (voltasticsConfig: VoltasticsConfig) =>
  ({ id }: EngagementParameters): Promise<EngagementResponse> => {
    const searchParams = new URLSearchParams();
    searchParams.append("id", id);

    const start = Date.now();
    log.debug(`fetching engagement ${id} from ${voltasticsConfig.baseUrl}`);
    return fetchFromVoltasticsApi(
      voltasticsConfig,
      ApiRoutes.ENGAGEMENT,
      searchParams,
    )
      .then((result) => result.json())
      .then(transformEngagementResponse)
      .then((result) => {
        const duration = Date.now() - start;
        log.debug(`fetching engagement ${id} took ${duration} ms`);
        return result;
      })
      .catch((e) => {
        const duration = Date.now() - start;
        log.error(
          `Error performing request to ${voltasticsConfig.baseUrl} after ${duration} ms: ${e.message}`,
        );
        throw e;
      });
  };

export const fetchCities = (
  voltasticsConfig: VoltasticsConfig,
): Promise<CitiesResponse> => {
  const start = Date.now();
  log.debug(`fetching cities from ${voltasticsConfig.baseUrl}`);
  return fetchFromVoltasticsApi(
    voltasticsConfig,
    ApiRoutes.CITIES,
  )
    .then((result) => result.json())
    .then(transformCitiesResponse)
    .then((result) => {
      const duration = Date.now() - start;
      log.debug(`fetching cities took ${duration} ms`);
      return result;
    })
    .catch((e) => {
      const duration = Date.now() - start;
      log.error(
        `Error performing request to ${voltasticsConfig.baseUrl} after ${duration} ms: ${e.message}`,
      );
      throw e;
    });
};
