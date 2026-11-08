import { isActiveRoute, Link } from "vynn-router";

const pages = [
  { label: "All", path: "/" },
  { label: "Lazy", path: "/lazy" },
  { label: "Forms", path: "/forms" },
  { label: "Contexts", path: "/contexts" },
  { label: "Dropdown Lists", path: "/dropdown-list" },
  { label: "Component Error", path: "/component-error" },
  { label: "Non Async Suspense", path: "/non-async-suspense" },
  { label: "Stacked Suspense", path: "/stacked-suspense" },
  { label: "PokeDex List", path: "/poke-dex" },
  { label: "PokeDex List with Await", path: "/poke-dex-await" },
  { label: "Redirect", path: "/redirect" },
  { label: "Params", path: "/params/1?id=1", activePath: "/params/:id" },
];

export const ButtonPageList = () => {
  return (
    <ul class="menu bg-base-200 rounded-box gap-2 w-full">
      {pages.map(({ label, path, ...options }) => {
        const activePath = options.activePath ?? path;

        return (
          <li>
            <Link href={path} class={`${isActiveRoute(activePath) && "menu-active"}`}>
              {label}
            </Link>
          </li>
        );
      })}
      <li>{"<div>Escaped HTML</div>"}</li>
    </ul>
  );
};
