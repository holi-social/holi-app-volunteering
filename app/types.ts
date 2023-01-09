export type Organizer = {
  name?: string;
  imageUrl?: string;
};

export type Engagement = {
  id: string;
  title: string;
  description: string;
  url: string;
  imageUrl?: string;
  source: string;
  categories: string[];
  organizer?: Organizer;
  location?: string;
  latitude?: number | null;
  longitude?: number | null;
};

export type EngagementsResponse = {
  totalResults: number;
  data: Engagement[];
};

export type EngagementsParameters = {
  limit: number;
  offset: number;
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  location?: string;
  categories?: string[];
};

export type TrackEngagementViewParameters = {
  id: string;
};

export type TrackEngagementViewResponse = {
  id: string;
};
