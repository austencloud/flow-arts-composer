export const ASTRAL_FAN_BLADE_LED_COUNT = 30;
export const ASTRAL_FAN_SIDES_LED_COUNT = 36;
export const ASTRAL_FAN_LED_COUNT =
  ASTRAL_FAN_BLADE_LED_COUNT + ASTRAL_FAN_SIDES_LED_COUNT;

export function astralFanBladePoint(amount: number): { x: number; y: number } {
  const angle = Math.PI * amount;
  return {
    x: (0.4826 / 2 - 0.014) * Math.cos(angle),
    y: 0.04 + (0.28 - 0.014) * Math.sin(angle),
  };
}

export const ASTRAL_FAN_LED_POINTS = [
  ...Array.from({ length: ASTRAL_FAN_BLADE_LED_COUNT }, (_, index) =>
    astralFanBladePoint(index / (ASTRAL_FAN_BLADE_LED_COUNT - 1))
  ),
  ...[20, 48, 76, 104, 132, 160].flatMap((degrees) => {
    const angle = (degrees * Math.PI) / 180;
    const start = { x: 0.052 * Math.cos(angle), y: 0.052 * Math.sin(angle) };
    const target = astralFanBladePoint(degrees / 180);
    return Array.from({ length: 6 }, (_, index) => {
      const amount = 0.14 + index * 0.16;
      return {
        x: start.x * (1 - amount) + target.x * amount,
        y: start.y * (1 - amount) + target.y * amount,
      };
    });
  }),
];
