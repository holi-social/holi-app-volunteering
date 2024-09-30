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
};

export type Category = {
  name: string;
};

export type EngagementResponse = Engagement | null;

export type EngagementsResponse = {
  totalResults: number;
  data: Engagement[];
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

export type EngagementRecommendationsParameters = {
  limit: number;
  offset: number;
  skills: string[];
  topics: string[];
  location?: PlaceDetails;
};

export type SimilarRecommendationsParameters = {
  limit: number;
  offset: number;
  id: string;
};

export type PlaceDetails = {
  name: string;
  geolocation: GeolocationGeoJSON;
};

export type GeolocationGeometry = {
  type: string;
  coordinates: number[] | number[][] | number[][][] | number[][][][];
};

export type Place = {
  lon: number;
  lat: number;
};

export type GeolocationGeoJSON = {
  properties: Place;
  geometry: GeolocationGeometry;
};

// TODO: Delete the following when app version 1.5.1 is no longer supported.
export type City = {
  name: string;
};

export type CitiesResponse = { data: City[] };

export type EngagementsParameters = {
  limit: number;
  offset: number;
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  location?: string;
  category?: string;
};
