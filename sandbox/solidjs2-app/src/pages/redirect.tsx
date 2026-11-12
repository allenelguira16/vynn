import { useNavigate } from "@solidjs/router";
import { onSettled } from "solid-js";

export default function RedirectPage() {
  const navigate = useNavigate();

  onSettled(() => {
    navigate("/params/1?id=1", { replace: true });
  });

  return <div>Redirecting...</div>;
}
