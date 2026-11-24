/** On phones a bar chart of 12 or more months shows every other month label, so the names don't run together. */
export const MOBILE_LABEL_THIN_FROM = 12;

/** True when the label at `index` is hidden on a phone (the bar and its tooltip stay). */
export const thinnedOnPhone = (index: number, count: number) => count >= MOBILE_LABEL_THIN_FROM && index % 2 === 1;
