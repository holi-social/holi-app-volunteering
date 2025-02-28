import { ApiRoutes } from './api_types.ts'
import { logger } from './logging.ts'
import { TrackEngagementViewParameters, TrackEngagementViewResponse } from './types.ts'
import { VoltasticsConfig } from './config.ts'

const fetchFromVoltasticsApi = (
  config: VoltasticsConfig,
  route: ApiRoutes,
  params?: URLSearchParams,
) => {
  const url = new URL(`${config.baseUrl}/${route}`)

  if (params) {
    url.search = params.toString()
  }

  return fetch(url, {
    headers: {
      'x-voltastics-token': config.apiToken,
    },
  })
}

export const trackEngagementView = (voltasticsConfig: VoltasticsConfig) =>
(
  params: TrackEngagementViewParameters,
): Promise<TrackEngagementViewResponse> => {
  const searchParams = new URLSearchParams()
  searchParams.append('id', params.id)
  const start = Date.now()
  logger.info(`tracking engagement view from ${voltasticsConfig.baseUrl}`)

  fetchFromVoltasticsApi(voltasticsConfig, ApiRoutes.TRACK_VIEW, searchParams)
    .then((result) => {
      const duration = Date.now() - start
      logger.debug(`tracking engagement view took ${duration} ms`)
      return result
    })
    .catch((e) => {
      const duration = Date.now() - start
      logger.error(
        `Error performing request to ${voltasticsConfig.baseUrl} after ${duration} ms: ${e.message}`,
        { duration },
      )
      throw e
    })

  // Return immediately and run Voltastics API call asynchronously
  return Promise.resolve({ id: params.id })
}
