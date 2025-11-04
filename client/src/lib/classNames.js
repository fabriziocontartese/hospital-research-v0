export const cn = (...values) =>
  values
    .flat()
    .filter(Boolean)
    .join(' ');
