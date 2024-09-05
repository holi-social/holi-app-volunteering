import {
  ApiCategoriesResponse,
  ApiDefaults,
  ApiRoutes,
  ApiSearchEngagement,
  ApiSearchEngagementsResponse,
} from "./api_types.ts";
import { logger } from "./logging.ts";
import { ServerConfig, VoltasticsConfig } from "./server.ts";
import {
  CategoriesResponse,
  Category,
  Engagement,
  EngagementOpportunitiesParameters,
  EngagementsResponse,
  Organizer,
  TrackEngagementViewParameters,
  TrackEngagementViewResponse,
} from "./types.ts";
import { calculateRadius } from "./utils.ts";

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

export const transformEngagement = (imageProxyBaseUrl: string) =>
(
  engagement: ApiSearchEngagement,
): Engagement => {
  return {
    id: engagement.id.toString(),
    title: engagement.title,
    description: engagement.description,
    url: engagement.link,
    imageUrl: engagement.image &&
      `${imageProxyBaseUrl}/crop:0:0/resize:auto:1024/plain/` +
        encodeURIComponent(engagement.image),
    imageUrlOriginal: engagement.image,
    source: engagement.source,
    categories: engagement.uses,
    organizer: transformOrganizer(engagement),
    location: engagement.location,
    latitude: engagement.latitude,
    longitude: engagement.longitude,
    topics: [],
    skills: [],
  };
};

const transformEngagementsResponse = (imageProxyBaseUrl: string) =>
(
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
    data: engagementsResponse.entries.map(
      transformEngagement(imageProxyBaseUrl),
    ),
  };
};

const transformCategory = (category: string): Category => {
  return {
    name: category,
  };
};

const transformCategoriesResponse = (
  categoriesResponse: ApiCategoriesResponse,
): CategoriesResponse => {
  return { data: categoriesResponse.filter(String).map(transformCategory) };
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

const buildVoltasticsEngagementOpportunitiesSearchParams = ({
  limit = 5,
  offset = 0,
  location,
  category,
}: EngagementOpportunitiesParameters) => {
  const params = new URLSearchParams();
  params.append("limit", limit.toString());
  params.append("offset", offset.toString());

  if (location) {
    const { geolocation: { geometry, properties: { lat, lon } } } = location;

    const radius = calculateRadius(geometry);

    params.append("lat", lat.toString());
    params.append("lon", lon.toString());
    params.append("radius", radius.toString());
  } else {
    params.append("city", ApiDefaults.CITY);
  }

  if (category) {
    params.append("use", category);
  }

  return params;
};

export const fetchEngagementOpportunities = (config: ServerConfig) =>
(
  params: EngagementOpportunitiesParameters,
): Promise<EngagementsResponse> => {
  const searchParams = buildVoltasticsEngagementOpportunitiesSearchParams(
    params,
  );
  const start = Date.now();
  logger.info(
    `fetching engagement opportunities from ${config.voltastics.baseUrl}`,
  );

  return fetchFromVoltasticsApi(
    config.voltastics,
    ApiRoutes.SEARCH_ENGAGEMENTS,
    searchParams,
  )
    .then((result) => result.json())
    .then(transformEngagementsResponse(config.imageProxyBaseUrl))
    .then((result) => {
      const duration = Date.now() - start;
      logger.debug(
        `fetching engagement opportunities took ${duration} ms`,
      );
      return result;
    })
    .catch((e) => {
      const duration = Date.now() - start;
      logger.error(
        `Error performing request to ${config.voltastics.baseUrl} after ${duration} ms: ${e.message}`,
        { duration },
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
  logger.info(`tracking engagement view from ${voltasticsConfig.baseUrl}`);

  fetchFromVoltasticsApi(voltasticsConfig, ApiRoutes.TRACK_VIEW, searchParams)
    .then((result) => {
      const duration = Date.now() - start;
      logger.debug(`tracking engagement view took ${duration} ms`);
      return result;
    })
    .catch((e) => {
      const duration = Date.now() - start;
      logger.error(
        `Error performing request to ${voltasticsConfig.baseUrl} after ${duration} ms: ${e.message}`,
        { duration },
      );
      throw e;
    });

  // Return immediately and run Voltastics API call asynchronously
  return Promise.resolve({ id: params.id });
};

export const fetchCategories = (
  voltasticsConfig: VoltasticsConfig,
): Promise<CategoriesResponse> => {
  const start = Date.now();
  logger.info(`fetching categories from ${voltasticsConfig.baseUrl}`);

  return fetchFromVoltasticsApi(voltasticsConfig, ApiRoutes.USES)
    .then((result) => result.json())
    .then(transformCategoriesResponse)
    .then((result) => {
      const duration = Date.now() - start;
      logger.debug(`fetching categories took ${duration} ms`);
      return result;
    })
    .catch((e) => {
      const duration = Date.now() - start;
      logger.error(
        `Error performing request to ${voltasticsConfig.baseUrl} after ${duration} ms: ${e.message}`,
      );
      throw e;
    });
};
