export type Organizer = {
  name?: string
  imageUrl?: string
}

export type Engagement = {
  id: string
  title: string
  description: string
  url: string
  imageUrl?: string
  source: string
  categories: string[]
  organizer?: Organizer
  location?: string
  latitude?: number | null
  longitude?: number | null

  topics: string[]
  skills: string[]
  topicsV2: string[]
  skillsV2: string[]

  matchedTopics?: string[]
  matchedSkills?: string[]
  matchedGeoLocationDistanceInMeters?: number
}

export type EngagementResponse = Engagement | null

export type EngagementsResponse = {
  totalResults: number
  data: Engagement[]
}

export type SimilarRecommendationsParameters = {
  limit: number
  offset: number
  id: string
}

export type EngagementReco = {
  engagement: Engagement
  matchedTopics?: string[]
  matchedSkills?: string[]
  matchedTopicsV2?: string[]
  matchedSkillsV2?: string[]
  matchedGeoLocationDistanceInMeters?: number
}

export type EngagementRecosResponse = {
  totalResults: number
  data: EngagementReco[]
}

export type EngagementParameters = {
  id: string
}

export type TrackEngagementViewParameters = {
  id: string
}

export type TrackEngagementViewResponse = {
  id: string
}

export type EngagementRecosParameters = {
  limit: number
  offset: number
  skills: string[]
  topics: string[]
  geolocationId?: string
}

export type GeolocationGeometry = {
  type: string
  coordinates: number[] | number[][] | number[][][] | number[][][][]
}

export type GeolocationCoordinates = {
  lat: number
  lon: number
}

export type GeolocationProperties = {
  formatted: string
} & GeolocationCoordinates

export type FilteredEngagementsParameters = {
  limit: number
  offset: number
  skills: string[]
  topics: string[]
  geolocationId?: string
}
