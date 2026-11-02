import { $params, $search, navigate } from "vynn-router";

import { Template } from "../components/template";

export function Params() {
  const handleParamIncrement = () => {
    const nextParamID = Number($params.id) + 1;
    const nextSearchID = Number($search.id) + 1;
    navigate("/params/" + nextParamID + "?id=" + nextSearchID);
  };

  const handleParamDecrement = () => {
    const nextParamID = Number($params.id) - 1;
    const nextSearchID = Number($search.id) - 1;
    navigate("/params/" + nextParamID + "?id=" + nextSearchID);
  };

  return (
    <Template title="Route Params">
      <h1>Page ID: {$params.id}</h1>
      <h1>Search ID: {$search.id}</h1>
      <button class="btn" onClick={handleParamDecrement}>
        Decrement
      </button>
      <button class="btn" onClick={handleParamIncrement}>
        Increment
      </button>
    </Template>
  );
}
