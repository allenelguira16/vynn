import { useLocation, useNavigate, useParams } from "react-router";
import { Template } from "../components/template";

export default function ParamsPage() {
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const search = new URLSearchParams(location.search);

  const handleParamIncrement = () => {
    const nextParamId = Number(params.id) + 1;
    const nextSearchId = Number(search.get("id")) + 1;
    navigate("/params/" + nextParamId + "?id=" + nextSearchId);
  };

  const handleParamDecrement = () => {
    const nextParamId = Number(params.id) - 1;
    const nextSearchId = Number(search.get("id")) - 1;
    navigate("/params/" + nextParamId + "?id=" + nextSearchId);
  };

  return (
    <Template title="Route Params">
      <h1>Page ID: {params.id}</h1>
      <h1>Search ID: {search.get("id")}</h1>
      <div className="flex gap-2">
        <button className="btn" onClick={handleParamDecrement} type="button">Decrement</button>
        <button className="btn" onClick={handleParamIncrement} type="button">Increment</button>
      </div>
    </Template>
  );
}
