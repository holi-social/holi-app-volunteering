export type ApiSearchEngagement = {
  id: number;
  title: string;
  description: string;
  link: string;
  image?: string;
  source: string;
  uses: string[];
  hashTags: string[];
  orga?: string;
  imageOrga?: string;
  location?: string;
  latitude?: number | null;
  longitude?: number | null;
};

export type ApiEngagementResponse = ApiSearchEngagement | { success: boolean };

export type ApiSearchEngagementsResponse =
  | {
    totalEntries: number;
    limit: number;
    offset: number;
    entries: ApiSearchEngagement[];
  }
  | { success: boolean };

export type ApiCitiesResponse = string[];

export type ApiCategoriesResponse = string[];

export enum ApiRoutes {
  SEARCH_ENGAGEMENTS = "searchengagement",
  TRACK_VIEW = "trackview",
  ENGAGEMENT = "engagement",
  CITIES = "cities",
  USES = "uses",
}

export enum ApiDefaults {
  CITY = "ALL_CITIES",
}
