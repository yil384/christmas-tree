import { Component } from 'react';
import type { ReactNode } from 'react';

/** A failed optional panel must never replace the tree or its close button. */
export class PanelBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div className="panel-state" role="alert">
      <h2>这部分礼物暂时没打开</h2>
      <p>可以重新打开礼物再试一次，<br />也可以先关掉这个窗口，继续欣赏圣诞树。</p>
      {/* React.lazy caches rejected imports; a page reload really retries the chunk. */}
      <button className="primary-button" onClick={() => window.location.reload()}>重新打开礼物</button>
    </div>;
  }
}
