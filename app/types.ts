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

export type City = {
  name: string;
};

export type Category = {
  name: string;
};

export type EngagementResponse = Engagement | null;

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
  category?: string;
};

export type CitiesResponse = { data: City[] };

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
