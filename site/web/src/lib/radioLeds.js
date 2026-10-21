// Shared between RadioWidget (renders LEDs) and RadioLayoutEditor (places
// them) so both stay in sync without either importing the other's module.
export const LED_MODES = [
  { value: 'transmitting', label: 'Transmitting (TX)' },
  { value: 'receiving', label: 'Receiving (RX)' },
  { value: 'active', label: 'Transmitting or receiving' },
  { value: 'listening', label: 'Connected (listening, transmitting, or receiving)' },
  { value: 'connecting', label: 'Connecting' },
  { value: 'error', label: 'Error / disconnected' },
];

export function isLedLit(mode, status) {
  switch (mode) {
    case 'transmitting': return status === 'transmitting';
    case 'receiving': return status === 'receiving';
    case 'active': return status === 'transmitting' || status === 'receiving';
    case 'listening': return status === 'listening' || status === 'transmitting' || status === 'receiving';
    case 'connecting': return status === 'connecting';
    case 'error': return status === 'error' || status === 'disconnected';
    default: return false;
  }
}

export const LED_DEFAULT = {
  left: 50, top: 50, width: 4, height: 4, mode: 'transmitting',
  onColor: '#ef4444', onColorOpacity: 100, offColor: '#2a2a2a', offColorOpacity: 100, glow: true,
};
