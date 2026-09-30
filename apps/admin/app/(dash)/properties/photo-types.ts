export const PHOTO_BUCKET = "property-photos";

/** One entry of properties.photos; the first is the cover. */
export interface Photo {
  path: string;
  url: string;
}
