import { useLocation } from "preact-iso";
import { Template } from "../components/template";

export default function NotFoundPage() {
  const location = useLocation();

  return (
    <Template title="Page not found!">
      <div>Page {location.path} does not exist</div>
    </Template>
  );
}
