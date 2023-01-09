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

export type ApiSearchEngagementsResponse = {
  totalEntries: number;
  limit: number;
  offset: number;
  entries: ApiSearchEngagement[];
} | { success: boolean };

export enum ApiRoutes {
  SEARCH_ENGAGEMENTS = "searchengagement",
}
