import { Component } from 'react';

// Catches errors from non-critical floating widgets (e.g. RadioWidget) so a
// failed lazy import or runtime error in the widget never takes down the
// entire app. Renders null on error — the widget just disappears until the
// next successful mount.
export default class WidgetErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    // "Failed to fetch dynamically imported module" is a transient Vite
    // dev-server issue (stale module URL after HMR/restart) — not worth
    // cluttering the console as a real error.
    const msg = String(error?.message || '');
    if (!msg.includes('Failed to fetch dynamically imported module')) {
      console.error('[WidgetErrorBoundary]', error);
    }
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}