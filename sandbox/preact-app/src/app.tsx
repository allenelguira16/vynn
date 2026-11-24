import "./main.css";
import { ErrorBoundary, LocationProvider, Route, Router, lazy } from "preact-iso";

import LayoutPage from "./pages/layout";
import RootPage from "./pages/page";
import NotFoundPage from "./pages/not-found";
import { NameProvider } from "./context/name-context";

const LazyPage = lazy(() => import("./pages/lazy/page"));
const FormsPage = lazy(() => import("./pages/forms/page"));
const ContextPage = lazy(() => import("./pages/context/page"));
const DropdownListPage = lazy(() => import("./pages/dropdown-list/page"));
const ComponentErrorPage = lazy(() => import("./pages/component-error/page"));
const NonAsyncSuspensePage = lazy(() => import("./pages/non-async-suspense/page"));
const StackedSuspensePage = lazy(() => import("./pages/stacked-suspense/page"));
const PokeDexPage = lazy(() => import("./pages/poke-dex/page"));
const PokeDexAwaitPage = lazy(() => import("./pages/poke-dex-await/page"));
const RedirectPage = lazy(() => import("./pages/redirect/page"));
const ParamsPage = lazy(() => import("./pages/params/page"));

function RootRoute() {
  return <LayoutPage><RootPage /></LayoutPage>;
}

export default function App() {
  return (
    <LocationProvider>
      <NameProvider>
        <ErrorBoundary onError={(error) => console.error("Preact route error:", error)}>
          <Router>
            <Route path="/" component={RootRoute} />
            <Route path="/lazy" component={() => <LayoutPage><LazyPage /></LayoutPage>} />
            <Route path="/forms" component={() => <LayoutPage><FormsPage /></LayoutPage>} />
            <Route path="/context" component={() => <LayoutPage><ContextPage /></LayoutPage>} />
            <Route path="/dropdown-list" component={() => <LayoutPage><DropdownListPage /></LayoutPage>} />
            <Route path="/component-error" component={() => <LayoutPage><ComponentErrorPage /></LayoutPage>} />
            <Route path="/non-async-suspense" component={() => <LayoutPage><NonAsyncSuspensePage /></LayoutPage>} />
            <Route path="/stacked-suspense" component={() => <LayoutPage><StackedSuspensePage /></LayoutPage>} />
            <Route path="/poke-dex" component={() => <LayoutPage><PokeDexPage /></LayoutPage>} />
            <Route path="/poke-dex-await" component={() => <LayoutPage><PokeDexAwaitPage /></LayoutPage>} />
            <Route path="/redirect" component={RedirectPage} />
            <Route path="/params/:id" component={() => <LayoutPage><ParamsPage /></LayoutPage>} />
            <Route default component={() => <LayoutPage><NotFoundPage /></LayoutPage>} />
          </Router>
        </ErrorBoundary>
      </NameProvider>
    </LocationProvider>
  );
}
