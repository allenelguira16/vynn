import { $location } from "vynn-router";

import { Template } from "../../components/template";

export default function NotFoundPage() {
  console.log("ah wala");

  return (
    <Template title="Page not found!">
      <div>Page {$location.pathname} does not exist</div>
    </Template>
  );
}
