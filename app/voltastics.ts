import {
  ApiCategoriesResponse,
  ApiCitiesResponse,
  ApiDefaults,
  ApiEngagementResponse,
  ApiRoutes,
  ApiSearchEngagement,
  ApiSearchEngagementsResponse,
} from "./api_types.ts";
import { sortCitiesAlphabetically } from "./helpers.ts";
import { logger } from "./logging.ts";
import { ServerConfig, VoltasticsConfig } from "./server.ts";
import {
  CategoriesResponse,
  Category,
  CitiesResponse,
  City,
  Engagement,
  EngagementOpportunitiesParameters,
  EngagementParameters,
  EngagementRecommendationsParameters,
  EngagementResponse,
  EngagementsParameters,
  EngagementsResponse,
  Organizer,
  TrackEngagementViewParameters,
  TrackEngagementViewResponse,
} from "./types.ts";
import { calculateRadius } from "./utils.ts";
import { GraphQLError } from "./deps.ts";

const ERROR_CODE_NOT_FOUND = "NOT_FOUND";

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
  };
};

const transformEngagementResponse = (imageProxyBaseUrl: string) =>
(
  engagementResponse: ApiEngagementResponse,
): EngagementResponse => {
  if ("success" in engagementResponse) {
    return null;
  }
  return transformEngagement(imageProxyBaseUrl)(engagementResponse);
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

export const fetchEngagement =
  (config: ServerConfig) =>
  ({ id }: EngagementParameters): Promise<EngagementResponse> => {
    const searchParams = new URLSearchParams();
    searchParams.append("id", id);

    const start = Date.now();
    logger.info(
      `fetching engagement ${id} from ${config.voltastics.baseUrl}`,
    );
    return fetchFromVoltasticsApi(
      config.voltastics,
      ApiRoutes.ENGAGEMENT,
      searchParams,
    )
      .then((response) => {
        if (response.status === 404) {
          throw new GraphQLError("Not found", {
            extensions: { "code": ERROR_CODE_NOT_FOUND },
          });
        }
        return response.json();
      })
      .then(transformEngagementResponse(config.imageProxyBaseUrl))
      .then((result) => {
        const duration = Date.now() - start;
        logger.debug(`fetching engagement ${id} took ${duration} ms`);
        return result;
      })
      .catch((e) => {
        if (e.extensions?.code !== ERROR_CODE_NOT_FOUND) {
          const duration = Date.now() - start;

          logger.error(
            `Error performing request to ${config.voltastics.baseUrl} after ${duration} ms: ${e.message}`,
            { duration },
          );
        }
        throw e;
      });
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

// TODO: Delete the following when app version 1.5.1 is no longer supported.
const transformCity = (city: string): City => {
  return {
    name: city,
  };
};

const transformCitiesResponse = (
  citiesResponse: ApiCitiesResponse,
): CitiesResponse => {
  return {
    data: citiesResponse.sort(sortCitiesAlphabetically).map(transformCity),
  };
};

const buildVoltasticsEngagementsSearchParams = ({
  limit = 5,
  offset = 0,
  location = ApiDefaults.CITY,
  category,
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

  if (category) {
    params.append("use", category);
  }

  return params;
};

export const fetchEngagements =
  (config: ServerConfig) =>
  (params: EngagementsParameters): Promise<EngagementsResponse> => {
    const searchParams = buildVoltasticsEngagementsSearchParams(params);
    const start = Date.now();
    logger.info(`fetching engagements from ${config.voltastics.baseUrl}`);

    return fetchFromVoltasticsApi(
      config.voltastics,
      ApiRoutes.SEARCH_ENGAGEMENTS,
      searchParams,
    )
      .then((result) => result.json())
      .then(transformEngagementsResponse(config.imageProxyBaseUrl))
      .then((result) => {
        const duration = Date.now() - start;
        logger.debug(`fetching engagements took ${duration} ms`);
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

const topicsVectorIndices = new Map<string, number>([
  ["agriculture-food", 0],
  ["alternative-economy", 1],
  ["biodiversity-animal-welfare", 2],
  ["building-housing", 3],
  ["children-youth", 4],
  ["climate-protection", 5],
  ["consumption-lifestyle", 6],
  ["culture-social-change", 7],
  ["democracy-human-rights", 8],
  ["disabilities-inclusion", 9],
  ["diversity-gender-equality", 10],
  ["eco-tourism", 11],
  ["education-science", 12],
  ["elderly-people", 13],
  ["energy-transition", 14],
  ["governance", 15],
  ["migration-integration", 16],
  ["mobility-infrastructure", 17],
  ["natural-disaster-response", 18],
  ["natural-resources", 19],
  ["other", 20],
  ["peace-security", 21],
  ["physical-mental-health", 22],
  ["politics-society", 23],
  ["poverty-homelesness", 24],
  ["technological-innovation", 25],
  ["urban-rural-development", 26],
  ["water-ocean", 27],
]);

const skillsVectorIndices = new Map<string, number>([
  ["adaptability", 0],
  ["analytical-thinking", 1],
  ["arts-music-culture", 2],
  ["assertiveness", 3],
  ["building-handicraft", 4],
  ["caring-nursing", 5],
  ["coaching & mentoring", 6],
  ["commitment", 7],
  ["communication-skills", 8],
  ["conflict-management", 9],
  ["cooking-baking", 10],
  ["coordination-coordination-of-volunteers", 11],
  ["creativity", 12],
  ["critical-thinking", 13],
  ["design", 14],
  ["development-concept", 15],
  ["discipline", 16],
  ["drive-transport", 17],
  ["empathy", 18],
  ["environmental-awareness", 19],
  ["finances-taxes", 20],
  ["fundraising", 21],
  ["hands-on-support", 22],
  ["holistic-thinking", 23],
  ["humour", 24],
  ["inclusive-mindset-intercultural-competence", 25],
  ["independence", 26],
  ["initiative-and-energy", 27],
  ["it-technology", 28],
  ["knowledge-management", 29],
  ["law-regulations", 30],
  ["leadership", 31],
  ["management-strategy", 32],
  ["marketing-social-media", 33],
  ["mindfulness", 34],
  ["moderation-facilitation", 35],
  ["motivation", 36],
  ["negotiation-skills", 37],
  ["openness", 38],
  ["organizational-skills", 39],
  ["public-relations", 40],
  ["relationship-skills", 41],
  ["resilience", 42],
  ["self-confident", 43],
  ["solution-orientedness", 44],
  ["teaching-education", 45],
  ["teamwork", 46],
  ["visionary-thinking", 47],
  ["willingness-to-learn", 48],
  ["writing-translation", 49],
]);

const recosQueryVector = (topics: string[], skills: string[]): number[] => {
  const queryVector: number[] = Array(
    topicsVectorIndices.size + skillsVectorIndices.size,
  ).fill(0.0);
  for (const topic of topics) {
    if (topicsVectorIndices.has(topic)) {
      queryVector[topicsVectorIndices.get(topic)!] = 1.0;
    }
  }
  for (const skill of skills) {
    if (skillsVectorIndices.has(skill)) {
      queryVector[
        topicsVectorIndices.size + skillsVectorIndices.get(skill)!
      ] = 1.0;
    }
  }
  return queryVector;
};

export const fetchEngagementRecommendations = (_config: ServerConfig) =>
(
  params: EngagementRecommendationsParameters,
): Promise<EngagementsResponse> => {
  const queryVector = recosQueryVector(params.topics, params.skills);
  logger.debug(
    `fetchEngagementRecommendations(${JSON.stringify(params)}) ${queryVector}`,
  );
  return Promise.resolve({
    totalResults: 0,
    data: [],
  });
};

export const fetchCities = (
  voltasticsConfig: VoltasticsConfig,
): Promise<CitiesResponse> => {
  const start = Date.now();
  logger.info(`fetching cities from ${voltasticsConfig.baseUrl}`);

  return fetchFromVoltasticsApi(voltasticsConfig, ApiRoutes.CITIES)
    .then((result) => result.json())
    .then(transformCitiesResponse)
    .then((result) => {
      const duration = Date.now() - start;
      logger.debug(`fetching cities took ${duration} ms`);
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
};
