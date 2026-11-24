import { useRoute, useLocation } from "preact-iso";
import { Template } from "../../components/template";

export default function ParamsPage() {
  const route = useRoute();
  const location = useLocation();
  const pageId = Number(route.params.id ?? 1);
  const searchId = Number(location.query.id ?? 1);

  const handleParamIncrement = () => {
    location.route("/params/" + (pageId + 1) + "?id=" + (searchId + 1));
  };

  const handleParamDecrement = () => {
    location.route("/params/" + (pageId - 1) + "?id=" + (searchId - 1));
  };

  return (
    <Template title="Route Params">
      <h1>Page ID: {route.params.id}</h1>
      <h1>Search ID: {location.query.id}</h1>
      <button class="btn" onClick={handleParamDecrement}>
        Decrement
      </button>
      <button class="btn" onClick={handleParamIncrement}>
        Increment
      </button>
    </Template>
  );
}
