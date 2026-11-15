/**
 * Opaque menu surface, the same tokens as Area Card's pin menu
 * (`.area-card-pin-menu`). `--card-background-color` is preferred over
 * `--ha-card-background`, which this card also uses as a translucent scrim.
 */
export const POPUP_SURFACE =
  "var(--card-background-color, var(--primary-background-color, var(--ha-card-background)))";

export const popupSurfaceCss = `
  border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
  border-radius: 12px;
  background: ${POPUP_SURFACE};
  color: var(--primary-text-color);
  box-shadow: var(--ha-card-box-shadow, 0 4px 16px rgba(0, 0, 0, 0.28));
`;
