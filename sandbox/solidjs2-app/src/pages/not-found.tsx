import { useLocation } from "@solidjs/router";

import { Template } from "../components/template";

export default function NotFoundPage() {
  const location = useLocation();

  return (
    <Template title="Page not found!">
      <div>Page {location.pathname} does not exist</div>
    </Template>
  );
}
