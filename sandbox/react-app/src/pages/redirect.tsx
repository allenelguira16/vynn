import { useEffect } from "react";
import { useNavigate } from "react-router";

export default function RedirectPage() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate("/params/1?id=1", { replace: true });
  }, [navigate]);

  return <div>Redirecting...</div>;
}
