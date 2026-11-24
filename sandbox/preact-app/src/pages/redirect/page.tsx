import { useEffect } from "preact/hooks";
import { useLocation } from "preact-iso";

export default function RedirectPage() {
  const location = useLocation();

  useEffect(() => {
    location.route("/params/1?id=1", true);
  }, []);

  return <div>I'm a redirecting page and shouldn't be seen in the browser</div>;
}
