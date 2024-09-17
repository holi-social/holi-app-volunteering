export type Organizer = {
  name?: string;
  imageUrl?: string;
};

export type Engagement = {
  id: string;
  title: string;
  description: string;
  url: string;
  // HOLI-4384 imageUrl uses imageProxy-prepended URL for fixing old app versions
  imageUrl?: string;
  // HOLI-4384 imageUrlOriginal allows app/web-side implementation of optimized image size fetching
  // can be removed once all app versions are updated
  imageUrlOriginal?: string;
  source: string;
  categories: string[];
  organizer?: Organizer;
  location?: string;
  latitude?: number | null;
  longitude?: number | null;

  topics: string[];
  skills: string[];

  matchedTopics?: string[];
  matchedSkills?: string[];
  matchedGeoLocationDistanceInMeters?: number;
};

export type Category = {
  name: string;
};

export type EngagementResponse = Engagement | null;

export type EngagementsResponse = {
  totalResults: number;
  data: Engagement[];
};

export type EngagementReco = {
  engagement: Engagement;

  matchedTopics?: string[];
  matchedSkills?: string[];
  matchedGeoLocationDistanceInMeters?: number;
};

export type EngagementRecosResponse = {
  totalResults: number;
  data: EngagementReco[];
};

export type EngagementOpportunitiesParameters = {
  limit: number;
  offset: number;
  location?: PlaceDetails;
  category?: string;
};

export type CategoriesResponse = { data: Category[] };

export type EngagementParameters = {
  id: string;
};

export type TrackEngagementViewParameters = {
  id: string;
};

export type TrackEngagementViewResponse = {
  id: string;
};

export type EngagementRecosParameters = {
  limit: number;
  offset: number;
  skills: string[];
  topics: string[];
  geolocationId?: string;
};

export type PlaceDetails = {
  name: string;
  geolocation: GeolocationGeoJSON;
};

export type GeolocationGeometry = {
  type: string;
  coordinates: number[] | number[][] | number[][][] | number[][][][];
};

export type GeolocationCoordinates = {
  lat: number;
  lon: number;
};

export type GeolocationProperties = {
  formatted: string;
} & GeolocationCoordinates;

export type GeolocationGeoJSON = {
  properties: GeolocationProperties;
  geometry: GeolocationGeometry;
};

export type FilteredEngagementsParameters = {
  limit: number;
  offset: number;
  skills: string[];
  topics: string[];
  geolocationId?: string;
};
