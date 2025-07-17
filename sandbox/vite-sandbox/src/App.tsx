import { Router } from "vynn-router";

import { routes } from "./routes";

export const App = () => {
  return (
    <>
      <Router routes={routes} />
    </>
  );
};
