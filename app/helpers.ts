// Temporary solution to filter out numbers and city names that contain special characters
// TODO: remove it once Voltastics fix their API cities response
export function isValidCityName(city: string) {
  return Boolean(city?.match(/^[A-Za-zäöüÄÖÜß\s]*$/));
}
