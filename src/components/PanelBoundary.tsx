import { Component } from 'react';
import type { ReactNode } from 'react';

/** A failed optional panel must never replace the tree or its close button. */
export class PanelBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div className="panel-state" role="alert">
      <h2>加载失败</h2>
      <p>请关闭后重试，或重新加载页面。</p>
      {/* React.lazy caches rejected imports; a page reload really retries the chunk. */}
      <button className="primary-button" onClick={() => window.location.reload()}>重新加载</button>
    </div>;
  }
}
