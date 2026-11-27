import { useLocation, useNavigate } from "react-router";
import { Template } from "./template";

const pages = [
  { path: "/", label: "All" },
  { path: "/lazy", label: "Lazy" },
  { path: "/forms", label: "Forms" },
  { path: "/contexts", label: "Contexts" },
  { path: "/dropdown-list", label: "Dropdown Lists" },
  { path: "/component-error", label: "Component Error" },
  { path: "/non-async-suspense", label: "Non Async Suspense" },
  { path: "/stacked-suspense", label: "Stacked Suspense" },
  { path: "/poke-dex", label: "PokeDex List" },
  { path: "/poke-dex-await", label: "PokeDex List with Await" },
  { path: "/rows", label: "1,000 Rows" },
  { path: "/redirect", label: "Redirect" },
  { path: "/params/1?id=1", label: "Params" },
];

export function ButtonPageList() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <Template title="Pages">
      <ul className="flex flex-col gap-2">
        {pages.map((page) => {
          const isParams = page.path.startsWith("/params/");
          const active =
            location.pathname === page.path ||
            (isParams && location.pathname.startsWith("/params/"));

          return (
            <li key={page.path}>
              <button
                className="btn"
                onClick={() => navigate(page.path)}
                disabled={active}
                type="button"
              >
                {page.label}
              </button>
            </li>
          );
        })}
      </ul>
    </Template>
  );
}
