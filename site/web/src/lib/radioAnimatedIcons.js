import { Battery, Bluetooth, LocateFixed, RadioTower, Satellite, ScanLine, Signal, Wifi } from 'lucide-react';

export const RADIO_ANIMATED_ICON_DEFS = [
  { value: 'gps', label: 'GPS / Location', Icon: LocateFixed, animation: 'pulse' },
  { value: 'gps_search', label: 'GPS Searching', Icon: LocateFixed, animation: 'spin' },
  { value: 'satellite', label: 'Satellite', Icon: Satellite, animation: 'float' },
  { value: 'signal', label: 'Signal Strength', Icon: Signal, animation: 'pulse' },
  { value: 'wifi', label: 'Network / Wi-Fi', Icon: Wifi, animation: 'pulse' },
  { value: 'scan', label: 'Channel Scan', Icon: ScanLine, animation: 'spin' },
  { value: 'radio_tower', label: 'Radio Tower', Icon: RadioTower, animation: 'pulse' },
  { value: 'bluetooth', label: 'Bluetooth', Icon: Bluetooth, animation: 'pulse' },
  { value: 'battery', label: 'Battery', Icon: Battery, animation: 'pulse' },
];

export const RADIO_ANIMATIONS = [
  { value: 'none', label: 'No animation' },
  { value: 'pulse', label: 'Pulse' },
  { value: 'spin', label: 'Spin' },
  { value: 'float', label: 'Float' },
  { value: 'blink', label: 'Blink' },
];

export const RADIO_ANIMATED_ICON_DEFAULT = {
  left: 50,
  top: 50,
  width: 5,
  height: 7,
  icon: 'gps',
  animation: 'pulse',
  color: '#22c55e',
  opacity: 100,
  strokeWidth: 2,
  visible: true,
};

export function getRadioAnimatedIconDef(value) {
  return RADIO_ANIMATED_ICON_DEFS.find((item) => item.value === value) || RADIO_ANIMATED_ICON_DEFS[0];
}

export function getRadioAnimatedIconAnimation(value) {
  return RADIO_ANIMATIONS.find((item) => item.value === value)?.value || 'none';
}
