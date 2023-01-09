export enum Radius {
  ONE = 1,
  FIVE = 5,
  TEN = 10,
  TWENTY = 20,
}

export type Organizer = {
  name?: string;
  image?: string;
};

export type Engagement = {
  id: number;
  title: string;
  description: string;
  link: string;
  image?: string;
  source: string;
  uses: string[]; //TODO: rename it to categories
  hashTags: string[]; // TODO: clarify whether this property should be removed
  orga?: string; //TODO: use it as a name property for organizer
  imageOrga?: string; //TODO: use it as a image property for organizer
  location?: string;
  latitude?: number | null; // TODO: clarify whether this property should be removed
  longitude?: number | null; // TODO: clarify whether this property should be removed
};

export type EngagementsResponse = {
  totalResults: number;
  engagements: Engagement[];
};

export type EngagementsParameters = {
  limit: number;
  offset: number;
  latitude?: number;
  longitude?: number;
  radius?: Radius;
  location: string;
  categories?: string[];
};
