export const sortCitiesAlphabetically = (a: string, b: string) =>
  Number(/^\d/.test(a)) - Number(/^\d/.test(b)) ||
  Number(/^"/.test(a)) - Number(/^"/.test(b)) ||
  a.localeCompare(b, "de-DE", { numeric: true, sensitivity: "base" });
