import { useLocation } from "preact-iso";

const pages = [
  { label: "All", path: "/" },
  { label: "Lazy", path: "/lazy" },
  { label: "Forms", path: "/forms" },
  { label: "Context", path: "/context" },
  { label: "Dropdown Lists", path: "/dropdown-list" },
  { label: "Component Error", path: "/component-error" },
  { label: "Non Async Suspense", path: "/non-async-suspense" },
  { label: "Stacked Suspense", path: "/stacked-suspense" },
  { label: "PokeDex List", path: "/poke-dex" },
  { label: "PokeDex List with Await", path: "/poke-dex-await" },
  { label: "Redirect", path: "/redirect" },
  { label: "Params", path: "/params/1?id=1", activePath: "/params" },
];

export function ButtonPageList() {
  const location = useLocation();

  return (
    <ul class="menu bg-base-200 rounded-box gap-2 w-full">
      {pages.map(({ label, path, activePath }) => {
        const active =
          location.path === (activePath ?? path) ||
          (activePath === "/params" && location.path.startsWith("/params/"));

        return (
          <li key={label}>
            <a href={path} class={active ? "menu-active" : undefined}>
              {label}
            </a>
          </li>
        );
      })}
      <li>{"<div>Escaped HTML</div>"}</li>
    </ul>
  );
}
