import { Router } from "vynn-router";

import { routes } from "./routes";

export const App = ({ url }: { url: string }) => {
  return <Router url={url} routes={routes} />;
};
