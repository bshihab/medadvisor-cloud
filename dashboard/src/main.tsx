import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Catch any render-time crash and show a recovery UI instead of a blank white
// page (React unmounts the whole tree on an uncaught render error).
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error("Dashboard crashed:", error);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ maxWidth: 420, margin: "96px auto", padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
          <p style={{ marginBottom: 16 }}>Something went wrong loading this page.</p>
          <button
            onClick={() => location.reload()}
            style={{ padding: "8px 16px", borderRadius: 8, cursor: "pointer" }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
