import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { LoadingState } from "./components/common/States";
import { AppLayout } from "./components/layout/AppLayout";
import { NotFoundPage } from "./pages/NotFoundPage";

const OverviewPage = lazy(() =>
  import("./pages/OverviewPage").then(({ OverviewPage: page }) => ({
    default: page,
  })),
);
const PipelineExecutionPage = lazy(() =>
  import("./pages/PipelineExecutionPage").then(
    ({ PipelineExecutionPage: page }) => ({ default: page }),
  ),
);
const DataQualityPage = lazy(() =>
  import("./pages/DataQualityPage").then(({ DataQualityPage: page }) => ({
    default: page,
  })),
);
const PerformancePage = lazy(() =>
  import("./pages/PerformancePage").then(({ PerformancePage: page }) => ({
    default: page,
  })),
);
const DataLineagePage = lazy(() =>
  import("./pages/DataLineagePage").then(({ DataLineagePage: page }) => ({
    default: page,
  })),
);
const RunHistoryPage = lazy(() =>
  import("./pages/RunHistoryPage").then(({ RunHistoryPage: page }) => ({
    default: page,
  })),
);
const ReportsPage = lazy(() =>
  import("./pages/ReportsPage").then(({ ReportsPage: page }) => ({
    default: page,
  })),
);

function LazyPage({ children, label }: { children: ReactNode; label: string }) {
  return (
    <Suspense fallback={<LoadingState label={`Loading ${label}...`} />}>
      {children}
    </Suspense>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route
          element={
            <LazyPage label="Overview">
              <OverviewPage />
            </LazyPage>
          }
          path="/"
        />
        <Route
          element={
            <LazyPage label="Pipeline Execution">
              <PipelineExecutionPage />
            </LazyPage>
          }
          path="/pipeline"
        />
        <Route
          element={
            <LazyPage label="Data Quality">
              <DataQualityPage />
            </LazyPage>
          }
          path="/data-quality"
        />
        <Route
          element={
            <LazyPage label="Performance Analytics">
              <PerformancePage />
            </LazyPage>
          }
          path="/performance"
        />
        <Route
          element={
            <LazyPage label="Data Lineage">
              <DataLineagePage />
            </LazyPage>
          }
          path="/lineage"
        />
        <Route
          element={
            <LazyPage label="Run History">
              <RunHistoryPage />
            </LazyPage>
          }
          path="/history"
        />
        <Route
          element={
            <LazyPage label="Reports Center">
              <ReportsPage />
            </LazyPage>
          }
          path="/reports"
        />
        <Route element={<NotFoundPage />} path="/404" />
        <Route element={<Navigate replace to="/404" />} path="*" />
      </Route>
    </Routes>
  );
}
