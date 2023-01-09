import { log } from "./deps.ts";
import {
  Engagement,
  EngagementsParameters,
  EngagementsResponse,
  Organizer,
} from "./types.ts";

import {
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

const transformEngagement = (engagement: ApiSearchEngagement): Engagement => {
  return {
    id: engagement.id,
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

const voltasticsApi = (
  config: VoltasticsConfig,
  route: ApiRoutes,
  params: URLSearchParams,
) => {
  const url = new URL(`${config.baseUrl}/${route}`);
  url.search = params.toString();

  return fetch(url, {
    headers: {
      "x-voltastics-token": config.apiToken,
    },
  });
};

const buildVoltasticsEngagementsSearchParams = (
  {
    limit = 5,
    offset = 0,
    location,
    categories,
    latitude,
    longitude,
    radiusKm,
  }: EngagementsParameters,
) => {
  const params = new URLSearchParams();
  params.append("limit", limit.toString());
  params.append("offset", offset.toString());

  if (location) {
    params.append("city", location);
  }

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

export const fetchEngagements = (voltasticsConfig: VoltasticsConfig) =>
(
  params: EngagementsParameters,
): Promise<EngagementsResponse> => {
  const searchParams = buildVoltasticsEngagementsSearchParams(params);
  const start = Date.now();
  log.debug(`fetching engagements from ${voltasticsConfig.baseUrl}`);
  return voltasticsApi(
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
