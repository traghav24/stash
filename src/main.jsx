import { Component } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

// If something breaks, show a way back instead of a blank window.
class SafetyNet extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error) {
    console.error("[stash] UI crashed:", error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="empty">
        <h2>Something tripped</h2>
        <p>Your saves are safe in ~/Stash. This screen hit a bug.</p>
        <p className="hint">{String(this.state.error.message || this.state.error)}</p>
        <button className="primary" onClick={() => location.reload()}>Try again</button>
      </div>
    );
  }
}

createRoot(document.getElementById("root")).render(
  <SafetyNet>
    <App />
  </SafetyNet>
);
