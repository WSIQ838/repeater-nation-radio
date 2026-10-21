import { createPortal } from 'react-dom';

// Renders a hand-built pop-up (a fixed full-screen backdrop) at the end of
// <body>, like the Radix dialogs do. Inside a page it would sit in the page's
// own layer, under the site header and sidebar, whatever its z-index.
export default function BodyPortal({ children }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}
