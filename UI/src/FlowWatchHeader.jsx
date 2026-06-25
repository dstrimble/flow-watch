import React from "react";
import 'bootstrap/dist/css/bootstrap.min.css';

function FlowWatchHeader() {
  return (
    <div className="container pt-2 pb-0 text-center" style={{ marginBottom: 0 }}>
      <a href="/">
        <img src="/images/flow-watch.jpeg" alt="Flow Watch" style={{ maxWidth: 120, marginBottom: 0, borderRadius: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.10)' }} />
      </a>
      <h1 className="display-5" style={{ marginBottom: 0 }}>Flow Watch</h1>
    </div>
  );
}

export default FlowWatchHeader;
