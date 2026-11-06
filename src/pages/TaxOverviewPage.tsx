import React from 'react';
import { Navigate } from 'react-router-dom';

/** Keep old bookmarks on the authoritative tax preparation workspace. */
export default function TaxOverviewPage() {
  return <Navigate to="/ird-reports" replace />;
}
