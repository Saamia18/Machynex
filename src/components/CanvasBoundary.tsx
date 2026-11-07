import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

/**
 * Error boundary around the WebGL <Canvas>. If WebGL is disabled or context
 * creation fails, show a flat panel instead of a white screen. The simulator
 * and dashboard do not depend on the canvas, so they keep running.
 */
export class CanvasBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('[CanvasBoundary] 3D view disabled:', error.message, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="status" className="flex h-full w-full items-center justify-center bg-zinc-950 p-6">
        <div className="max-w-sm rounded-md border border-zinc-800 bg-[#111317] px-4 py-3 text-center text-sm text-zinc-300">
          3D view unavailable on this device. Telemetry and controls still work.
        </div>
      </div>
    );
  }
}
