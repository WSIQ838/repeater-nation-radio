// Amateur Radio band/frequency references used by the HAM logbook and POTA tools.
// These are operating ranges, not frequency-allocation/coordination guarantees.
// Users are responsible for operating within the privileges of their license.
export const HAM_BANDS = [
  { id: '6m', name: '6 meters', range: '50–54 MHz', min: 50, max: 54 },
  { id: '2m', name: '2 meters', range: '144–148 MHz', min: 144, max: 148 },
  { id: '1.25m', name: '1.25 meters', range: '222–225 MHz', min: 222, max: 225 },
  { id: '70cm', name: '70 centimeters', range: '420–450 MHz', min: 420, max: 450 },
  { id: '33cm', name: '33 centimeters', range: '902–928 MHz', min: 902, max: 928 },
];

export const HAM_BAND_OPTIONS = HAM_BANDS.map((band) => ({
  value: band.id,
  label: `${band.name} (${band.range})`,
}));

export const getHamBand = (frequency) => {
  const f = Number(frequency);
  return HAM_BANDS.find((band) => f >= band.min && f <= band.max) || null;
};
